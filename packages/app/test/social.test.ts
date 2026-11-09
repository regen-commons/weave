import assert from "node:assert/strict";
import { test } from "node:test";
import { createSocialFixture } from "../src/social/fixture.ts";

test("the example Certified door establishes identity without silently saving or sharing", async () => {
  const service = createSocialFixture("draft");
  await assert.rejects(service.save());
  await assert.rejects(service.share("public", true));
  assert.equal(service.snapshot().signedIn, false);
  await service.signIn();
  assert.equal(service.snapshot().saved, false);
  assert.equal(service.snapshot().visibility, "private");
  await service.save();
  assert.equal(service.snapshot().saved, true);
  assert.equal(service.snapshot().onward, false);
});
test("example reminders stay specific and introductions require sharing and confirmation", async () => {
  const service = createSocialFixture("private");
  await assert.rejects(service.introduce(["river"], "A note"));
  await service.remind("water-grant");
  await service.remind("water-grant");
  assert.deepEqual(service.snapshot().reminders, ["water-grant"]);
  await service.share("public", false);
  assert.deepEqual(service.snapshot().introductions, []);
  assert.equal(service.snapshot().onward, false);
  await service.introduce(["river", "river", "orchard"], "A note");
  assert.deepEqual(service.snapshot().introductions, ["river", "orchard"]);
  await service.share("private", true);
  assert.equal(service.snapshot().onward, false);
  await assert.rejects(service.introduce(["new-partner"], ""));
  assert.deepEqual(service.snapshot().introductions, ["river", "orchard"]);
});
test("example email choices stay off by default and deletion resets only the temporary account", async () => {
  const service = createSocialFixture("private");
  assert.deepEqual(service.snapshot().notifications, {
    funding: false,
    partners: false,
    introductions: false,
  });
  await assert.rejects(service.notify("partners", true));
  await service.share("public", false);
  await service.notify("partners", true);
  assert.equal(service.snapshot().notifications.partners, true);
  await service.share("private", false);
  assert.equal(service.snapshot().notifications.partners, false);
  await service.remind("one-fund");
  await service.deleteAccount();
  assert.equal(service.snapshot().signedIn, false);
  assert.equal(service.snapshot().saved, false);
  assert.deepEqual(service.snapshot().reminders, []);
  assert.deepEqual(service.snapshot().introductions, []);
  await assert.rejects(service.save());
});
