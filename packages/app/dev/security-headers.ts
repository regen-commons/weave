import { readFileSync } from "node:fs";
/** Local production proof uses the deployed header definitions, without a second CSP copy. */
export function previewSecurityHeaders(): Record<string, string> {
  const config: unknown = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
  if (!config || typeof config !== "object" || !("headers" in config) || !Array.isArray(config.headers))
    throw new Error("Missing production header configuration");
  const result: Record<string, string> = {};
  const rules: unknown[] = config.headers;
  for (const rule of rules) {
    if (
      !rule ||
      typeof rule !== "object" ||
      !("source" in rule) ||
      rule.source !== "/(.*)" ||
      !("headers" in rule) ||
      !Array.isArray(rule.headers)
    )
      continue;
    const headers: unknown[] = rule.headers;
    for (const header of headers)
      if (
        header &&
        typeof header === "object" &&
        "key" in header &&
        "value" in header &&
        typeof header.key === "string" &&
        typeof header.value === "string"
      )
        result[header.key] = header.value;
  }
  if (!result["Content-Security-Policy"]) throw new Error("Missing production CSP");
  return result;
}
