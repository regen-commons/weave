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

/** Configuration checks must also run without loading the OIDC server. */
export function validateConfig(config: BridgeConfig): void {
  const issuer = new URL(config.issuer), redirect = new URL(config.redirectUri);
  const local = (url: URL) => config.loopbackTest === true && url.protocol === "http:" && ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (issuer.origin !== config.issuer || issuer.username || issuer.password || redirect.username || redirect.password || redirect.hash ||
      (issuer.protocol !== "https:" && !local(issuer)) || (redirect.protocol !== "https:" && !local(redirect)) ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(config.clientId) || config.clientSecret.length < 32)
    throw new Error("invalid_bridge_configuration");
}
