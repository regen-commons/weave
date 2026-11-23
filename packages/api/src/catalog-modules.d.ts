// The fund catalog's own code and data sit at the repository root, where the live site also runs them.
// The app declares the same module for the parts it uses, and its build reads this package's sources, so
// this package declares no exports here: agent-tools.ts names the ones it reads.
declare module "*dist/domain.mjs";
declare module "*dist/matching.mjs";
declare module "*dist/storage.mjs";
declare module "*dist/data/funders.json" {
  const catalog: unknown;
  export default catalog;
}
declare module "*dist/data/eligibility-rules.json" {
  const rules: unknown;
  export default rules;
}
declare module "*dist/data/program-conditions.json" {
  const conditions: unknown;
  export default conditions;
}
