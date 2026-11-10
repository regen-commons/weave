import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createSocialFixture,
  ORCHARD_RECORD,
  partnerAccessOf,
  savedPlace,
  SEED_LIBRARY_RECORD,
  sharingEnds,
  WATER_NOTES_RECORD,
} from "../src/social/fixture.ts";
import { exposureLabel, shareGate } from "../src/social/gate.ts";
import { linkEffect, projectLine, replacesCard, workspaceLine } from "../src/social/words.ts";

const card = {
  name: "Orchard learning circle",
  locations: ["Upper valley, Brazil"],
  description: "Families restore an old orchard.",
  links: ["https://example.org/orchard"],
};

test("signing in only identifies the person: nothing is saved, linked or shared until its own tap", async () => {
  const service = createSocialFixture("draft", "2026-11-04");
  assert.equal(service.snapshot().identity, null);
  await assert.rejects(service.save(card.name), /Sign in/);
  await assert.rejects(service.linkProject(ORCHARD_RECORD.uri), /Sign in/);
  await assert.rejects(service.share(["need-1"], "key"), /Sign in/);
  await assert.rejects(service.publish(["need-1"], "key"), /Sign in/);
  await service.signIn();
  const signed = service.snapshot();
  assert.equal(signed.identity?.handle, "orchard.certified.one");
  assert.deepEqual(
    [signed.saved, signed.project, signed.shared, signed.published],
    [null, null, null, null],
    "signing in alone saves, links, shares and publishes nothing",
  );
  assert.equal(savedPlace(signed), "device");
  assert.deepEqual(
    signed.records.map((record) => record.name),
    ["Orchard learning circle", "Seed library of the upper valley", "Spring water notes"],
  );
  await service.save(card.name);
  assert.deepEqual(service.snapshot().saved, {
    place: "private",
    on: "2026-11-04",
    key: null,
    card: "orchard-learning-circle",
  });
  assert.deepEqual(
    service.snapshot().cards.map((item) => [item.name, item.savedOn]),
    [[card.name, "2026-11-04"]],
  );
  await service.save("Orchard circle, renamed", "private", "key-2");
  assert.deepEqual(
    service.snapshot().cards.map((item) => [item.id, item.name]),
    [["orchard-learning-circle", "Orchard circle, renamed"]],
    "a renamed card stays the same save",
  );
  await assert.rejects(service.save(card.name, "workspace"), /no team workspace/);
});

test("linking decides where saved work goes: a team workspace, a request to set one up, or a personal project", async () => {
  const team = createSocialFixture("private", "2026-11-04");
  assert.equal((await team.linkProject(ORCHARD_RECORD.uri)).workspace, "open");
  assert.equal(team.snapshot().saved?.place, "workspace", "the private save moves into the open workspace");
  assert.deepEqual(team.snapshot().cards, []);
  assert.equal(team.snapshot().shared, null, "linking shares nothing");

  const waiting = createSocialFixture("private", "2026-11-04");
  assert.equal((await waiting.linkProject(SEED_LIBRARY_RECORD.uri)).workspace, "absent");
  assert.equal(waiting.snapshot().saved?.place, "private", "the person keeps working privately");
  await assert.rejects(waiting.save(card.name, "workspace"), /no team workspace/);
  await assert.rejects(waiting.share(["need-1"], "key"), /no team workspace/);
  await waiting.requestWorkspace();
  assert.deepEqual(
    [waiting.snapshot().project?.workspace, waiting.snapshot().project?.requestedOn],
    ["requested", "2026-11-04"],
  );
  await assert.rejects(waiting.requestWorkspace(), /does not need a workspace request/);
  await waiting.checkAgain();
  assert.equal(waiting.snapshot().project?.workspace, "open");
  assert.equal(waiting.snapshot().saved?.place, "private", "approval moves nothing into the workspace");
  await assert.rejects(waiting.share(["need-1"], "key"), /Save to the team workspace first/);
  await waiting.save(card.name, "workspace", "key");
  assert.equal(waiting.snapshot().saved?.place, "workspace");
  assert.deepEqual(waiting.snapshot().cards, [], "the workspace holds the copy now");
  await waiting.share(["need-1"], "key");

  const solo = createSocialFixture("private", "2026-11-04");
  assert.equal((await solo.linkProject(WATER_NOTES_RECORD.uri)).workspace, "solo");
  assert.equal(solo.snapshot().saved?.place, "private", "a personal project stays with one person");
  await assert.rejects(solo.requestWorkspace(), /does not need a workspace request/);
  await solo.share(["need-1"], "key");
  await assert.rejects(solo.linkProject("at://nowhere"), /not on Certified any more/);
});

test("with no project on Certified, creating one starts a group with the creator as its one owner", async () => {
  let outcome: "ok" | "fail" = "fail";
  const service = createSocialFixture("private", "2026-11-04", () => outcome, "none");
  assert.deepEqual(service.snapshot().records, []);
  assert.equal(partnerAccessOf(service.snapshot()), "unlinked");
  await assert.rejects(service.saveLead("river"), /Link a Certified project/);
  await assert.rejects(service.createProject(card), /did not confirm the project/);
  assert.equal(service.snapshot().project, null, "a refusal creates nothing");
  outcome = "ok";
  const link = await service.createProject(card);
  assert.match(link.uri, /orchard-learning-circle$/);
  assert.deepEqual(
    { group: link.group, role: link.role, workspace: link.workspace, created: link.created, on: link.publishedOn },
    { group: card.name, role: "owner", workspace: "open", created: true, on: "2026-11-04" },
  );
  const state = service.snapshot();
  assert.equal(state.saved?.place, "workspace", "the private save becomes the new workspace's copy");
  assert.deepEqual(state.cards, []);
  assert.equal(state.records[0]?.uri, link.uri, "the project joins the person's list");
  assert.deepEqual([state.shared, state.published], [null, null], "creating a project shares and lists nothing");
  assert.equal(partnerAccessOf(state), "public", "a linked project sees public sources while its entries stay private");
});

test("opening a team workspace or a private save loads what is there and saves nothing new", async () => {
  const service = createSocialFixture("returning", "2026-11-04");
  assert.equal(service.snapshot().saved, null);
  await service.openCard("orchard-learning-circle", "key-card");
  assert.deepEqual(service.snapshot().saved, {
    place: "private",
    on: "2026-11-01",
    key: "key-card",
    card: "orchard-learning-circle",
  });
  assert.equal(service.snapshot().project, null, "loading a private save links nothing");
  await assert.rejects(service.openCard("gone", "key"), /not in Weave any more/);
  const link = await service.openWorkspace(ORCHARD_RECORD.uri, "key-team");
  assert.equal(link.workspace, "open");
  assert.deepEqual(service.snapshot().saved, {
    place: "workspace",
    on: "2026-11-02",
    key: "key-team",
    card: null,
  });
  assert.deepEqual(
    service.snapshot().cards.map((item) => item.savedOn),
    ["2026-11-01"],
    "the private save stays the person's own, untouched",
  );
  await assert.rejects(service.openWorkspace(SEED_LIBRARY_RECORD.uri, "key"), /no team workspace/);
  await service.clearCard();
  assert.deepEqual([service.snapshot().saved, service.snapshot().project], [null, null]);
  assert.equal(service.snapshot().records.length, 3, "the person's projects stay on Certified");
  assert.equal(service.snapshot().cards.length, 1);
});

test("sharing for matching and publishing are separate actions, and neither undoes the other", async () => {
  let outcome: "ok" | "fail" = "ok";
  const service = createSocialFixture("workspace", "2026-11-04", () => outcome);
  assert.equal(sharingEnds("2026-11-04"), null);
  assert.equal(partnerAccessOf(service.snapshot()), "public");
  await assert.rejects(service.share([], "key"), /at least one need or offer/);
  await assert.rejects(service.notify("partners", true), /Share a need or offer/);
  await service.share(["need-1"], "key-1");
  assert.deepEqual(service.snapshot().shared, { entries: ["need-1"], until: null, key: "key-1" });
  assert.equal(service.snapshot().published, null, "sharing for matching does not publish");
  assert.equal(partnerAccessOf(service.snapshot()), "network");
  await service.notify("partners", true);
  await service.publish(["need-1", "offer-1"], "key-2");
  assert.deepEqual(service.snapshot().published, {
    on: "2026-11-04",
    entries: ["need-1", "offer-1"],
    key: "key-2",
    withdrawal: null,
  });
  await service.stopSharing();
  assert.equal(service.snapshot().shared, null);
  assert.equal(service.snapshot().published?.key, "key-2", "a published listing stays published");
  assert.equal(service.snapshot().notifications.partners, false, "partner updates stop with sharing");
  assert.equal(partnerAccessOf(service.snapshot()), "public");
  outcome = "fail";
  await assert.rejects(service.publish(["need-1"], "key-3"), /did not confirm the record/);
  assert.equal(service.snapshot().published?.key, "key-2", "a refusal changes nothing");
  outcome = "ok";
  await service.withdraw();
  assert.equal(service.snapshot().published?.withdrawal, "2026-11-04", "the listing stays until Certified confirms");
  await service.checkAgain();
  assert.equal(service.snapshot().published, null);
  await assert.rejects(service.withdraw(), /Nothing is published/);
});

test("a review opens on the first step still missing, and a group member reads why they cannot publish", async () => {
  const save = { needs: "save", label: "Save privately", note: "" } as const;
  const service = createSocialFixture("draft", "2026-11-04");
  assert.equal(shareGate(service.snapshot(), { save: null }, "share"), "sign-in");
  await service.signIn();
  assert.equal(shareGate(service.snapshot(), { save }, "share"), "project");
  await service.linkProject(WATER_NOTES_RECORD.uri);
  assert.equal(shareGate(service.snapshot(), { save }, "share"), "save");
  assert.equal(shareGate(service.snapshot(), { save: null }, "share"), "card", "an unchecked card has nothing to save yet");
  await service.save(card.name);
  assert.equal(shareGate(service.snapshot(), { save: null }, "share"), null);
  assert.equal(shareGate(service.snapshot(), { save: null }, "publish"), null, "a personal project's owner can publish");

  const member = createSocialFixture("private", "2026-11-04");
  await member.linkProject(SEED_LIBRARY_RECORD.uri);
  assert.equal(shareGate(member.snapshot(), { save: null }, "share"), "workspace");
  assert.equal(shareGate(member.snapshot(), { save: null }, "publish"), "authority", "said before any other step");
  await assert.rejects(member.publish(["need-1"], "key"), /Only a group admin or owner can publish/);

  assert.equal(exposureLabel("share", undefined), "Share for matching");
  assert.equal(exposureLabel("share", "on"), "Change or stop sharing");
  assert.equal(exposureLabel("share", "changed"), "Share the changes");
  assert.equal(exposureLabel("publish", "off"), "Publish on Certified");
  assert.equal(exposureLabel("publish", "on"), "Change or withdraw");
  assert.equal(exposureLabel("publish", "changed"), "Publish again");
  assert.equal(exposureLabel("publish", "withdrawing"), "Check again");
});

test("reminders need a saved initiative, saved partners need a linked project, and deleting resets only the example account", async () => {
  const service = createSocialFixture("private", "2026-11-04");
  await service.remind("water-grant");
  await service.remind("water-grant");
  assert.deepEqual(service.snapshot().reminders, ["water-grant"]);
  await assert.rejects(service.saveLead("river"), /Link a Certified project/);
  await service.linkProject(WATER_NOTES_RECORD.uri);
  await service.saveLead("river");
  await service.saveLead("river");
  await service.saveLead("orchard");
  assert.deepEqual(service.snapshot().leads, ["river", "orchard"]);
  await service.removeLead("river");
  assert.deepEqual(service.snapshot().leads, ["orchard"]);
  await service.deleteAccount();
  assert.equal(service.snapshot().identity, null);
  assert.deepEqual([service.snapshot().cards, service.snapshot().reminders, service.snapshot().leads], [[], [], []]);
  await assert.rejects(service.save(card.name), /Sign in/);
  const unsaved = createSocialFixture("returning", "2026-11-04");
  await assert.rejects(unsaved.remind("water-grant"), /Save your initiative first/);
  const signedOut = createSocialFixture("private", "2026-11-04");
  await signedOut.signOut();
  assert.equal(savedPlace(signedOut.snapshot()), "device");
  assert.equal(partnerAccessOf(signedOut.snapshot()), "unlinked");
  assert.equal(signedOut.snapshot().cards.length, 1, "the private save survives signing out");
});

test("the words say who works on a project and where saved work goes before the person links it", () => {
  assert.equal(
    projectLine(ORCHARD_RECORD),
    "You are an admin of the group Upper valley growers. It has a team workspace in Weave.",
  );
  assert.equal(
    projectLine(SEED_LIBRARY_RECORD),
    "You are a member of the group Valley seed keepers. It has no team workspace in Weave yet.",
  );
  assert.equal(projectLine(WATER_NOTES_RECORD), "A personal project. Only you work on it.");
  assert.match(linkEffect(ORCHARD_RECORD, true), /^Your saved initiative moves to the Upper valley growers workspace/);
  assert.match(linkEffect(ORCHARD_RECORD), /^What you save goes to the Upper valley growers workspace/);
  assert.match(linkEffect(SEED_LIBRARY_RECORD, true), /ask for one and keep working privately/);
  assert.match(linkEffect(WATER_NOTES_RECORD, true), /what you save stays private/);
  const link = {
    uri: SEED_LIBRARY_RECORD.uri,
    name: SEED_LIBRARY_RECORD.name,
    group: SEED_LIBRARY_RECORD.group,
    role: SEED_LIBRARY_RECORD.role,
    publishedOn: SEED_LIBRARY_RECORD.publishedOn,
    created: false,
  };
  assert.equal(
    workspaceLine({ ...link, workspace: "absent", requestedOn: null }),
    "Valley seed keepers has no team workspace in Weave yet.",
  );
  assert.equal(
    workspaceLine({ ...link, workspace: "requested", requestedOn: "2026-11-04" }),
    "You asked for a team workspace on 4 November 2026.",
  );
  assert.equal(workspaceLine({ ...link, workspace: "open", requestedOn: "2026-11-04" }), null);
  assert.equal(replacesCard(card, { ...card }), false);
  assert.equal(replacesCard(card, SEED_LIBRARY_RECORD), true);
  assert.equal(replacesCard({ ...card, name: " " }, SEED_LIBRARY_RECORD), false, "an empty card has nothing to replace");
});
