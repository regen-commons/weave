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

test("no search keeps a button, and Home has none: Initiatives holds the search (DL-128)", () => {
  const home = read("pages/Home.tsx");
  assert.doesNotMatch(home, /type="submit"/u);
  assert.doesNotMatch(home, /role="search"/u);
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
  assert.match(read("pages/YourInitiative.tsx"), /<DraftSkeleton \/>/u);
  // The steps of describing an initiative hold their shape by being drawn at once, their controls
  // inert until the draft opens (test/step-at-once.test.ts).
  for (const page of ["pages/AskStep.tsx", "pages/Describe.tsx"])
    assert.match(read(page), /inert=\{!ready \|\| undefined\}/u, page);
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
  // Funding's prompt depends on the card, not the catalog: it is there from the first paint, its
  // words drawn while the device draft opens and its action holding its room, beside a checked
  // card's room for a device that has one (test/prompt-at-once.test.ts, test/checked-hint.test.ts).
  const page = read("pages/Funding.tsx");
  assert.match(page, /\{\(!catalog\.subjectKnown \|\| !catalog\.personalized\) && \(\s*<div data-unless-checked-card=/u);
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
  assert.match(end, /<p className="rc-meta">\{shownLine\(shown, total, things\)\}<\/p>/u, "the count is on the page");
  // One filled status region as the list opens, the bar's count; the end speaks only when a batch arrives (DL-130).
  assert.match(end, /<p className="rc-visually-hidden" role="status">\s*\{arrived\}/u);
  assert.match(end, /if \(shown > firstShown\.current\) setArrived\(shownLine\(shown, total, things\)\)/u);
  assert.match(end, /<button className="rc-button" data-variant="secondary" type="button" aria-disabled=\{busy\}/u, "the keyboard has a button");
  // The starter list has no sections: every card sits in one grid, as on every other list.
  const starter = read("partners/PartnerDiscovery.tsx");
  assert.doesNotMatch(starter, /BROWSE_GROUPS/u);
  assert.match(starter, /<CardGrid>\{shown\.map\(\(evidence\) => <li key=\{evidence\.id\}>\{card\(evidence\)\}<\/li>\)\}<\/CardGrid>/u);
});

test("Sort opens the same menu the filters open, says only Sort, and lives in a phone's sheet (DL-100, DL-122)", () => {
  const bar = read("ui/FilterBar.tsx");
  assert.doesNotMatch(bar, /<select\b|rc-sort/u);
  assert.match(bar, /<SortMenu sort=\{sort\} name=\{`\$\{place\}-sort`\} onSort=\{onSort\} \/>/u);
  // Sort is the menu of one choice, which is the system's Menu with radios. Funding's choice of
  // initiative opens the same one (DL-118).
  const sort = bar.slice(bar.indexOf("function SortMenu"), bar.indexOf("/**\n * Filter bar organism"));
  // The button never grows with an order's name; the order in force is a chip, and a phone's sheet holds Sort.
  assert.match(sort, /<RadioMenu\s+label="Sort"\s+legend="Sort"/u);
  assert.match(sort, /filter="one"/u, "a phone leaves the menu out, since its sheet holds Sort");
  assert.match(bar, /aria-label=\{`Remove Sort: \$\{ordered\.label\}`\}/u);
  assert.match(bar, /<legend>Sort<\/legend>/u);
  const menu = read("ui/RadioMenu.tsx");
  assert.match(menu, /className="rc-menu"/u);
  assert.match(menu, /className="rc-menu-option"/u);
  assert.match(menu, /type="radio"/u);
  assert.match(menu, /data-close-popover/u, "a menu of controls has a visible way to close it");
  const funding = read("pages/Funding.tsx");
  assert.match(funding, /<StatusLine\s+actions=\{\s*<>\s*\{subjectChoices\.length > 0 && \(\s*<RadioMenu/u, "the choice of initiative is offered only when there is something to choose (DL-129)");
  assert.match(funding, /\{detailed && \(\s*<button[\s\S]*?>\s*Edit Details\s*<\/button>/u, "the details for funding open from beside the initiative's name (DL-131)");
  assert.doesNotMatch(funding, /Change Funding Details/u);
  assert.match(bar, /data-variant="secondary"\s+type="button"\s+disabled=\{!query && choices\.length === 0 && !ordered\}\s+onClick=\{onClear\}/u);
});

test("Your Initiatives holds its own cards' shape while it loads, under the heading that arrives, and never a funding card's", () => {
  const skeleton = read("ui/CardSkeleton.tsx");
  const own = skeleton.slice(skeleton.indexOf('if (kind === "own")'), skeleton.indexOf('if (kind === "project")'));
  // A name, the tag that says what it is and a line about it, as the loaded card has (DL-134).
  for (const part of ["rc-card-title", "rc-tag-list", "rc-card-meta"]) assert.match(own, new RegExp(`className="${part}"`, "u"), part);
  for (const part of ["rc-eyebrow", "rc-card-summary", "rc-time"]) assert.doesNotMatch(own, new RegExp(`className="${part}"`, "u"), part);
  const page = read("pages/YourInitiatives.tsx");
  assert.doesNotMatch(page, /CardGridSkeleton kind="funding"/u, "a funding card is twice the height of a card on this page");
  assert.equal(page.split('<CardGridSkeleton kind="own" count={2} />').length - 1, 2, "while checking the account, and while reading projects");
  // The heading is there before its cards: the section is drawn as soon as its projects are being read.
  assert.match(page, /\{\(certified \|\| loading \|\| social\.problem \|\| noProjectYet\) && \(\s*<Section id="initiatives-certified" title="On Certified">/u);
  assert.match(page, /\{loading && \(\s*<div aria-busy="true">/u, "and the cards' shape is under it while they load");
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
  assert.match(funding, /<CardGridSkeleton kind="funding" matched=\{awaitingFit \|\| expectsFit\} count=\{BATCH\} \/>\s*<ListEndHold things=\{THINGS\} \/>/u);
  assert.match(funding, /useState\(BATCH\)/u, "the first batch is what the skeleton counted");
  assert.doesNotMatch(funding, /selected\.length > BATCH &&/u, "a list with cards always has its end");
  const projects = read("partners/PublicProjects.tsx");
  assert.equal(projects.match(/<CardGridSkeleton kind="project" count=\{PUBLIC_PROJECT_PAGE_SIZE\} \/>\s*<ListEndHold things="projects" \/>/gu)?.length, 2);
  assert.match(projects, /list\.status === "ready" && list\.projects\.length > 0 && \(\s*<ListEnd\b/u);
  assert.match(projects, /list\.status !== "ready" && ready\.projects\.length > 0 && <ListEndHold things="projects" \/>/u, "a search that is loading keeps the end's room");
  // Home asks each preview for the number it then holds shapes for.
  const home = read("pages/Home.tsx");
  assert.match(home, /count=\{preview === "row" \? FUNDING_PREVIEW_COUNT : RECENT_PREVIEW_COUNT\}/u);
  assert.match(home, /usePublicProjects\("", \{ limit: RECENT_PREVIEW_COUNT, enabled: !fixture \}\)/u);
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

test("a funding list compared with a person's card holds the fit and readiness lines its cards arrive with (DL-108)", () => {
  // Measured at 1280 px with a checked card: a loaded card is 427 px, and a skeleton without
  // these two lines is 339.
  const card = read("ui/OpportunityCard.tsx");
  assert.match(card, /\{result && <p className="rc-meta">\{result\.readiness\.label\}<\/p>\}/u, "the loaded card's readiness line");
  assert.match(card, /<FitLine\b/u, "and its fit line");
  const skeleton = read("ui/CardSkeleton.tsx");
  const funding = skeleton.slice(skeleton.indexOf('if (kind === "funding")'), skeleton.indexOf('if (kind === "own")'));
  assert.match(funding, /\{matched && \(\s*<span className="rc-tooltip-wrap">\s*<span className="rc-tooltip-trigger">\s*<span className="rc-fit">/u);
  assert.match(funding, /\{matched && \(\s*<p className="rc-meta">/u);
  // The card page's funding is always compared with the card.
  assert.match(read("ui/FirstFunding.tsx"), /<CardGridSkeleton kind="funding" matched count=\{2\}/u);
  // And the example of that page holds the same shape the live page holds.
  assert.match(read("pages/YourInitiative.tsx"), /<CardGridSkeleton kind="funding" matched count=\{2\}/u);
});

test("the filter controls stay in reach deep in a list, and the sheet's title row and foot stay put (DL-130)", () => {
  const bar = read("ui/FilterBar.tsx");
  // The pinned row draws the bar's own controls, with Search first, and is gone from view and the tab order when hidden.
  assert.match(bar, /<div className="rc-filter-pin" ref=\{pin\} role="group" aria-label=\{`Filter \$\{noun\}`\} hidden=\{!pinned\}>/u);
  assert.match(bar, /<Controls place=\{`\$\{id\}-pin`\} onSheet=\{\(\) => openSheet\("pin"\)\} lead=\{searchButton\}/u);
  assert.match(bar, /<Controls place=\{id\} onSheet=\{\(\) => openSheet\("bar"\)\}/u);
  // Focus comes back to the same control by what it is, not where it sits, since the row can hold
  // Filters where the bar holds a menu for each filter.
  assert.match(bar, /data-facet=\{facet\.key\}/u);
  assert.match(bar, /button\.dataset\.facet \?\? button\.dataset\.filter \?\? "sort"/u);
  assert.doesNotMatch(bar, /indexOf\(trigger/u);
  // The row keeps clear of a header that scrolls away in a short window (DL-132).
  assert.match(bar, /getComputedStyle\(header\)\.position === "sticky"/u);
  // Only the choices scroll; the foot is outside them.
  assert.match(bar, /<div className="rc-dialog-scroll">[\s\S]*?<\/div>\s*<div className="rc-dialog-foot">/u);
  const end = read("ui/ListEnd.tsx");
  assert.doesNotMatch(end, /AUTO_BATCHES|autoLeft/u, "the list never stops filling in on its own");
});
