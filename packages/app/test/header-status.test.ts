import assert from "node:assert/strict";
import test from "node:test";
import { headerStatus } from "../src/initiative/header-status.ts";
import { ROUTES } from "../src/routes.ts";

const saved = { setAside: false, accountSaved: true, storage: "saved" } as const;

test("the header says how the card is saved only on the pages where the card is worked on (DL-059)", () => {
  const shown = ROUTES.map((route) => route.name).filter((page) => headerStatus({ ...saved, page }) !== "none");
  assert.deepEqual(shown.sort(), ["initiative", "needs", "offers", "your-initiative"]);
  assert.equal(headerStatus({ ...saved, page: undefined }), "none", "a missing page has no card to speak of");
});

test("a card kept only in this browser gets no label, and a failed write always says so (DL-112)", () => {
  const page = "needs";
  for (const storage of ["saved", "saving", "none", "loading"] as const)
    assert.equal(headerStatus({ ...saved, page, accountSaved: false, storage }), "none", `no label while ${storage}`);
  assert.equal(headerStatus({ ...saved, page }), "account");
  assert.equal(headerStatus({ ...saved, page, storage: "saving" }), "account");
  assert.equal(headerStatus({ ...saved, page, storage: "memory" }), "memory", "the account's copy does not hide a failed write");
  assert.equal(headerStatus({ ...saved, page, accountSaved: false, storage: "memory" }), "memory");
});

test("another account's card never speaks for this one (DL-055)", () => {
  assert.equal(headerStatus({ ...saved, page: "your-initiative", setAside: true }), "none");
  assert.equal(headerStatus({ ...saved, page: "needs", setAside: true, storage: "memory" }), "none");
});
