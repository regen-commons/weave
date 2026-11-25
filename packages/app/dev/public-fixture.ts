/**
 * Development only, with WEAVE_ACCOUNT_FIXTURE=1: the public list of initiatives and one public initiative's
 * answer, over the fixture's own project and the needs and offers published to it in this dev server's memory
 * (matching-fixture.ts). The real handlers answer, so their checks run on what the fixture gives them. Nothing
 * is read from Certified or a database, and no account is needed: a signed-out browser sees what anyone would.
 */
import { createPublicInitiative } from "../../api/src/public-initiative.ts";
import { createPublicProjects } from "../../api/src/public-projects-http.ts";
import { FIXTURE_PUBLIC_PROJECT_URI, fixtureListedProjects, fixturePublicListings } from "./matching-fixture.ts";

const [, , repo, , rkey] = FIXTURE_PUBLIC_PROJECT_URI.split("/");
const facts = { organizationTypes: ["community-group"], workScopes: ["food-systems", "education"] };
const sourceUrl = (uri: string) => {
  const [, , did, collection, key] = uri.split("/");
  return `https://api.hypercerts.dev/xrpc/com.atproto.repo.getRecord?repo=${did}&collection=${collection}&rkey=${key}`;
};
/** A project made from a draft, once the public list has picked it up (`/__fixture`, refresh-public-list). */
const created = () => fixtureListedProjects().map((item) => ({
  uri: item.uri, name: item.title, passages: item.description ? [item.description] : [], sharedAt: item.createdAt,
  checkedAt: new Date().toISOString(), sourceUrl: sourceUrl(item.uri),
  ...(item.place ? { place: item.place.name } : {}),
  organizationTypes: [], workScopes: [],
}));
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
      cards: [{ ...project(), ...facts }, ...created()].map((card) => ({ ...card, text: card.passages.join(" ") })),
      checkpoint: { completedAt: new Date().toISOString(), offset: 0 },
    }),
    close: async () => {},
  }),
}).handler;

export const publicInitiativeFixture = createPublicInitiative({
  reader: async () => ({
    load: async (uri) => {
      const found = uri === FIXTURE_PUBLIC_PROJECT_URI ? { ...project(), ...facts } : created().find((item) => item.uri === uri);
      return found
        ? { project: found, listings: fixturePublicListings(uri).map((listing) => ({ kind: listing.record.kind, uri: listing.uri, cid: listing.cid, record: listing.record })) }
        : null;
    },
    close: async () => {},
  }),
  // The publisher's links as its organization record would give them: one labelled, one with only an address.
  // Only the garden's repository has an organization record; an account's own repository has none.
  links: () => async (did) => did !== repo ? [] : [
    { label: "Garden commons website (fixture)", url: "https://garden.example.org/" },
    { label: "garden.example.org", url: "https://garden.example.org/volunteer" },
  ],
});
