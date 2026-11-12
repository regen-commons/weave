import { cpus, platform } from "node:os";
import { createPinnedProjectEmbedder } from "./project-embedding.mjs";
import { partnerLexicalText, partnerQueryProjection, partnerSearchText, rankPartnerMatches } from "../src/partner-matcher.ts";

const terms = (text) => partnerLexicalText(text).split(" ").filter(Boolean);
const dated = "2026-11-08T00:00:00Z";
const corpus = [
  {
    domain: "art", literal: "mural pigments",
    need: "Advice on mural pigments for a public artwork", offer: "Mural pigments for outdoor workshops",
    work: ["We mix mural pigments for outdoor artworks.", "We prepare lightfast dyes for paintings on exterior walls."],
  },
  {
    domain: "software", literal: "PostGIS routing",
    need: "PostGIS routing for a mobility map", offer: "PostGIS routing for cyclists",
    work: ["We maintain PostGIS routing tools for cycling maps.", "We develop geospatial directions for bicycle journeys."],
  },
  {
    domain: "research", literal: "plankton microscopy",
    need: "Plankton microscopy training for survey volunteers", offer: "Plankton microscopy for coastal surveys",
    work: ["We teach plankton microscopy in our survey labs.", "Our coastal laboratory examines microscopic drifting organisms."],
  },
  {
    domain: "place", literal: "wetland revegetation",
    need: "Wetland revegetation advice for a marsh", offer: "Wetland revegetation field training",
    work: ["We lead wetland revegetation in degraded marshes.", "Our crews replant native sedges in damaged riparian habitats."],
  },
];
const asEvidence = (passage, index) => {
  const uri = `at://did:web:fixture.example/org.hypercerts.collection/project-${index}`;
  return {
    id: String(index), projectUri: uri, projectName: `Synthetic project ${index}`, sourceUri: uri,
    sourceUrl: "https://fixture.example", cid: "fixture", contentHash: "fixture", fieldPath: "$.shortDescription",
    passage, sourceCreatedAt: dated, sourceIndexedAt: dated, fetchedAt: dated, extractionVersion: "fixture", kind: "work",
  };
};
const queries = corpus.flatMap(({ domain, need, offer }) => [ ["need", need], ["offer", offer] ].map(([kind, title]) => ({
  domain, initiativeId: "synthetic", entryId: `${domain}-${kind}`, revision: 1, kind,
  value: { title, status: "open", placeScope: "anywhere" }, summary: { name: "Synthetic initiative" },
})));

function invertedIndex(passages) {
  const postings = new Map();
  for (const passage of passages) {
    for (const term of terms(passage.passage)) {
      if (!postings.has(term)) postings.set(term, []);
      postings.get(term).push(passage.id);
    }
  }
  return (text, limit) => {
    const scores = new Map();
    for (const term of text.split(" ")) {
      for (const id of postings.get(term) ?? []) scores.set(id, (scores.get(id) ?? 0) + 1);
    }
    return [...scores.entries()].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
      .slice(0, limit).map(([id]) => id);
  };
}

const percentile = (values, ratio) => [...values].sort((a, b) => a - b)[Math.ceil(values.length * ratio) - 1];
const round = (number) => Number(number.toFixed(2));
const ms = (values) => ({ p50: round(percentile(values, .5)), p95: round(percentile(values, .95)) });

function benchmark() {
  const benchQueries = [queries[0], queries[3], queries[4], queries[7]];
  for (const size of [1000, 10_000, 100_000]) {
    const noise = ["inventory census", "habitat walks", "archival catalog", "radio signal", "community forestry"];
    const passages = Array.from({ length: size }, (_, i) => {
      const topic = corpus[i % corpus.length];
      const target = i % 13 === 0 ? topic.literal : noise[i % noise.length];
      return asEvidence(`We document ${target} in seasonal reports. Field series ${i}.`, i);
    });
    const before = performance.now();
    const retrieve = invertedIndex(passages);
    const indexBuildMs = round(performance.now() - before);
    const retrieval = [], ranking = [], total = [];
    let shortlistBytes = 0, resultBytes = 0;
    for (let i = 0; i < 23; i++) {
      const start = performance.now();
      const publicEvidenceByEntry = Object.fromEntries(benchQueries.map((query) => [
        `${query.kind}:${query.entryId}`,
        retrieve(partnerSearchText(query), 80).map((id) => passages[Number(id)]),
      ]));
      const readAt = performance.now();
      const result = rankPartnerMatches({ queries: benchQueries, publicEvidenceByEntry });
      const done = performance.now();
      if (i < 3) continue;
      retrieval.push(readAt - start);
      ranking.push(done - readAt);
      total.push(done - start);
      shortlistBytes = Buffer.byteLength(JSON.stringify(publicEvidenceByEntry));
      resultBytes = Buffer.byteLength(JSON.stringify(result));
    }
    console.log(JSON.stringify({
      mode: "synthetic_in_memory_scale", node: process.version, platform: platform(), cpu: cpus()[0]?.model,
      size, entries: benchQueries.length, iterations: total.length, concurrency: 1,
      indexBuildMs, retrievalMs: ms(retrieval), rankingMs: ms(ranking), totalMs: ms(total), shortlistBytes, resultBytes,
      processRssMiB: round(process.memoryUsage.rss() / (1024 ** 2)),
    }));
  }
}

function fuse(rankedLists, limit) {
  const scores = new Map();
  for (const list of rankedLists) {
    list.forEach((id, index) => scores.set(id, (scores.get(id) ?? 0) + 1 / (60 + index + 1)));
  }
  return [...scores].sort((a, b) => b[1] - a[1] || Number(a[0]) - Number(b[0]))
    .slice(0, limit).map(([id]) => id);
}

async function compareSemantic() {
  const passages = corpus.flatMap(({ work, literal }) => [
    ...work,
    `We discontinued ${literal} last year.`,
    `We need help with ${literal} and are looking for a contractor.`,
  ]).map(asEvidence);
  const retrieve = invertedIndex(passages);
  const initialize = performance.now();
  const embedder = await createPinnedProjectEmbedder();
  const initializationMs = round(performance.now() - initialize);
  try {
    const corpusStart = performance.now();
    const vectors = [];
    for (const { passage } of passages) vectors.push(await embedder.embed(passage));
    const corpusEmbeddingMs = round(performance.now() - corpusStart);
    const timings = [];
    const metrics = [];
    for (const query of queries) {
      const domain = corpus.findIndex(({ domain }) => domain === query.domain);
      const expected = [String(domain * 4), String(domain * 4 + 1)];
      const lexical = retrieve(partnerSearchText(query), 8);
      const begin = performance.now();
      const q = await embedder.embed(partnerQueryProjection(query));
      timings.push(performance.now() - begin);
      const semantic = vectors.map((v, i) => [String(i), v.reduce((sum, x, j) => sum + x * q[j], 0)])
        .sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id);
      const hybrid = fuse([lexical, semantic], 8);
      const candidates = (ids) => {
        const top = ids.slice(0, 5);
        const selected = rankPartnerMatches({ queries: [query],
          publicEvidenceByEntry: { [`${query.kind}:${query.entryId}`]: ids.map((id) => passages[Number(id)]) } });
        return {
          recallAt8: ids.filter((id) => expected.includes(id)).length / expected.length,
          top5Relevant: top.filter((id) => expected.includes(id)).length,
          top5Returned: top.length,
          finalRelevant: selected.filter(({ evidence }) => expected.includes(evidence.id)).length,
          finalReturned: selected.length,
        };
      };
      metrics.push({ domain: query.domain, direction: query.kind, lexical: candidates(lexical), hybrid: candidates(hybrid) });
    }
    console.log(JSON.stringify({ mode: "synthetic_semantic_comparison", modelVersion: embedder.modelVersion, passageCount: passages.length,
      initializationMs, corpusEmbeddingMs, queryEmbeddingMs: ms(timings), metrics }));
  } finally {
    await embedder.close();
  }
}

if (process.argv.includes("--semantic")) await compareSemantic();
else benchmark();
