/** Conservative related activity phrases, not broad themes or a learned model.
 * Keep ambiguous single words (mapping, model, care, support, capital) out.
 * Changes require evaluation by domain and direction before release.
 */
export const PARTNER_CONCEPT_VERSION = "partner-concepts-en-v1";
const groups: readonly (readonly string[])[] = [
  ["mapmaking", "cartography", "geographic mapping", "gis mapping"],
  ["mural painting", "wall art"], ["ceramic firing", "pottery kiln"],
  ["audio recording", "sound recording"], ["film editing", "video post production", "video editing"],
  ["textile weaving", "loom weaving"], ["oral history", "recorded life stories"],
  ["printmaking", "screen printing"], ["sculpture casting", "bronze casting"],
  ["dance teaching", "dance instruction"], ["art conservation", "artwork restoration"],
  ["software testing", "software quality assurance"],
  ["screen reader support", "web accessibility"], ["data visualization", "data visualisation", "interactive charts"],
  ["application security", "software security"], ["language translation", "language localization", "language localisation"],
  ["database administration", "database maintenance"], ["offline synchronization", "offline synchronisation", "offline data sync"],
  ["version control", "source code management"], ["user research", "usability studies", "usability testing"],
  ["statistical analysis", "statistical modelling", "statistical modeling"],
  ["dna sequencing", "genome sequencing"], ["water quality testing", "water quality analysis"],
  ["microscopy", "microscope imaging"], ["survey design", "questionnaire design"],
  ["systematic review", "evidence synthesis"], ["species identification", "taxonomic identification"],
  ["soil analysis", "soil testing"], ["research data stewardship", "research data curation"],
  ["air quality monitoring", "air pollution measurement"],
  ["wetland restoration", "marsh rehabilitation"], ["rainwater harvesting", "rainwater collection"],
  ["bicycle repair", "bike maintenance", "bike repair"], ["seed saving", "seed conservation"],
  ["food redistribution", "surplus food distribution"], ["composting", "organic waste composting"],
  ["community mediation", "conflict resolution"], ["solar installation", "photovoltaic installation"],
  ["river restoration", "stream rehabilitation"], ["tree planting", "reforestation"],
];
const normalize = (text: string) => text.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const phrases = groups.map(aliases => aliases.map(normalize));

/** Never manufacture a phrase by joining sentences, contrasted clauses or entry fields. */
export function partnerConcepts(text: string): Map<number, string> {
  const units = text.slice(0, 2400).split(/[.!?;,:/\n]+|\b(?:but|however|although)\b/iu)
    .map(unit => ` ${normalize(unit)} `);
  return new Map(phrases.flatMap((aliases, id) => {
    const phrase = aliases.find(alias => units.some(unit => unit.includes(` ${alias} `)));
    return phrase ? [[id, phrase] as const] : [];
  }));
}
export function partnerRelatedTerms(query: string, positive: string, excluded: string): string[] {
  const wanted = partnerConcepts(query), present = partnerConcepts(positive), denied = partnerConcepts(excluded);
  return [...wanted].flatMap(([id, phrase]) => {
    const other = present.get(id);
    return other && other !== phrase && !denied.has(id) ? [`${phrase} / ${other}`] : [];
  });
}
/** Index public text with related phrases. Evidence stays verbatim; private queries stay on device. */
export function expandPartnerText(text: string): string {
  // Put aliases first so the downstream 2,400-character lexical bound cannot drop them.
  return [...[...partnerConcepts(text).keys()].flatMap(id => phrases[id] ?? []), text.slice(0, 2400)].join(" ");
}
