import assert from "node:assert/strict";
import { test } from "node:test";
import { forgetLandingHead, LANDING_HEAD } from "../src/landing-head.ts";

test("moving inside the app takes out the landing page's canonical link and JSON-LD, and nothing else", () => {
  const removed: string[] = [];
  const element = (name: string) => ({ remove: () => removed.push(name) });
  const head = {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, LANDING_HEAD);
      return [element("canonical"), element("json-ld")] as unknown as NodeListOf<Element>;
    },
  };
  forgetLandingHead(head);
  assert.deepEqual(removed, ["canonical", "json-ld"]);
  assert.match(LANDING_HEAD, /link\[rel="canonical"\]/u);
  assert.match(LANDING_HEAD, /script\[type="application\/ld\+json"\]/u);
  assert.doesNotMatch(LANDING_HEAD, /og:|twitter:|description/u, "the preview tags stay, as Home's did before");
});
