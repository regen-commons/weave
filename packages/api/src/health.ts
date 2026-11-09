// GET /api/health reports that the API is deployed and answering, and which commit
// is live. It reads no data and holds no secrets.
export function GET(): Response {
  return Response.json(
    { status: "ok", service: "weave-api", commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
