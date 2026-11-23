import assert from "node:assert/strict";
import test from "node:test";
import { ImageResponse } from "@vercel/og";
import { PUBLIC_ORIGIN, withPagePreview, type PagePreview } from "./page-preview.ts";
import type { PublicProjectCard } from "./public-projects-contract.ts";
import { drawable, lineBreak, pictureFrame, recordImageNodes, seeded, titleLines, type PictureNode, type RecordImageWords } from "./record-image-drawing.ts";
import { pictureFaces, type PictureFaces } from "./record-image-fonts.ts";
import { createRecordImageHandler, recordImageAddress, recordImageAlt, recordImageRevision } from "./record-image-http.ts";
import { createRecordPageHandler, fundPage, initiativePage, parseRecordPreviews, recordAsk } from "./record-page-http.ts";

const URI = "at://did:plc:c5lypin6swijs33nusbbtxfs/org.hypercerts.collection/3n2t7jfkyl72j";
const SLUG = "c5lypin6swijs33nusbbtxfs-3n2t7jfkyl72j";
const section = (name: string): PagePreview => ({
  title: `${name} | Weave`, description: `${name} on Weave.`, url: `${PUBLIC_ORIGIN}/${name.toLowerCase()}`,
  image: `${PUBLIC_ORIGIN}/share/${name.toLowerCase()}.png`, imageAlt: `${name}. Weave, part of Regen Commons.`,
});
const crumbs = { trail: [{ label: "Funding", href: "/funding" }], current: "Opportunity" };
const previews = parseRecordPreviews({
  sections: { funding: section("Funding"), initiatives: section("Initiatives") },
  crumbs: { funding: crumbs, initiatives: crumbs }, pages: [],
  funds: {
    "local-people-powered": {
      name: "People Powered", description: "Participatory climate policy training.",
      programs: [{ id: "people-powered-cda-2027", name: "Climate Democracy Accelerator: March 2027 cohort" }],
    },
    quiet: { name: "Quiet   Fund", description: "", programs: [] },
    hostile: { name: `</script><img src=x onerror=alert(1)> & "q"`, description: "", programs: [] },
    unreadable: { name: "水と森の基金", description: "", programs: [] },
  },
});
const card: PublicProjectCard = {
  uri: URI, name: "Serpentine Food Forest", passages: ["Rewilding farm land."], publisher: "Matt", place: "Serpentine, WA",
  sharedAt: "2026-11-21T13:30:53.072Z", checkedAt: "2026-11-22T04:18:29.205Z", sourceUrl: "https://api.hypercerts.dev/xrpc/x",
};
const ask = (search: string) => recordAsk(new URL(`${PUBLIC_ORIGIN}/api/record-image?${search}`))!;
const words = (search: string): RecordImageWords => {
  const asked = ask(search);
  return asked.kind === "funding" ? fundPage(previews, asked)!.picture : initiativePage(previews, asked, card).picture;
};
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const faces = await pictureFaces();
const draw = async (nodes: PictureNode, used: PictureFaces) => {
  const fonts = [used.title, used.label, used.line].map(({ name, data, weight, style }) => ({ name, data, weight, style }));
  return new Uint8Array(await new ImageResponse(nodes as unknown as ConstructorParameters<typeof ImageResponse>[0], { width: 1200, height: 630, fonts }).arrayBuffer());
};
function handler(over: Partial<Parameters<typeof createRecordImageHandler>[0]> = {}) {
  const calls: PictureNode[] = [];
  const serve = createRecordImageHandler({
    previews: async () => previews, project: async (uri) => (uri === URI ? card : null), faces: async () => faces,
    render: async (nodes) => { calls.push(nodes); return PNG; }, ...over,
  });
  return { calls, get: (search: string, method = "GET") => serve(new Request(`${PUBLIC_ORIGIN}/api/record-image?${search}`, { method })) };
}
/** Every string the nodes draw, in order. */
const texts = (node: PictureNode): string[] =>
  typeof node.props.children === "string" ? [node.props.children] : (node.props.children ?? []).flatMap(texts);

test("a record's picture says its name and one line about it, keyed by its one address", () => {
  assert.deepEqual(words("kind=funding&id=local-people-powered&program=people-powered-cda-2027"), {
    section: "funding", path: "/funding/local-people-powered?program=people-powered-cda-2027",
    title: "Climate Democracy Accelerator: March 2027 cohort", subtitle: "People Powered",
  });
  // A fund's bare address opens its first program, so the two share one picture.
  assert.deepEqual(words("kind=funding&id=local-people-powered"), words("kind=funding&id=local-people-powered&program=people-powered-cda-2027"));
  assert.deepEqual(words("kind=funding&id=quiet"), { section: "funding", path: "/funding/quiet", title: "Quiet Fund", subtitle: "" });
  assert.deepEqual(words(`kind=initiative&id=${SLUG}`), {
    section: "initiatives", path: `/initiatives/${SLUG}`, title: "Serpentine Food Forest", subtitle: "Shared by Matt · Serpentine, WA",
  });
  assert.equal(initiativePage(previews, ask(`kind=initiative&id=${SLUG}`) as never, { ...card, publisher: undefined, place: undefined }).picture.subtitle, "");
});

test("a picture's address changes exactly when what it shows does", () => {
  const fund = words("kind=funding&id=local-people-powered");
  const address = new URL(recordImageAddress(fund));
  assert.equal(address.origin + address.pathname, `${PUBLIC_ORIGIN}/api/record-image`);
  assert.deepEqual([...address.searchParams.keys()], ["kind", "id", "program", "v"]);
  assert.equal(address.searchParams.get("v"), recordImageRevision(fund));
  assert.match(recordImageRevision(fund), /^[0-9a-f]{16}$/u);
  assert.equal(recordImageRevision({ ...fund }), recordImageRevision(fund));
  for (const change of [{ title: "Other" }, { subtitle: "Other" }, { path: "/funding/other" }, { section: "initiatives" as const }])
    assert.notEqual(recordImageRevision({ ...fund, ...change }), recordImageRevision(fund), JSON.stringify(change));
  assert.equal(new URL(recordImageAddress(words(`kind=initiative&id=${SLUG}`))).searchParams.get("kind"), "initiative");
  assert.equal(recordImageAlt(fund), "Climate Democracy Accelerator: March 2027 cohort. People Powered. Weave, part of Regen Commons.");
});

test("a picture at its current address is kept a year at the CDN; at any other, five minutes", async () => {
  const { get, calls } = handler();
  const fund = words("kind=funding&id=local-people-powered");
  const current = await get(`kind=funding&id=local-people-powered&program=people-powered-cda-2027&v=${recordImageRevision(fund)}`);
  assert.equal(current.status, 200);
  assert.equal(current.headers.get("content-type"), "image/png");
  assert.equal(current.headers.get("cache-control"), "public, max-age=86400, s-maxage=31536000, immutable");
  assert.deepEqual(new Uint8Array(await current.arrayBuffer()), PNG);
  for (const search of ["kind=funding&id=local-people-powered&v=0000000000000000", "kind=funding&id=local-people-powered"]) {
    const other = await get(search);
    assert.equal(other.status, 200, search);
    assert.equal(other.headers.get("cache-control"), "public, max-age=300, s-maxage=300", search);
  }
  // HEAD answers with the picture's headers and draws nothing.
  const drawn = calls.length;
  const head = await get(`kind=funding&id=local-people-powered&v=${recordImageRevision(fund)}`, "HEAD");
  assert.deepEqual([head.status, head.headers.get("content-type"), await head.text(), calls.length], [200, "image/png", "", drawn]);
  assert.equal((await get("kind=funding&id=local-people-powered", "POST")).status, 405);
  assert.equal((await get("kind=elsewhere&id=x")).status, 404);
});

test("a record that is not there, cannot be looked up, cannot be drawn or fails to draw gets its section's picture", async () => {
  const sectionPicture = async (response: Response, section: string, cache: string) => {
    assert.equal(response.status, 307);
    assert.equal(response.headers.get("location"), `/share/${section}.png`);
    assert.equal(response.headers.get("cache-control"), cache);
  };
  const { get, calls } = handler();
  await sectionPicture(await get("kind=funding&id=no-such-fund"), "funding", "public, max-age=300, s-maxage=300");
  await sectionPicture(await get("kind=funding&id=local-people-powered&program=other"), "funding", "public, max-age=300, s-maxage=300");
  await sectionPicture(await get("kind=initiative&id=aaaaaaaaaaaaaaaaaaaaaaaa-aaaaaaaaaaaaa"), "initiatives", "public, max-age=300, s-maxage=300");
  // Words the faces lack would make the renderer fetch a font from Google, so they are never drawn.
  await sectionPicture(await get("kind=funding&id=unreadable"), "funding", "public, max-age=300, s-maxage=300");
  assert.equal(calls.length, 0, "nothing was drawn for any of them");
  const down = handler({ project: async () => { throw Error("down"); } });
  await sectionPicture(await down.get(`kind=initiative&id=${SLUG}`), "initiatives", "no-store");
  const slow = handler({ project: () => new Promise(() => {}), lookupTimeoutMs: 20 });
  await sectionPicture(await slow.get(`kind=initiative&id=${SLUG}`), "initiatives", "no-store");
  const broken = handler({ render: async () => { throw Error("wasm"); } });
  await sectionPicture(await broken.get("kind=funding&id=quiet"), "funding", "no-store");
  const noFaces = handler({ faces: async () => { throw Error("missing"); } });
  await sectionPicture(await noFaces.get("kind=funding&id=quiet"), "funding", "no-store");
  const noPreviews = handler({ previews: async () => { throw Error("missing"); } });
  await sectionPicture(await noPreviews.get(`kind=initiative&id=${SLUG}`), "initiatives", "no-store");
});

test("a title is drawn as the words it is, never read as markup", async () => {
  const { get, calls } = handler();
  assert.equal((await get("kind=funding&id=hostile")).status, 200);
  // The title's lines are text nodes, in order, and together they are the title as it was given.
  const title = `</script><img src=x onerror=alert(1)> & "q"`;
  const { lines } = titleLines(faces.title, title, 270);
  const drawn = texts(calls[0]!);
  const first = drawn.indexOf(lines[0]!);
  assert.ok(first > 0 && drawn.slice(first, first + lines.length).join(" ") === title, JSON.stringify(drawn));
  assert.equal(JSON.stringify(calls[0]).match(/"type":"img"/gu)?.length, 1, "the only image is the frame");
  // And the renderer draws it as text.
  const png = await draw(calls[0]!, faces);
  assert.deepEqual([...png.subarray(0, 4)], [...PNG]);
});

test("the picture is a 1200 by 630 PNG in the design system's faces", async () => {
  for (const search of ["kind=funding&id=local-people-powered", `kind=initiative&id=${SLUG}`]) {
    const nodes = recordImageNodes(faces, words(search));
    const png = await draw(nodes, faces);
    const view = new DataView(png.buffer, png.byteOffset);
    assert.deepEqual([[...png.subarray(0, 4)], view.getUint32(16), view.getUint32(20)], [[...PNG], 1200, 630], search);
    assert.ok(texts(nodes).includes("Part of Regen Commons.") && texts(nodes).includes("WEAVE.REGENCOMMONS.COM"));
  }
  assert.ok(drawable(faces, words("kind=funding&id=local-people-powered")));
  assert.ok(!drawable(faces, { section: "funding", path: "/funding/x", title: "Fund 🌱", subtitle: "" }), "an emoji is not in the faces");
});

test("each record grows its own pattern, the same every time", () => {
  const sequence = (text: string) => { const random = seeded(text); return [random(), random(), random()]; };
  const fund = "/funding/local-people-powered?program=people-powered-cda-2027", initiative = `/initiatives/${SLUG}`;
  assert.deepEqual(sequence(fund), sequence(fund));
  assert.notDeepEqual(sequence(fund), sequence(initiative));
  assert.notDeepEqual(sequence(fund), sequence("/funding/local-people-powered?program=people-powered-hub"));
  assert.notEqual(pictureFrame(fund), pictureFrame(initiative));
});

test("a long title shrinks, then breaks into at most three lines, and the last says it was cut", () => {
  const short = titleLines(faces.title, "Quiet Fund", 270);
  assert.deepEqual([short.size, short.lines], [84, ["Quiet Fund"]]);
  const long = titleLines(faces.title, "word ".repeat(60).trim(), 270);
  assert.ok(long.lines.length <= 3 && long.lines.at(-1)!.endsWith("…"), JSON.stringify(long));
  for (const line of long.lines) assert.ok(faces.title.width(line, long.size) <= 720, line);
  // A word wider than a line is cut, not left to overflow.
  const giant = lineBreak(faces.title, "x".repeat(200), 84, 720, 3);
  for (const line of giant.lines) assert.ok(faces.title.width(line, 84) <= 720);
});

test("a record's page names its own picture, and keeps its section's where it has none", async () => {
  const template = withPagePreview(`<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <meta name="description" content="x">\n    <title>Weave</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>`, section("Home"));
  const meta = (html: string, key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1];
  const page = (picture?: Parameters<typeof createRecordPageHandler>[0]["picture"]) => async (search: string) =>
    (await createRecordPageHandler({ template: async () => template, previews: async () => previews, project: async () => card, ...(picture ? { picture } : {}) })(
      new Request(`${PUBLIC_ORIGIN}/api/record-page?${search}`))).text();
  const own = page(async (shown) => (drawable(faces, shown) ? { image: recordImageAddress(shown), imageAlt: recordImageAlt(shown) } : null));
  const fund = await own("kind=funding&id=local-people-powered");
  const address = recordImageAddress(words("kind=funding&id=local-people-powered"));
  assert.equal(meta(fund, "og:image"), address.replaceAll("&", "&amp;"));
  assert.equal(meta(fund, "twitter:image"), address.replaceAll("&", "&amp;"));
  assert.equal(meta(fund, "og:image:alt"), "Climate Democracy Accelerator: March 2027 cohort. People Powered. Weave, part of Regen Commons.");
  assert.deepEqual([meta(fund, "og:image:width"), meta(fund, "og:image:height"), meta(fund, "og:image:type")], ["1200", "630", "image/png"]);
  assert.match(meta(await own(`kind=initiative&id=${SLUG}`), "og:image")!, /^https:\/\/weave\.regencommons\.com\/api\/record-image\?kind=initiative&amp;id=c5ly/u);
  // Words the faces cannot draw, a picture that cannot be worked out, or none offered: the section's picture.
  assert.equal(meta(await own("kind=funding&id=unreadable"), "og:image"), `${PUBLIC_ORIGIN}/share/funding.png`);
  assert.equal(meta(await page(async () => { throw Error("fonts"); })("kind=funding&id=quiet"), "og:image"), `${PUBLIC_ORIGIN}/share/funding.png`);
  assert.equal(meta(await page()("kind=funding&id=quiet"), "og:image"), `${PUBLIC_ORIGIN}/share/funding.png`);
});
