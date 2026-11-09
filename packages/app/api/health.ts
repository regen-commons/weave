// Vercel serves functions only from api/ under the project root, which is this package.
// The handler lives in @weave/api; keep this file to one re-export.
export { GET } from "@weave/api/health";
