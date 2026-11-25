/**
 * Development only, with WEAVE_ACCOUNT_FIXTURE=1: the public list of initiatives and one public initiative's
 * answer, over the fixture's own project and the needs and offers published to it in this dev server's memory
 * (matching-fixture.ts). The real handlers answer, so their checks run on what the fixture gives them. Nothing
 * is read from Certified or a database, and no account is needed: a signed-out browser sees what anyone would.
 */
import { createPublicInitiative } from "../../api/src/public-initiative.ts";
import { createPublicProjects } from "../../api/src/public-projects-http.ts";
import { FIXTURE_PUBLIC_PROJECT_URI, fixturePublicListings } from "./matching-fixture.ts";

const [, , repo, , rkey] = FIXTURE_PUBLIC_PROJECT_URI.split("/");
const facts = { organizationTypes: ["community-group"], workScopes: ["food-systems", "education"] };
const project = () => ({
  uri: FIXTURE_PUBLIC_PROJECT_URI,
  name: "Garden commons (fixture)",
  passages: [
    "A fictional community garden run by neighbours.",
    "We need watershed mapping training for our volunteers. We offer seedlings to local schools.",
  ],
  sharedAt: "2026-11-01T00:00:00.000Z",
  checkedAt: new Date().toISOString(),
  sourceUrl: `https://api.hypercerts.dev/xrpc/com.atproto.repo.getRecord?repo=${repo}&collection=org.hypercerts.collection&rkey=${rkey}`,
  publisher: "Garden neighbours (fixture)",
  place: "Upper valley (fixture)",
});

export const publicProjectsFixture = createPublicProjects({
  // A fresh copy for every request, so the dev server never holds a list across fixture changes.
  reader: async () => ({
    load: async () => ({
      cards: [{ ...project(), ...facts, text: project().passages.join(" ") }],
      checkpoint: { completedAt: new Date().toISOString(), offset: 0 },
    }),
    close: async () => {},
  }),
}).handler;

export const publicInitiativeFixture = createPublicInitiative({
  reader: async () => ({
    load: async (uri) => uri === FIXTURE_PUBLIC_PROJECT_URI
      ? { project: { ...project(), ...facts },
        listings: fixturePublicListings(uri).map((listing) => ({ kind: listing.record.kind, uri: listing.uri, cid: listing.cid, record: listing.record })) }
      : null,
    close: async () => {},
  }),
  // The publisher's links as its organization record would give them: one labelled, one with only an address.
  links: () => async () => [
    { label: "Garden commons website (fixture)", url: "https://garden.example.org/" },
    { label: "garden.example.org", url: "https://garden.example.org/volunteer" },
  ],
});
