import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin } from "vite";
import { parseBundle } from "../src/funding/catalog.ts";
import { firstFundsFile } from "../src/funding/first-funds.ts";

/** The module the app imports for Funding's first cards (`src/funding/first-funds-data.ts`). */
export const FIRST_FUNDS_MODULE = "virtual:first-funds";
const RESOLVED = `\0${FIRST_FUNDS_MODULE}`;

/**
 * Builds Funding's first cards into the app from the catalog it bundles, so the page shows them
 * with its first render instead of after the 3.6 MB catalog (`funding/first-funds.ts`). They are
 * chosen as of the build; the page drops any that closed since. JSON.parse of a string is the
 * fastest way for a browser to read data this size.
 */
export function firstFunds(): Plugin {
  let root = process.cwd();
  const data = (name: string) => join(root, "../../dist/data", `${name}.json`);
  return {
    name: "weave-first-funds",
    configResolved(config) {
      root = config.root;
    },
    resolveId: (id) => (id === FIRST_FUNDS_MODULE ? RESOLVED : undefined),
    load(id) {
      if (id !== RESOLVED) return;
      const read = (name: string): unknown => {
        this.addWatchFile(data(name));
        return JSON.parse(readFileSync(data(name), "utf8"));
      };
      const file = firstFundsFile(parseBundle(read("funders"), read("eligibility-rules"), read("program-conditions")), new Date());
      return `export default JSON.parse(${JSON.stringify(JSON.stringify(file))});`;
    },
  };
}
