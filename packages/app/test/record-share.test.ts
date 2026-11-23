import assert from "node:assert/strict";
import { test } from "node:test";
import { fundShare, initiativeShare, recordUrl, shareTargets } from "../src/record-share.ts";
import { PUBLIC_ORIGIN } from "../src/public-origin.ts";

test("a shared record is its public address on the public site, with only the query that names it", () => {
  assert.equal(recordUrl("/funding/water-fund"), `${PUBLIC_ORIGIN}/funding/water-fund`);
  assert.equal(recordUrl("/funding/water-fund", { program: "seed-grants", team: null }), `${PUBLIC_ORIGIN}/funding/water-fund?program=seed-grants`);
  assert.equal(recordUrl("/initiatives/a-b", {}, "https://example.test"), "https://example.test/initiatives/a-b");
  for (const bad of ["funding/x", "//evil.example/x", "https://evil.example/x"]) assert.throws(() => recordUrl(bad), /path on this site/);
});

test("a fund or a program is shared by name and address, never with anything from the person's card", () => {
  const fund = { id: "water-fund", name: "River Trust" };
  assert.deepEqual(fundShare(fund, null), {
    title: "River Trust", text: "Funding for regenerative work: River Trust.", url: `${PUBLIC_ORIGIN}/funding/water-fund`,
  });
  assert.deepEqual(fundShare(fund, { id: "seed-grants", name: "Seed Grants" }), {
    title: "Seed Grants",
    text: "Funding for regenerative work: Seed Grants, from River Trust.",
    url: `${PUBLIC_ORIGIN}/funding/water-fund?program=seed-grants`,
  });
  assert.equal(fundShare(fund, { id: "main", name: "River Trust" }).text, "Funding for regenerative work: River Trust.", "no name twice");
  assert.deepEqual(initiativeShare({ name: "Serpentine Food Forest", path: "/initiatives/a-b" }), {
    title: "Serpentine Food Forest", text: "An initiative on Weave: Serpentine Food Forest.", url: `${PUBLIC_ORIGIN}/initiatives/a-b`,
  });
});

test("each place to share to is a plain link with the words and the address filled in", () => {
  const share = { title: "Seeds & soil", text: "An initiative on Weave: Seeds & soil.", url: `${PUBLIC_ORIGIN}/initiatives/a-b` };
  const targets = shareTargets(share);
  assert.deepEqual(targets.map(({ label }) => label), ["Email", "Telegram", "WhatsApp", "X", "LinkedIn", "Bluesky"]);
  for (const { label, href } of targets) {
    assert.match(href, /^(mailto:\?|https:\/\/)/u, label);
    assert.ok(href.includes(encodeURIComponent(share.url)), `${label} carries the address`);
    assert.ok(!href.includes("&soil") && !href.includes(" "), `${label} encodes the words`);
  }
  const telegram = new URL(targets.find(({ label }) => label === "Telegram")!.href);
  assert.deepEqual([telegram.origin, telegram.searchParams.get("url"), telegram.searchParams.get("text")], ["https://t.me", share.url, share.text]);
  assert.equal(new URL(targets.find(({ label }) => label === "LinkedIn")!.href).searchParams.get("url"), share.url);
});
