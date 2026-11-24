import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { IncomingMessage, ServerResponse, RequestListener } from "node:http";
import Provider, { errors } from "oidc-provider";
import { AuthStore } from "./store.ts";
import { certifiedAuthorizationFailure, oidcAdapter, type CertifiedClient } from "./adapters.ts";
import { identityClaims } from "./identity.ts";
import { createBridgeObserver, type BridgeExpiryReason, type BridgeObserver, type BridgeStartStage } from "./operations.ts";
import { recoveryOrigin, validateConfig, type BridgeConfig } from "./bridge-config.ts";
import { responseTiming } from "./server-timing.ts";
import { primeWithin } from "./oauth-prime.ts";
import type { SigningMaterial } from "./keys.ts";
export { validateConfig, type BridgeConfig } from "./bridge-config.ts";
const random = () => randomBytes(32).toString("base64url");
/**
 * Supabase Auth, the only relying party, expires its OAuth flow state 300 seconds after /authorize
 * (GoTrue's minimum). A later return to its callback is sent to the shared project's Site URL instead
 * of Weave. The bridge stops 20 seconds early to leave time for the remaining redirects to Supabase.
 * This normally keeps people off the Site URL; it is not a guarantee (see CERTIFIED.md).
 */
export const RELYING_PARTY_WINDOW_SECONDS = 280;
const epoch = () => Math.floor(Date.now() / 1000);
/** Records written before the deadline existed carry none; they keep the earlier behavior. */
const pastDeadline = (deadline: unknown) => typeof deadline === "number" && epoch() >= deadline;
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
  observer: BridgeObserver = createBridgeObserver(), loadedSigning?: SigningMaterial): Promise<RequestListener> {
  validateConfig(config);
  const signing = loadedSigning ?? await store.signingMaterial();
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
  // Weave's callback recovers the person's task from its own browser-bound state and offers sign-in again.
  const recovery = `${recoveryOrigin(config)}/api/sign-in?error=sign_in_expired`;
  const expired = (res: ServerResponse, reason: BridgeExpiryReason) => { observer.expired(reason); redirect(res, recovery); };
  type Interaction = Awaited<ReturnType<typeof provider.interactionDetails>>;
  /**
   * The first step of a login interaction: binds this browser to a Certified authorization request and
   * returns Certified's address. Shared by `/interaction/:uid` and by `/auth` itself (below). Sets the
   * browser cookie only once Certified's address is in hand. `stage` names the step for diagnostics.
   */
  async function startAtCertified(interaction: Interaction, res: ServerResponse, stage: (name: BridgeStartStage) => void): Promise<string> {
    const timing = responseTiming(res);
    // A deadline from a missing time would never pass, so an interaction without one cannot start.
    if (!Number.isSafeInteger(interaction.iat)) throw new Error("interaction_time_missing");
    const deadline = interaction.iat + RELYING_PARTY_WINDOW_SECONDS;
    const state = random();
    stage("browser_state");
    await timing.time("state", () => store.put("browser:at", state, { uid: interaction.uid, deadline }, 600));
    const emailHints = config.emailHints;
    const hint = emailHints?.open(interaction.params.login_hint);
    let email: string | undefined;
    if (hint && emailHints) {
      stage("email_hint");
      email = await store.withLock(`email-hint:${hint.id}`, async () => {
        if (await store.find("email-hint:used", hint.id)) return undefined;
        await store.put("email-hint:used", hint.id, { used: true }, emailHints.lifetimeSeconds);
        return hint.email;
      });
    }
    stage("oauth_authorize");
    // Costs nothing when the warm-up already readied Certified; otherwise it takes the place of the
    // request Certified would refuse for want of a nonce.
    const primeStarted = performance.now(), readiness = await primeWithin(certified.prime());
    timing.add("prime", performance.now() - primeStarted, readiness);
    let target: string;
    try { target = String(await timing.time("par", () => certified.authorize(state, email))); }
    catch (error) {
      // No browser will hold this state: drop its binding rather than leave it for its ten minutes.
      try { await store.remove("browser:at", state); } catch { /* It expires on its own; the failure to report is Certified's. */ }
      throw error;
    }
    setCookie(res, "at", state);
    return target;
  }
  /**
   * Answers `/auth` and its interaction's first step in one response (24 November 2026). oidc-provider
   * finishes `/auth` as always: it checks the request, saves the interaction, sets its `_interaction`
   * cookies and redirects to `/interaction/:uid`. Only then, for a login interaction of this client
   * without an email hint, this replaces that redirect with Certified's address, as `/interaction/:uid`
   * would have, and keeps every cookie oidc-provider set. The way back is unchanged: Certified returns to
   * `/at/callback`, which sends the browser to `/interaction/:uid/complete` with those cookies. A failure
   * before Certified is asked (reading the interaction, storing the binding) leaves oidc-provider's redirect
   * in place, so the browser takes the old two steps. A failure at Certified is reported and answered as
   * `/interaction/:uid` answers it, without asking Certified a second time.
   */
  provider.use(async (ctx, next) => {
    await next();
    const created = ctx.method === "GET" && ctx.oidc?.route === "authorization" && ctx.status === 303
      ? ctx.oidc.entities.Interaction : undefined;
    if (!created || ctx.response.get("Location") !== `${config.issuer}/interaction/${created.uid}`) return;
    const timing = responseTiming(ctx.res);
    let stage: BridgeStartStage | undefined;
    try {
      // The interaction as stored: the record `/interaction/:uid` would read, with its issue time, which
      // the copy in hand does not carry and the sign-in's deadline is counted from.
      const started = await provider.Interaction.find(created.uid);
      if (!started || started.params.client_id !== config.clientId || started.prompt.name !== "login" ||
          started.params.login_hint !== undefined) return;
      ctx.redirect(await startAtCertified(started, ctx.res, name => { stage = name; }));
      timing.add("interaction", 0, "joined");
    } catch (error) {
      if (stage === "oauth_authorize") {
        // Certified was asked and failed: report it once and answer as /interaction would, without a retry.
        observer.startFailure(certifiedAuthorizationFailure(error));
        observer.event("request_failed");
        ctx.remove("Location");
        ctx.status = 400;
        ctx.type = "application/json";
        ctx.body = { error: "sign_in_failed" };
        timing.add("interaction", 0, "failed");
        return;
      }
      // Not logged here: the browser goes on to `/interaction/:uid`, which tries again and reports its own failure.
      timing.add("interaction", 0, "separate");
    }
  });
  const callback = provider.callback();
  const oidcRoutes = /^\/(auth(?:\/[A-Za-z0-9_-]+)?|token|jwks|\.well-known\/openid-configuration|session\/end(?:\/(?:confirm|success))?)$/;
  return async (req, res) => {
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const timing = responseTiming(res);
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
      // Weave asks this while Sign In is on screen, so the press finds Certified's metadata and a DPoP
      // nonce already here. It names no one and starts nothing. It always answers 204; only its timing
      // labels say whether Certified was readied.
      if (url.pathname === "/warm" && req.method === "GET") {
        const started = performance.now(), outcome = await certified.prime();
        timing.add("prime", performance.now() - started, outcome);
        res.writeHead(204); return res.end();
      }
      if (url.pathname === "/at-jwks.json" && req.method === "GET") return json(res, 200, certified.jwks);
      if (url.pathname === "/at/callback" && req.method === "GET") {
        // A missing cookie or binding has expired or was already used. Either way it cannot finish here.
        const bindingId = cookie(req, `${prefix}at`);
        if (!bindingId) return expired(res, "cookie_missing");
        const binding = await store.take("browser:at", bindingId);
        setCookie(res, "at", "", 0);
        if (typeof binding?.uid !== "string") return expired(res, "state_gone");
        // Past the deadline, skip the Certified exchange: no identity is read for a flow Supabase will refuse.
        if (pastDeadline(binding.deadline)) return expired(res, "deadline");
        const result = await timing.time("exchange", () => certified.callback(url.searchParams));
        if (result.state !== bindingId) throw new Error("invalid_browser_state");
        identityClaims(result.subject);
        const ticket = random();
        await store.put("browser:resume", ticket, { uid: binding.uid, subject: result.subject, deadline: binding.deadline }, 60);
        setCookie(res, "resume", ticket, 60);
        return redirect(res, `${config.issuer}/interaction/${binding.uid}/complete?ticket=${ticket}`);
      }
      if (/^\/interaction\/[A-Za-z0-9_-]+(?:\/complete)?$/.test(url.pathname) && req.method === "GET") {
        const completing = url.pathname.endsWith("/complete");
        if (!completing) startStage = "interaction_details";
        let interaction: Awaited<ReturnType<typeof provider.interactionDetails>>;
        try { interaction = await provider.interactionDetails(req, res); }
        catch (error) {
          // The provider's interaction expired, its cookie is gone or its session changed hands, so this
          // attempt has nowhere to resume. The description is the provider's fixed text, never request data.
          if (error instanceof errors.SessionNotFound)
            return expired(res, error.error_description === "session principal changed" ? "principal_changed" : "interaction_gone");
          throw error;
        }
        if (interaction.params.client_id !== config.clientId) throw new Error("unexpected_client");
        if (completing) {
          const ticket = cookie(req, `${prefix}resume`);
          if (!ticket || url.searchParams.get("ticket") !== ticket) throw new Error("invalid_browser_state");
          const binding = await store.take("browser:resume", ticket);
          setCookie(res, "resume", "", 0);
          if (binding?.uid !== interaction.uid || interaction.prompt.name !== "login" || typeof binding.subject !== "string")
            throw new Error("invalid_browser_state");
          identityClaims(binding.subject);
          if (pastDeadline(binding.deadline)) return expired(res, "deadline");
          return await provider.interactionFinished(req, res, { login: { accountId: binding.subject } }, { mergeWithLastSubmission: false });
        }
        if (interaction.prompt.name === "login") {
          // Anchor to this interaction's authorization request, so revisiting this page cannot extend the
          // window. A replayed /auth request starts a new interaction and is not covered (see CERTIFIED.md).
          if (pastDeadline(interaction.iat + RELYING_PARTY_WINDOW_SECONDS)) return expired(res, "deadline");
          return redirect(res, await startAtCertified(interaction, res, name => { startStage = name; }));
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
