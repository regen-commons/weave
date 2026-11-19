// Funding and Initiatives open the same way and narrow as a person types (DL-081). The pages are
// markup, which these tests read as text; the rules they follow are tested where they live.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const read = (path: string) => readFileSync(fileURLToPath(new URL(`../src/${path}`, import.meta.url)), "utf8");

test("the shared filter bar has no search button: the list follows each letter", () => {
  const bar = read("ui/FilterBar.tsx");
  assert.doesNotMatch(bar, /type="submit"/u);
  assert.match(bar, /onChange=\{\(event\) => onSearch\(event\.target\.value\)\}/u);
  assert.match(bar, /onSubmit=\{\(event\) => event\.preventDefault\(\)\}/u, "Enter sends nothing and reloads nothing");
});

test("only Home's search, which leads to another page, keeps its button", () => {
  const home = read("pages/Home.tsx");
  assert.equal(home.match(/type="submit"/gu)?.length, 1);
  assert.match(home, /role="search"/u);
  for (const page of ["pages/Funding.tsx", "pages/ListPage.tsx", "partners/PublicProjects.tsx", "partners/PartnerDiscovery.tsx"])
    assert.doesNotMatch(read(page), /type="submit"/u, page);
});

test("Funding and every form of Initiatives use the one filter bar, under one opening line", () => {
  for (const page of ["pages/Funding.tsx", "pages/ListPage.tsx", "partners/PublicProjects.tsx", "partners/PartnerDiscovery.tsx"])
    assert.match(read(page), /<FilterBar\b/u, page);
  assert.match(read("pages/Funding.tsx"), /<p className="rc-prose">Find support for your next chapter\.<\/p>/u);
  assert.match(read("pages/ListPage.tsx"), /<p className="rc-prose">\{opening\}<\/p>/u);
  // The public list asks the server, so it waits for a pause and keeps the last cards on screen.
  const live = read("partners/PublicProjects.tsx");
  assert.match(live, /usePaused\(searchQuery\(search\), SEARCH_PAUSE_MS\)/u);
  assert.match(live, /const ready = list\.status === "ready" \? list : arrived;/u);
});

test("a list that is loading holds its layout with the bar and card skeletons, never a line of text that leaves", () => {
  for (const page of ["pages/Funding.tsx", "pages/ListPage.tsx", "partners/PublicProjects.tsx", "pages/Home.tsx"])
    assert.match(read(page), /<CardGridSkeleton\b/u, page);
  // The bar's own buttons wait in their row at their own sizes, and the count line keeps its room (DL-104).
  const bar = read("ui/FilterBar.tsx");
  assert.match(bar, /data-filter="one" data-menu type="button" disabled>/u);
  assert.match(bar, /<span aria-hidden="true">\s*<span className="rc-skeleton" data-shape="hold">/u);
  assert.match(bar, /<span role="status" aria-atomic="true" className=\{loading \? "rc-visually-hidden" : undefined\}>/u);
  for (const page of ["pages/AskStep.tsx", "pages/Describe.tsx", "pages/CheckCard.tsx", "pages/YourInitiative.tsx"])
    assert.match(read(page), /<DraftSkeleton \/>/u, page);
});

test("nothing waits behind a visible line of loading text: a page, list or sheet holds its shape (DL-085)", async () => {
  const { readdirSync } = await import("node:fs");
  const root = fileURLToPath(new URL("../src/", import.meta.url));
  const files = readdirSync(root, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => `${entry.parentPath}/${entry.name}`.slice(root.length).replace(/^\//u, ""));
  // Words that say something is on its way belong to assistive technology, beside a skeleton.
  const waiting = /<p role="status">\s*(?:\{[^}]*\?\s*)?"?(?:Loading|Opening|Checking|Comparing|Connecting|Finishing)\b/u;
  for (const file of files) assert.doesNotMatch(read(file), waiting, file);
  for (const file of ["pages/RecordDetail.tsx", "pages/Opportunity.tsx", "pages/TeamWorkspace.tsx", "partners/ExamplePartners.tsx",
    "partners/PartnerDiscovery.tsx", "partners/CertifiedSuggestions.tsx", "partners/PartnerExperience.tsx", "ui/FirstFunding.tsx", "App.tsx"])
    assert.match(read(file), /<(?:CardGridSkeleton|LinesSkeleton|DraftSkeleton)\b/u, file);
});

test("a list's skeleton is built from the loaded page's own parts, so nothing moves when it arrives (DL-104)", () => {
  const skeleton = read("ui/CardSkeleton.tsx");
  // A funding card's shape has the loaded card's eyebrow, title, funder, tags, summary and date.
  const funding = skeleton.slice(skeleton.indexOf('if (kind === "funding")'), skeleton.indexOf('if (kind === "project")'));
  for (const part of ["rc-eyebrow", "rc-card-title", "rc-card-meta", "rc-tag-list", "rc-card-summary", "rc-time"])
    assert.match(funding, new RegExp(`className="${part}"`, "u"), part);
  // A public project's has no picture, because the loaded card has none.
  const project = skeleton.slice(skeleton.indexOf('if (kind === "project")'), skeleton.indexOf("return (\n    <div className=\"rc-card\" data-layout=\"listing\">"));
  assert.doesNotMatch(project, /data-shape="media"/u);
  for (const part of ["rc-card-title", "rc-card-summary", "rc-meta", "rc-time"])
    assert.match(project, new RegExp(`className="${part}"`, "u"), part);
  assert.match(read("partners/PublicProjects.tsx"), /<CardGridSkeleton kind="project"/u);
  // Funding's prompt depends on the card, not the catalog: it is there from the first paint, and
  // its room is held while the device draft opens.
  const page = read("pages/Funding.tsx");
  assert.match(page, /\{!catalog\.subjectKnown \? \(\s*<div className="rc-skeleton" data-shape="room" aria-hidden="true">\s*\{prompt\}/u);
  assert.doesNotMatch(page, /!loading && !catalog\.personalized/u);
  for (const file of ["pages/Funding.tsx", "partners/PublicProjects.tsx"]) assert.match(read(file), /\breserve="/u, file);
});

test("a long list fills in as its end comes near, and Initiatives is one flat list (DL-101)", () => {
  for (const page of ["pages/Funding.tsx", "partners/PublicProjects.tsx"]) {
    const source = read(page);
    assert.match(source, /<ListEnd\b/u, page);
    assert.doesNotMatch(source, /Show more (?:funding|projects)/u, page);
    assert.match(source, /onPress=\{added\.pressed\}/u, `${page}: a press keeps the keyboard's place`);
  }
  const end = read("ui/ListEnd.tsx");
  assert.match(end, /new IntersectionObserver\(/u);
  assert.match(end, /<p className="rc-meta" role="status">\s*\{shownLine\(shown, total, things\)\}/u, "the count is on the page and announced politely");
  assert.match(end, /<button className="rc-button" data-variant="secondary" type="button" aria-disabled=\{busy\}/u, "the keyboard has a button");
  // The starter list has no sections: every card sits in one grid, as on every other list.
  const starter = read("partners/PartnerDiscovery.tsx");
  assert.doesNotMatch(starter, /BROWSE_GROUPS/u);
  assert.match(starter, /<CardGrid>\{shown\.map\(\(evidence\) => <li key=\{evidence\.id\}>\{card\(evidence\)\}<\/li>\)\}<\/CardGrid>/u);
});

test("Sort opens the same menu the filters open, and the sheet's Clear all is a button with its own edge (DL-100)", () => {
  const bar = read("ui/FilterBar.tsx");
  assert.doesNotMatch(bar, /<select\b|rc-sort/u);
  assert.match(bar, /<SortMenu sort=\{sort\} name=\{`\$\{id\}-sort`\} onSort=\{onSort\} \/>/u);
  const menu = bar.slice(bar.indexOf("function SortMenu"), bar.indexOf("/**\n * Filter bar organism"));
  assert.match(menu, /className="rc-menu"/u);
  assert.match(menu, /className="rc-menu-option"/u);
  assert.match(menu, /type="radio"/u);
  assert.match(bar, /data-variant="secondary"\s+type="button"\s+disabled=\{!query && choices\.length === 0\}\s+onClick=\{onClear\}/u);
});

test("a list card keeps set rows, so a card and its skeleton are one height by construction (DL-108)", () => {
  // The two cards a loading list stands in for ask for fixed rows, and so do their skeletons.
  assert.match(read("ui/OpportunityCard.tsx"), /<Card kind="funding" rows="fixed">/u);
  assert.match(read("partners/PublicProjects.tsx"), /<Card kind="initiative" rows="fixed">/u);
  assert.match(read("ui/Card.tsx"), /data-rows=\{rows\}/u);
  const skeleton = read("ui/CardSkeleton.tsx");
  assert.match(skeleton, /data-kind="funding" data-rows="fixed"/u);
  assert.match(skeleton, /data-kind="initiative" data-rows="fixed"/u);
  // A funding card's funder line is always there, empty or not, so no card is a line shorter.
  const card = read("ui/OpportunityCard.tsx");
  assert.match(card, /<p className="rc-card-meta" title=\{funder \|\| undefined\}>\s*\{funder\}\s*<\/p>/u);
  assert.doesNotMatch(card, /&& \(\s*<p className="rc-card-meta">/u);
});

test("a skeleton holds as many cards as the view loads, and the list end has its room from the start (DL-108)", () => {
  const funding = read("pages/Funding.tsx");
  assert.match(funding, /<CardGridSkeleton kind="funding" count=\{BATCH\} \/>\s*<ListEndHold things=\{THINGS\} \/>/u);
  assert.match(funding, /useState\(BATCH\)/u, "the first batch is what the skeleton counted");
  assert.doesNotMatch(funding, /selected\.length > BATCH &&/u, "a list with cards always has its end");
  const projects = read("partners/PublicProjects.tsx");
  assert.equal(projects.match(/<CardGridSkeleton kind="project" count=\{PUBLIC_PROJECT_PAGE_SIZE\} \/>\s*<ListEndHold things="projects" \/>/gu)?.length, 2);
  assert.match(projects, /list\.status === "ready" && list\.projects\.length > 0 && \(\s*<ListEnd\b/u);
  assert.match(projects, /list\.status !== "ready" && ready\.projects\.length > 0 && <ListEndHold things="projects" \/>/u, "a search that is loading keeps the end's room");
  // Home asks each preview for the number it then holds shapes for.
  const home = read("pages/Home.tsx");
  assert.match(home, /count=\{preview === "row" \? FUNDING_PREVIEW_COUNT : RECENT_PREVIEW_COUNT\}/u);
  assert.match(home, /usePublicProjects\("", RECENT_PREVIEW_COUNT, !fixture\)/u);
  assert.match(read("home.ts"), /\.slice\(0, FUNDING_PREVIEW_COUNT\)/u);
});

test("the count and the fact about the whole list each keep a line, loading and loaded (DL-108)", () => {
  const bar = read("ui/FilterBar.tsx");
  assert.match(bar, /const noted = loading \? reserve : note;/u);
  assert.match(bar, /\{noted && \(\s*<span data-part="note" aria-hidden=\{loading \|\| undefined\}>/u);
  assert.doesNotMatch(bar, /` \$\{note\}`/u, "the fact no longer runs on after the count");
});

test("no section on Home is set apart by a band (DL-109)", () => {
  assert.doesNotMatch(read("pages/Home.tsx"), /\bband\b/u);
  assert.doesNotMatch(read("ui/Section.tsx"), /band/u);
});

test("the prompt to describe an initiative is a plain section, not a notice (DL-109)", () => {
  const prompt = read("ui/DescribePrompt.tsx");
  assert.match(prompt, /<Section\b/u);
  assert.doesNotMatch(prompt, /rc-notice/u);
  // The list is told what was remembered, and an answer is kept for the next visit.
  const projects = read("partners/PublicProjects.tsx");
  assert.match(projects, /listView\(list, indexSeen, expectStarter\)/u);
  assert.match(projects, /rememberIndex\(deviceStorage\(\), list\.page\);/u);
});
