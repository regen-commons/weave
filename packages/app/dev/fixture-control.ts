/** Local fixture identities only. This module has no production API entry. */
import { sessionCookies } from "../../api/src/account-http.ts";
import { FIXTURE_ACCOUNT_ID, fixtureActor, fixtureSession } from "./account-fixture.ts";
import { FIXTURE_TEAM_ADMIN, FIXTURE_TEAM_EDITOR, FIXTURE_GROUP_MEMBER, FIXTURE_UNAVAILABLE, FIXTURE_PROJECT_STARTER, publishFixtureProject } from "./matching-fixture.ts";
const profiles = { viewer: FIXTURE_ACCOUNT_ID, editor: FIXTURE_TEAM_EDITOR, admin: FIXTURE_TEAM_ADMIN,
  member: FIXTURE_GROUP_MEMBER, unavailable: FIXTURE_UNAVAILABLE, creator: FIXTURE_PROJECT_STARTER } as const;
export async function fixtureControl(request: Request) {
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return new Response(null, { status: 404 });
  const headers = { "Cache-Control": "no-store", "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff" };
  if (request.method === "GET" && ["maearth", "certified"].includes(url.searchParams.get("editor") ?? ""))
    return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>External editor fixture</title><h1>External editor fixture</h1><p>This stands in for the chosen editor. No draft was sent and no public project is created.</p><form method="post" action="/__fixture"><input type="hidden" name="action" value="publish-project"><button>Publish synthetic project and return</button></form><p><a href="/your-initiatives">Return without publishing</a></p></html>`, { headers });
  if (request.method === "GET") return new Response(`<!doctype html><html lang="en"><meta name="viewport" content="width=device-width"><title>Local fixture controls</title><h1>Local fixture controls</h1><p>Synthetic accounts only. These controls are absent from deployed builds.</p><form method="post" action="/__fixture"><label>Account <select name="profile">${Object.keys(profiles).map(profile => `<option>${profile}</option>`).join("")}</select></label><button>Open fixture account</button></form></html>`, { headers });
  if (request.method !== "POST" || request.headers.get("origin") !== url.origin) return new Response(null, { status: 403 });
  if (Number(request.headers.get("content-length") ?? 0) > 1024) return new Response(null, { status: 413 });
  const body = new URLSearchParams(await request.text());
  if (body.get("action") === "publish-project") {
    try { publishFixtureProject(fixtureActor(sessionCookies(false).token(request) ?? "").userId); }
    catch { return new Response(null, { status: 403 }); }
    return new Response(null, { status: 303, headers: { ...headers, Location: "/your-initiatives" } });
  }
  const profile = body.get("profile");
  if (!profile || !Object.hasOwn(profiles, profile)) return new Response(null, { status: 400 });
  return new Response(null, { status: 303, headers: { ...headers, Location: "/your-initiatives",
    "Set-Cookie": sessionCookies(false).session(fixtureSession(profiles[profile as keyof typeof profiles]), 3600) } });
}
