import type { certifiedEmailHints } from "./email-hint.ts";

/** Weave's public address. A sign-in the bridge cannot finish returns to its callback there. */
export const WEAVE_APP_ORIGIN = "https://weave.regencommons.com";
/** The one Weave origin this bridge returns unfinishable sign-ins to, whichever Weave started them. */
export const recoveryOrigin = (config: BridgeConfig): string => config.appOrigin ?? WEAVE_APP_ORIGIN;

export interface BridgeConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** The Weave origin for unfinishable sign-ins. Defaults to WEAVE_APP_ORIGIN. */
  appOrigin?: string;
  /** A local test may use loopback HTTP. Never deploy this option. */
  loopbackTest?: boolean;
  emailHints?: ReturnType<typeof certifiedEmailHints>;
}

/** Configuration checks must also run without loading the OIDC server. */
export function validateConfig(config: BridgeConfig): void {
  const issuer = new URL(config.issuer), redirect = new URL(config.redirectUri);
  const app = new URL(recoveryOrigin(config));
  const local = (url: URL) => config.loopbackTest === true && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (issuer.origin !== config.issuer || issuer.username || issuer.password || redirect.username || redirect.password || redirect.hash ||
      (issuer.protocol !== "https:" && !local(issuer)) || (redirect.protocol !== "https:" && !local(redirect)) ||
      app.origin !== recoveryOrigin(config) || (app.protocol !== "https:" && !local(app)) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(config.clientId) || config.clientSecret.length < 32)
    throw new Error("invalid_bridge_configuration");
}
