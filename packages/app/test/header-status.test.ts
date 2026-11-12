import assert from "node:assert/strict";
import test from "node:test";
import { headerStatus } from "../src/initiative/header-status.ts";
import { ROUTES } from "../src/routes.ts";

const saved = { setAside: false, accountSaved: false, storage: "saved", hasCard: true } as const;

test("the header says how the card is saved only on the pages where the card is worked on (DL-059)", () => {
  const shown = ROUTES.map((route) => route.name).filter((page) => headerStatus({ ...saved, page }) !== "none");
  assert.deepEqual(shown.sort(), ["check-card", "initiative", "needs", "offers", "your-initiative"]);
  assert.equal(headerStatus({ ...saved, page: undefined }), "none", "a missing page has no card to speak of");
});

test("on a card page the status follows where the card is kept", () => {
  const page = "needs";
  assert.equal(headerStatus({ ...saved, page }), "device");
  assert.equal(headerStatus({ ...saved, page, accountSaved: true }), "account");
  assert.equal(headerStatus({ ...saved, page, accountSaved: true, storage: "saving" }), "account");
  for (const storage of ["saving", "memory", "conflict"] as const)
    assert.equal(headerStatus({ ...saved, page, storage }), storage);
  assert.equal(headerStatus({ ...saved, page, hasCard: false }), "none", "an empty card has nothing saved");
  assert.equal(headerStatus({ ...saved, page, storage: "loading" }), "none");
  assert.equal(headerStatus({ ...saved, page, storage: "none" }), "none");
});

test("another account's card never speaks for this one (DL-055)", () => {
  assert.equal(headerStatus({ ...saved, page: "your-initiative", setAside: true }), "none");
  assert.equal(headerStatus({ ...saved, page: "needs", setAside: true, accountSaved: true }), "none");
});
