#!/usr/bin/env bash
# Deploys the identity bridge (auth.regencommons.com, Vercel project weave-certified-preview) from the
# commit checked out here.
#
#   packages/api/scripts/deploy-bridge.sh            # a preview, to see that the function runs
#   packages/api/scripts/deploy-bridge.sh --prod     # a production deployment, not yet on the domain
#
# --prod stages a production deployment without moving auth.regencommons.com to it (--skip-domain). Check
# its own address, then `vercel promote <url>` moves the domain without rebuilding. Never promote a
# preview and never use the dashboard's Redeploy for this project: both rebuild on Vercel from the
# packages/api source, which is how the bridge once deployed with no function at all.
#
# It builds the bridge as Vercel Build Output (scripts/build-bridge.mjs) and uploads only that, with
# `vercel deploy --prebuilt`, so nothing depends on Vercel detecting server.ts. It changes no project
# setting, environment variable or domain, and never pulls the project's environment variables.
#
# Needs VERCEL_ORG_ID and VERCEL_PROJECT_ID for weave-certified-preview (the "orgId" and "projectId" in a
# .vercel/project.json linked to it, or `vercel project inspect weave-certified-preview`). The CLI reads
# them instead of a link, so nothing is written to the checkout.
set -euo pipefail

project="weave-certified-preview"
target="preview"
[ $# -le 1 ] || { echo "usage: $0 [--prod]" >&2; exit 2; }
case "${1:-}" in
  "") ;;
  --prod) target="production" ;;
  *) echo "usage: $0 [--prod]" >&2; exit 2 ;;
esac

if [[ ! "${VERCEL_PROJECT_ID:-}" =~ ^prj_[A-Za-z0-9]+$ || -z "${VERCEL_ORG_ID:-}" ]]; then
  echo "Set VERCEL_ORG_ID and VERCEL_PROJECT_ID for $project first." >&2
  exit 2
fi
repo="$(git -C "$(dirname "$0")" rev-parse --show-toplevel)"
cd "$repo"
# The deploy is the commit, not whatever happens to be in the working tree.
# Untracked files count too: one under src/ could be bundled.
if [ -n "$(git status --porcelain)" ]; then
  echo "Commit or set aside your changes first: the bridge deploys the checked-out commit." >&2
  exit 1
fi
commit="$(git rev-parse --short HEAD)"

echo "Checking the bridge at $commit"
bun install --frozen-lockfile
bun run --filter @weave/api typecheck
(cd packages/api && node --test src/certified-*.test.ts src/sign-in.test.ts)

stage="$repo/packages/api/.bridge-deploy"
rm -rf "$stage"
trap 'rm -rf "$stage"' EXIT
# The project's Root Directory is packages/api. A prebuilt upload reads .vercel/output from where it
# runs, and the CLI checks that the Root Directory exists there, so the stage mirrors it.
mkdir -p "$stage/packages/api"
node packages/api/scripts/build-bridge.mjs "$stage"

cd "$stage"
flags=(--prebuilt --yes --meta "commit=$commit")
[ "$target" = production ] && flags+=(--prod --skip-domain)
url="$(vercel deploy "${flags[@]}")"
echo "Deployed $commit to $target: $url"

cat <<EOF
The deployment answers on its own address, which the bridge refuses (it serves only auth.regencommons.com),
so first check that the bridge itself answered, not Vercel. Ask it for /client-metadata.json (with
\`vercel curl\` if it sits behind Vercel's login): 421 with Cache-Control: no-store, or 503
{"error":"sign_in_unavailable"} where the environment has no issuer, means the function runs. Vercel's own
404 NOT_FOUND means no function was deployed: stop.
EOF
if [ "$target" = production ]; then
  cat <<EOF
Then move the domain to it, without a rebuild:
  vercel promote $url
and check production; if either answer is wrong, \`vercel rollback\` to the previous deployment:
  curl -sS -o /dev/null -w '%{http_code}\n' https://auth.regencommons.com/client-metadata.json   # 200
  curl -sS -D - -o /dev/null https://auth.regencommons.com/warm                                  # 204 with Server-Timing
EOF
fi
