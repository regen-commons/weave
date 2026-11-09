import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import Provider from "oidc-provider";
import { AuthStore } from "./store.ts";
import { certifiedAuthorizationFailure, oidcAdapter, type CertifiedClient } from "./adapters.ts";
import { identityClaims } from "./identity.ts";
import { createBridgeObserver, type BridgeObserver, type BridgeStartStage } from "./operations.ts";
import type { certifiedEmailHints } from "./email-hint.ts";

export interface BridgeConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** A local test may use loopback HTTP. Never deploy this option. */
  loopbackTest?: boolean;
  emailHints?: ReturnType<typeof certifiedEmailHints>;
}
export function validateConfig(config: BridgeConfig): void {
  const issuer = new URL(config.issuer), redirect = new URL(config.redirectUri);
  const local = (url: URL) => config.loopbackTest === true && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (issuer.origin !== config.issuer || issuer.username || issuer.password || redirect.username || redirect.password || redirect.hash ||
      (issuer.protocol !== "https:" && !local(issuer)) || (redirect.protocol !== "https:" && !local(redirect)) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(config.clientId) || config.clientSecret.length < 32)
    throw new Error("invalid_bridge_configuration");
}
const random = () => randomBytes(32).toString("base64url");
function cookie(req: IncomingMessage, name: string): string | undefined {
  const values = (req.headers.cookie ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(`${name}=`));
  const value = values.length === 1 ? values[0]!.slice(name.length + 1) : undefined;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}
function json(res: ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" }); res.end(JSON.stringify(value));
}
function redirect(res: ServerResponse, target: string) { res.writeHead(303, { Location: target }); res.end(); }

/** Native Node service boundary for oidc-provider; no Vercel route is enabled here. */
export async function createBridge(config: BridgeConfig, store: AuthStore, certified: CertifiedClient,
  observer: BridgeObserver = createBridgeObserver()): Promise<RequestListener> {
  validateConfig(config);
  const signing = await store.signingMaterial();
  // A local Supabase callback does not weaken an HTTPS issuer's ingress or cookies.
  const secure = new URL(config.issuer).protocol === "https:", prefix = secure ? "__Host-weave_" : "weave_test_";
  const setCookie = (res: ServerResponse, kind: string, value: string, age = 600) =>
    res.appendHeader("Set-Cookie", `${prefix}${kind}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${age}${secure ? "; Secure" : ""}`);
  const provider = new Provider(config.issuer, {
    adapter: oidcAdapter(store),
    clients: [{ client_id: config.clientId, client_secret: config.clientSecret, redirect_uris: [config.redirectUri],
      response_types: ["code"], grant_types: ["authorization_code"], token_endpoint_auth_method: "client_secret_post" }],
    jwks: { keys: signing.oidc }, cookies: { keys: signing.cookies },
    scopes: ["openid"], claims: { openid: ["sub"] }, conformIdTokenClaims: false,
    features: { devInteractions: { enabled: false }, userinfo: { enabled: false } },
    ttl: { AuthorizationCode: 60, AccessToken: 3600, IdToken: 3600, Session: 3600, Interaction: 600, Grant: 3600 },
    pkce: { required: () => true },
    interactions: { url: (_ctx, interaction) => `${config.issuer}/interaction/${interaction.uid}` },
    findAccount: async (_ctx, subject) => ({ accountId: subject, claims: async () => identityClaims(subject) }),
    renderError: async ctx => { ctx.type = "application/json"; ctx.body = { error: "sign_in_failed" }; },
  });
  // The edge proxy must overwrite forwarded headers, not append caller-controlled values.
  provider.proxy = secure;
  provider.on("server_error", () => observer.event("provider_error"));
  const callback = provider.callback();
  const oidcRoutes = /^\/(auth(?:\/[A-Za-z0-9_-]+)?|token|jwks|\.well-known\/openid-configuration|session\/end(?:\/(?:confirm|success))?)$/;
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    let startStage: BridgeStartStage | undefined;
    try {
      if (req.headers.host !== new URL(config.issuer).host || (req.url?.length ?? 0) > 8192)
        return json(res, 400, { error: "invalid_request" });
      if (secure && req.headers["x-forwarded-proto"] !== "https") return json(res, 400, { error: "https_required" });
      if (req.headers["x-forwarded-host"] && req.headers["x-forwarded-host"] !== new URL(config.issuer).host)
        return json(res, 400, { error: "invalid_request" });
      const url = new URL(req.url ?? "/", config.issuer);
      if (url.origin !== config.issuer || /%2f|%5c|%2e/i.test(url.pathname)) return json(res, 400, { error: "invalid_request" });
      const contentLength = Number(req.headers["content-length"] ?? 0);
      if (!Number.isSafeInteger(contentLength) || contentLength < 0 || contentLength > 65536)
        return json(res, 413, { error: "request_too_large" });
      // Koa bounds form parsing too; reject streaming/chunked writes before delegation.
      if (req.method === "POST" && req.headers["transfer-encoding"]) return json(res, 411, { error: "length_required" });
      if (url.pathname === "/client-metadata.json" && req.method === "GET") return json(res, 200, certified.metadata);
      if (url.pathname === "/at-jwks.json" && req.method === "GET") return json(res, 200, certified.jwks);
      if (url.pathname === "/at/callback" && req.method === "GET") {
        const bindingId = cookie(req, `${prefix}at`);
        if (!bindingId) return json(res, 400, { error: "invalid_browser_state" });
        const binding = await store.take("browser:at", bindingId);
        setCookie(res, "at", "", 0);
        if (typeof binding?.uid !== "string") return json(res, 400, { error: "invalid_browser_state" });
        const result = await certified.callback(url.searchParams);
        if (result.state !== bindingId) throw new Error("invalid_browser_state");
        identityClaims(result.subject);
        const ticket = random();
        await store.put("browser:resume", ticket, { uid: binding.uid, subject: result.subject }, 60);
        setCookie(res, "resume", ticket, 60);
        return redirect(res, `${config.issuer}/interaction/${binding.uid}/complete?ticket=${ticket}`);
      }
      if (/^\/interaction\/[A-Za-z0-9_-]+(?:\/complete)?$/.test(url.pathname) && req.method === "GET") {
        const completing = url.pathname.endsWith("/complete");
        if (!completing) startStage = "interaction_details";
        const interaction = await provider.interactionDetails(req, res);
        if (interaction.params.client_id !== config.clientId) throw new Error("unexpected_client");
        if (completing) {
          const ticket = cookie(req, `${prefix}resume`);
          if (!ticket || url.searchParams.get("ticket") !== ticket) throw new Error("invalid_browser_state");
          const binding = await store.take("browser:resume", ticket);
          setCookie(res, "resume", "", 0);
          if (binding?.uid !== interaction.uid || interaction.prompt.name !== "login" || typeof binding.subject !== "string")
            throw new Error("invalid_browser_state");
          identityClaims(binding.subject);
          return await provider.interactionFinished(req, res, { login: { accountId: binding.subject } }, { mergeWithLastSubmission: false });
        }
        if (interaction.prompt.name === "login") {
          const state = random();
          startStage = "browser_state";
          await store.put("browser:at", state, { uid: interaction.uid }, 600);
          setCookie(res, "at", state);
          const emailHints = config.emailHints;
          const hint = emailHints?.open(interaction.params.login_hint);
          let email: string | undefined;
          if (hint && emailHints) {
            startStage = "email_hint";
            email = await store.withLock(`email-hint:${hint.id}`, async () => {
              if (await store.find("email-hint:used", hint.id)) return undefined;
              await store.put("email-hint:used", hint.id, { used: true }, emailHints.lifetimeSeconds);
              return hint.email;
            });
          }
          startStage = "oauth_authorize";
          return redirect(res, String(await certified.authorize(state, email)));
        }
        startStage = undefined;
        if (interaction.prompt.name === "consent") {
          const subject = interaction.session?.accountId;
          if (!subject) throw new Error("verified_identity_required");
          identityClaims(subject);
          // Only this fixed relying party and identity scope are supported.
          const grant = interaction.grantId ? await provider.Grant.find(interaction.grantId) :
            new provider.Grant({ accountId: subject, clientId: config.clientId });
          if (!grant) throw new Error("grant_missing");
          grant.addOIDCScope("openid");
          return await provider.interactionFinished(req, res, { consent: { grantId: await grant.save() } }, { mergeWithLastSubmission: true });
        }
        throw new Error("unsupported_interaction");
      }
      if (!oidcRoutes.test(url.pathname)) return json(res, 404, { error: "not_found" });
      if (!["GET", "POST"].includes(req.method ?? "")) return json(res, 405, { error: "method_not_allowed" });
      return callback(req, res);
    } catch (error) {
      if (startStage === "oauth_authorize") observer.startFailure(certifiedAuthorizationFailure(error));
      else if (startStage) observer.startFailure({ stage: startStage,
        error: startStage === "browser_state" || startStage === "email_hint" ? "state_store_failed" : "validation_failed" });
      observer.event("request_failed");
      if (!res.headersSent) json(res, 400, { error: "sign_in_failed" });
      else res.end();
    }
  };
}
