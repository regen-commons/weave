import assert from "node:assert/strict";
import { test } from "node:test";
import { replacesFirstView, retireFirstView } from "../src/first-view.ts";

function root(firstView?: string) {
  const attributes = new Map<string, string>(firstView === undefined ? [] : [["data-first-view", firstView], ["inert", ""]]);
  let cleared = false;
  return {
    get dataset() {
      return { firstView: attributes.get("data-first-view") };
    },
    removeAttribute: (name: string) => void attributes.delete(name),
    replaceChildren: () => void (cleared = true),
    get state() {
      return { cleared, attributes: [...attributes.keys()] };
    },
  };
}

test("a view drawn for this address stays for the app to replace, and is no longer inert", () => {
  for (const [drawn, at] of [["/", "/"], ["/funding", "/funding"], ["/funding", "/funding/"]] as const) {
    const page = root(drawn);
    retireFirstView(page, at);
    assert.deepEqual(page.state, { cleared: false, attributes: [] }, `${drawn} at ${at}`);
  }
});

test("Home's view sent for another address is cleared before the app draws, so it never shows there", () => {
  for (const at of ["/settings", "/funding/some-fund", "/workspaces/abc", "/no-such-page"]) {
    const page = root("/");
    retireFirstView(page, at);
    assert.deepEqual(page.state, { cleared: true, attributes: [] }, at);
  }
});

test("a page with no first view, as in development, is left alone", () => {
  const page = root();
  retireFirstView(page, "/funding");
  assert.deepEqual(page.state, { cleared: false, attributes: [] });
});

test("the app's draws over its own first view do not arrive again, until a move to another page", () => {
  retireFirstView(root("/funding"), "/funding/");
  assert.equal(replacesFirstView("/funding"), true);
  assert.equal(replacesFirstView("/funding"), true, "drawn again at the same address");
  assert.equal(replacesFirstView("/settings"), false, "a move");
  assert.equal(replacesFirstView("/funding"), false, "back at the first page later, it arrives");
  // Home's view cleared from another address leaves that address's first draw to arrive.
  retireFirstView(root("/"), "/settings");
  assert.equal(replacesFirstView("/settings"), false);
});
