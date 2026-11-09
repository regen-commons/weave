// The one rule for which files hold secrets, shared by the command and edit policies.

export const SECRET_READ = "Do not read `.env` files. Use `.env.example`, or ask the person for the non-secret value you need.";

/** True for a `.env` file, an `.env.*` file or anything inside one, except `.env.example`. */
export function isSecretPath(path) {
  const segments = String(path).split(/[\\/]/);
  if (segments.at(-1) === ".env.example") return false;
  return segments.some((segment) => /^\.env(?:\..+)?$/.test(segment));
}
