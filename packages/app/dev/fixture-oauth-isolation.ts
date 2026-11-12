import type { LoadEntry } from "./api-bridge.ts";

const disabled = () => Response.json({ error: "project_workspace_unavailable" }, {
  status: 503,
  headers: { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff" },
});

/** Fixture account sessions must never load or execute the real project OAuth runtime. */
export function isolateFixtureProjectOAuth(fixture: boolean, load: LoadEntry): LoadEntry {
  return async name => {
    if (fixture && name.startsWith("certified-project-")) {
      return { GET: disabled, POST: disabled, PUT: disabled, PATCH: disabled,
        DELETE: disabled, HEAD: disabled, OPTIONS: disabled };
    }
    return load(name);
  };
}
