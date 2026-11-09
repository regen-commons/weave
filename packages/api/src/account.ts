import { boundedJson, sessionCookies } from "./account-http.ts";
import { accountRuntime } from "./account-runtime.ts";
import { parseDocument, uuid } from "./account-contract.ts";
import { AccountError, type AccountProvider } from "./account-provider.ts";
interface Options {
  provider: AccountProvider | null;
  secureCookies?: boolean;
  fixture?: boolean;
  emailHintAvailable?: boolean;
}
export function createAccountHandlers({
  provider,
  secureCookies = true,
  fixture = false,
  emailHintAvailable = false,
}: Options) {
  const cookies = sessionCookies(secureCookies), cookie = cookies.session;
  const response = (status: number, body: unknown, setCookie?: string) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        ...(setCookie ? { "Set-Cookie": setCookie } : {}),
      },
    });
  const token = cookies.token;
  const failure = (error: unknown) => {
    const known = error instanceof AccountError ? error : new AccountError(503, "account_unavailable");
    return response(known.status, { error: known.code }, known.status === 401 ? cookie() : undefined);
  };
  return {
    async GET(request: Request) {
      if (!provider) return response(200, { available: false });
      try {
        const access = token(request);
        if (!access) return response(200, { available: true, signIn: "certified", fixture, user: null, items: [],
          ...(emailHintAvailable ? { emailHintAvailable } : {}) });
        const user = await provider.authorize(access);
        const params = new URL(request.url).searchParams,
          id = params.get("id");
        if (id) {
          if (!uuid(id)) throw new AccountError(400, "invalid_data");
          return response(200, { available: true, user, saved: await provider.load(access, id) });
        }
        const offset = Number(params.get("offset") ?? 0);
        if (!Number.isSafeInteger(offset) || offset < 0 || offset > 10000)
          throw new AccountError(400, "invalid_data");
        return response(200, {
          available: true,
          signIn: "certified",
          fixture,
          user,
          items: await provider.list(access, offset),
        });
      } catch (error) {
        return failure(error);
      }
    },
    async POST(request: Request) {
      try {
        if (request.headers.get("origin") !== new URL(request.url).origin)
          throw new AccountError(403, "origin_required");
        if (request.headers.get("content-type")?.split(";")[0]?.trim() !== "application/json")
          throw new AccountError(415, "json_required");
        if (!provider) throw new AccountError(503, "accounts_not_configured");
        const body = await boundedJson(request);
        if (!["sign_out", "save"].includes(String(body.action))) throw new AccountError(400, "invalid_action");
        const access = token(request);
        if (body.action === "sign_out") {
          if (access) await provider.signOut(access);
          const result = response(200, { signedOut: true }, cookie());
          result.headers.append("Set-Cookie", cookies.pending());
          return result;
        }
        if (!access) throw new AccountError(401, "sign_in_required");
        const user = await provider.authorize(access);
        if (body.action === "save") {
          if (!uuid(body.accountId)) throw new AccountError(400, "invalid_data");
          if (body.accountId !== user.id) throw new AccountError(409, "account_changed");
          if (
            !uuid(body.id) ||
            !uuid(body.requestId) ||
            !Number.isSafeInteger(body.expectedRevision) ||
            Number(body.expectedRevision) < 0 ||
            Number(body.expectedRevision) >= 2147483647
          )
            throw new AccountError(400, "invalid_data");
          let document;
          try {
            document = parseDocument(body.document);
          } catch (error) {
            throw new AccountError(
              400,
              error instanceof Error && error.message === "document_too_large"
                ? "document_too_large"
                : "invalid_data",
            );
          }
          return response(200, {
            saved: await provider.save(access, {
              id: body.id,
              requestId: body.requestId,
              expectedRevision: Number(body.expectedRevision),
              document,
            }),
          });
        }
        throw new AccountError(400, "invalid_action");
      } catch (error) {
        return failure(error);
      }
    },
  };
}
function configuredHandlers() {
  const runtime = accountRuntime();
  return createAccountHandlers({ provider: runtime?.provider ?? null, secureCookies: runtime?.secureCookies ?? true,
    emailHintAvailable: !!runtime?.emailHints });
}
export const GET = (request: Request) => configuredHandlers().GET(request);
export const POST = (request: Request) => configuredHandlers().POST(request);
