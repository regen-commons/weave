import assert from "node:assert/strict";
import test from "node:test";
import { ImageResponse } from "@vercel/og";
import { PUBLIC_ORIGIN, withPagePreview, type PagePreview } from "./page-preview.ts";
import type { PublicProjectCard } from "./public-projects-contract.ts";
import {
  drawable, FIXED_WORDS, lineBreak, pictureFrame, recordImageNodes, seeded, titleLines, type PictureNode, type RecordImageWords,
} from "./record-image-drawing.ts";
import { pictureFace, pictureFaces, type PictureFaces } from "./record-image-fonts.ts";
import { createRecordImageHandler, recordImageAddress, recordImageAlt, recordImageRevision, recordPicture } from "./record-image-http.ts";
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
/** The query of a record's picture's current address, ready to ask for. */
const current = (search: string) => new URL(recordImageAddress(words(search), faces)).search.slice(1);

/** Draws as the endpoint does, and records any fetch the renderer makes for anything but its own data: URLs. */
async function draw(nodes: PictureNode, used: PictureFaces = faces): Promise<{ png: Uint8Array; fetched: string[] }> {
  const fetched: string[] = [];
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.startsWith("data:")) return real(input, init);
    fetched.push(url);
    throw Error("no network in a picture");
  }) as typeof fetch;
  try {
    const fonts = [used.title, used.label, used.line].map(({ name, data, weight, style }) => ({ name, data, weight, style }));
    const picture = new ImageResponse(nodes as unknown as ConstructorParameters<typeof ImageResponse>[0], { width: 1200, height: 630, fonts });
    return { png: new Uint8Array(await picture.arrayBuffer()), fetched };
  } finally {
    globalThis.fetch = real;
  }
}
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

test("a picture's address changes exactly when what it shows does, its faces included", () => {
  const fund = words("kind=funding&id=local-people-powered");
  const address = new URL(recordImageAddress(fund, faces));
  assert.equal(address.origin + address.pathname, `${PUBLIC_ORIGIN}/api/record-image`);
  assert.deepEqual([...address.searchParams.keys()], ["kind", "id", "program", "v"]);
  assert.equal(address.searchParams.get("v"), recordImageRevision(fund, faces));
  assert.match(recordImageRevision(fund, faces), /^[0-9a-f]{16}$/u);
  assert.equal(recordImageRevision({ ...fund }, faces), recordImageRevision(fund, faces));
  for (const change of [{ title: "Other" }, { subtitle: "Other" }, { path: "/funding/other" }, { section: "initiatives" as const }])
    assert.notEqual(recordImageRevision({ ...fund, ...change }, faces), recordImageRevision(fund, faces), JSON.stringify(change));
  assert.notEqual(recordImageRevision(fund, { digest: "0000000000000000" }), recordImageRevision(fund, faces), "other faces, another address");
  assert.match(faces.digest, /^[0-9a-f]{16}$/u);
  assert.equal(new URL(recordImageAddress(words(`kind=initiative&id=${SLUG}`), faces)).searchParams.get("kind"), "initiative");
  assert.equal(recordImageAlt(fund), "Climate Democracy Accelerator: March 2027 cohort. People Powered. Weave, part of Regen Commons.");
});

test("a fund's picture is kept a year at the CDN, and an initiative's as long as the public list", async () => {
  const { get } = handler();
  const fund = await get(current("kind=funding&id=local-people-powered"));
  assert.equal(fund.status, 200);
  assert.equal(fund.headers.get("content-type"), "image/png");
  assert.equal(fund.headers.get("cache-control"), "public, max-age=86400, s-maxage=31536000, immutable");
  assert.deepEqual(new Uint8Array(await fund.arrayBuffer()), PNG);
  // A withdrawn project's name and publisher leave its picture as fast as they leave the list.
  const initiative = await get(current(`kind=initiative&id=${SLUG}`));
  assert.equal(initiative.status, 200);
  assert.equal(initiative.headers.get("cache-control"), "public, max-age=60");
  assert.equal(initiative.headers.get("cdn-cache-control"), "public, max-age=300, stale-while-revalidate=600");
});

test("only the current address is drawn: any other key is sent to it, and HEAD is never kept", async () => {
  const { get, calls } = handler();
  const fund = recordImageAddress(words("kind=funding&id=local-people-powered"), faces);
  for (const search of [
    "kind=funding&id=local-people-powered&v=0000000000000000", "kind=funding&id=local-people-powered",
    `${current("kind=funding&id=local-people-powered")}&v=0000000000000000`,
  ]) {
    const other = await get(search);
    assert.deepEqual([other.status, other.headers.get("location"), other.headers.get("cache-control")], [307, fund, "public, max-age=300, s-maxage=300"], search);
  }
  assert.equal(calls.length, 0, "nothing was drawn for an old or missing key");
  const head = await get(current("kind=funding&id=local-people-powered"), "HEAD");
  assert.deepEqual([head.status, head.headers.get("content-type"), head.headers.get("cache-control"), await head.text(), calls.length], [200, "image/png", "no-store", "", 0]);
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
  await sectionPicture(await down.get(current(`kind=initiative&id=${SLUG}`)), "initiatives", "no-store");
  const slow = handler({ project: () => new Promise(() => {}), lookupTimeoutMs: 20 });
  await sectionPicture(await slow.get(current(`kind=initiative&id=${SLUG}`)), "initiatives", "no-store");
  const broken = handler({ render: async () => { throw Error("wasm"); } });
  await sectionPicture(await broken.get(current("kind=funding&id=quiet")), "funding", "no-store");
  const noFaces = handler({ faces: async () => { throw Error("missing"); } });
  await sectionPicture(await noFaces.get(current("kind=funding&id=quiet")), "funding", "no-store");
  const noPreviews = handler({ previews: async () => { throw Error("missing"); } });
  await sectionPicture(await noPreviews.get(current(`kind=initiative&id=${SLUG}`)), "initiatives", "no-store");
});

test("a title is drawn as the words it is, never read as markup, and nothing is fetched to draw it", async () => {
  const { get, calls } = handler();
  assert.equal((await get(current("kind=funding&id=hostile"))).status, 200);
  // The title's lines are text nodes, in order, and together they are the title as it was given.
  const title = `</script><img src=x onerror=alert(1)> & "q"`;
  const drawn = texts(calls[0]!);
  const lines = drawn.slice(drawn.indexOf("FUNDING") + 1, drawn.indexOf("Part of Regen Commons."));
  assert.equal(lines.join(" "), title, JSON.stringify(drawn));
  assert.equal(JSON.stringify(calls[0]).match(/"type":"img"/gu)?.length, 1, "the only image is the frame");
  const { png, fetched } = await draw(calls[0]!);
  assert.deepEqual([[...png.subarray(0, 4)], fetched], [[...PNG], []]);
  // The guard sees a fetch when there is one: a character the faces lack sends the renderer to Google.
  const missing = await draw(recordImageNodes(faces, { section: "funding", path: "/funding/x", title: "水と森", subtitle: "" }));
  assert.ok(missing.fetched.length > 0, "the stub catches the renderer's fetches");
});

test("the picture is a 1200 by 630 PNG in the design system's faces, drawn with nothing fetched", async () => {
  for (const search of ["kind=funding&id=local-people-powered", `kind=initiative&id=${SLUG}`]) {
    const nodes = recordImageNodes(faces, words(search));
    const { png, fetched } = await draw(nodes);
    const view = new DataView(png.buffer, png.byteOffset);
    assert.deepEqual([[...png.subarray(0, 4)], view.getUint32(16), view.getUint32(20), fetched], [[...PNG], 1200, 630, []], search);
    assert.ok(texts(nodes).includes("Part of Regen Commons.") && texts(nodes).includes("WEAVE.REGENCOMMONS.COM"));
  }
  assert.ok(drawable(faces, words("kind=funding&id=local-people-powered")));
  assert.ok(!drawable(faces, { section: "funding", path: "/funding/x", title: "Fund 🌱", subtitle: "" }), "an emoji is not in the faces");
  // The words every picture draws are in their faces.
  assert.ok(faces.label.covers(FIXED_WORDS.label) && faces.line.covers(FIXED_WORDS.line));
});

test("a face reads its characters and widths from a cmap of either form, and glyph 0 is no character", () => {
  /** A TrueType file with a format 12 cmap: A and B to glyphs 1 and 2, 😀 to glyph 0, 🌱 to glyph 2. */
  const tables: [string, Buffer][] = [];
  const head = Buffer.alloc(54); head.writeUInt16BE(1000, 18); tables.push(["head", head]);
  const hhea = Buffer.alloc(36); hhea.writeUInt16BE(3, 34); tables.push(["hhea", hhea]);
  const hmtx = Buffer.alloc(12); hmtx.writeUInt16BE(500, 4); hmtx.writeUInt16BE(600, 8); tables.push(["hmtx", hmtx]);
  const groups = [[0x41, 0x42, 1], [0x1f600, 0x1f600, 0], [0x1f331, 0x1f331, 2]];
  const cmap = Buffer.alloc(12 + 16 + groups.length * 12);
  cmap.writeUInt16BE(1, 2); cmap.writeUInt16BE(3, 4); cmap.writeUInt16BE(10, 6); cmap.writeUInt32BE(12, 8);
  cmap.writeUInt16BE(12, 12); cmap.writeUInt32BE(16 + groups.length * 12, 16); cmap.writeUInt32BE(groups.length, 24);
  groups.forEach(([start, end, glyph], index) => { cmap.writeUInt32BE(start!, 28 + index * 12); cmap.writeUInt32BE(end!, 32 + index * 12); cmap.writeUInt32BE(glyph!, 36 + index * 12); });
  tables.push(["cmap", cmap]);
  const header = Buffer.alloc(12 + tables.length * 16);
  header.writeUInt32BE(0x0001_0000, 0); header.writeUInt16BE(tables.length, 4);
  let offset = header.length;
  tables.forEach(([tag, data], index) => {
    header.write(tag, 12 + index * 16, "latin1"); header.writeUInt32BE(offset, 20 + index * 16); header.writeUInt32BE(data.length, 24 + index * 16);
    offset += data.length;
  });
  const face = pictureFace(Buffer.concat([header, ...tables.map(([, data]) => data)]), "Test", "normal", 400);
  assert.ok(face.covers("AB") && face.covers("🌱"));
  assert.ok(!face.covers("😀"), "a character mapped to glyph 0 is missing");
  assert.equal(face.width("AB", 10), 11);
  assert.equal(face.width("🌱", 10), 6);
  assert.throws(() => pictureFace(Buffer.from("wOF2xxxxxxxxxxxx"), "Test", "normal", 400), /not TrueType/u);
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
  // A word wider than a line is cut between characters, not left to overflow.
  const giant = lineBreak(faces.title, "é".repeat(200), 84, 720, 3);
  for (const line of giant.lines) assert.ok(faces.title.width(line, 84) <= 720 && faces.title.covers(line.replace("…", "")));
});

test("a record's page names its own picture, and keeps its section's where it has none", async () => {
  const template = withPagePreview(`<!doctype html>\n<html lang="en">\n  <head>\n    <meta charset="utf-8">\n    <meta name="description" content="x">\n    <title>Weave</title>\n  </head>\n  <body><div id="root"></div></body>\n</html>`, section("Home"));
  const meta = (html: string, key: string) => new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)">`).exec(html)?.[1];
  const page = (picture?: Parameters<typeof createRecordPageHandler>[0]["picture"]) => async (search: string) =>
    (await createRecordPageHandler({ template: async () => template, previews: async () => previews, project: async () => card, ...(picture ? { picture } : {}) })(
      new Request(`${PUBLIC_ORIGIN}/api/record-page?${search}`))).text();
  // As record-page.ts wires it.
  const own = page(async (shown) => recordPicture(shown, faces));
  const fund = await own("kind=funding&id=local-people-powered");
  const address = recordImageAddress(words("kind=funding&id=local-people-powered"), faces);
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
