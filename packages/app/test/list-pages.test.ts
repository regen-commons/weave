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
  assert.match(read("ui/FilterBar.tsx"), /data-shape="control"/u);
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
