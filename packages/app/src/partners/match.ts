import type { DeviceDraft } from "../describe/contracts.ts";
import type { AskFields } from "../intake/contracts.ts";
import type { PartnerEvidence } from "./evidence.ts";

const DAY = 86_400_000;
const common = new Set("about can could for help initiative need offer our that the their this want with work would you your".split(" "));
const words = (text: string) =>
  new Set(
    (text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? [])
      .filter((word) => !common.has(word)),
  );
const place = (text: string) => text.trim().normalize("NFC").toLowerCase();

export function availableEvidence(catalog: readonly PartnerEvidence[], now: Date): PartnerEvidence[] {
  return catalog.filter((evidence) => current(evidence, now));
}

function current(evidence: PartnerEvidence, now: Date): boolean {
  if (evidence.kind !== "confirmed_offer") return true;
  const { status, confirmedOn, validThrough, authority, revision, capacity, audience } = evidence.confirmation;
  const confirmed = Date.parse(confirmedOn);
  const expires = Math.min(Date.parse(validThrough) + DAY, confirmed + 90 * DAY);
  return status === "open" && !!(authority && revision && capacity && audience) && confirmed <= +now && +now < expires;
}

type LocalAsk = { id: string; value: Pick<AskFields, "title" | "description" | "capitalForms" | "exchangeTerms" | "placeScope"> };

export function localPartnerQuery(needs: DeviceDraft["needs"], offers: DeviceDraft["offers"], locations: readonly string[] = []) {
  const asks = (step: DeviceDraft["needs"]): LocalAsk[] => step.items.flatMap(({ id, decision, value }) => {
    if (decision !== "kept" || value.status !== "open") return [];
    const { title, description, capitalForms, exchangeTerms, placeScope } = value;
    return [{ id, value: { title, description, capitalForms, exchangeTerms, placeScope } }];
  });
  return { locations, needs: asks(needs), offers: asks(offers) };
}
export type LocalPartnerQuery = ReturnType<typeof localPartnerQuery>;

function compareAsk(ask: LocalAsk, evidence: PartnerEvidence, locations: readonly string[]) {
  const { title, description, capitalForms, exchangeTerms, placeScope } = ask.value;
  const query = words([title, description].filter(Boolean).join(" "));
  const hits = [...words(evidence.topics)].filter((word) => query.has(word));
  if (!hits.length) return;
  if (evidence.terms && !exchangeTerms.includes("open") && !evidence.terms.includes("open") &&
      !exchangeTerms.some((term) => evidence.terms?.includes(term))) return;
  const requiresPlace = placeScope !== "anywhere" || (evidence.scope && evidence.scope !== "anywhere");
  const sharedPlace = evidence.places?.some((value) => locations.some((location) => place(value) === place(location)));
  if (requiresPlace && !sharedPlace &&
      (evidence.kind === "confirmed_offer" || (evidence.places?.length && locations.length))) return;
  return {
    hits,
    checkPlace: !!requiresPlace && !sharedPlace,
    score: hits.length + (capitalForms.some((capital) => evidence.capitals.includes(capital)) ? 0.25 : 0),
  };
}

export interface PartnerMatch {
  readonly evidence: PartnerEvidence;
  readonly ask: LocalAsk;
  readonly hits: readonly string[];
  readonly checkPlace: boolean;
}

const priority: Record<PartnerEvidence["kind"], number> = {
  confirmed_offer: 0, published_offer: 1, inferred_capability: 2, published_need: 3,
};

/** Uses only this device's kept asks and a supplied public catalog. No account or network input. */
export function matchPartners(draft: DeviceDraft, catalog: readonly PartnerEvidence[], now = new Date()): PartnerMatch[] {
  return rankLocalPartners(localPartnerQuery(draft.needs, draft.offers, draft.confirmed?.locations), catalog, now);
}

export function rankLocalPartners(
  { locations, needs, offers }: LocalPartnerQuery,
  catalog: readonly PartnerEvidence[],
  now = new Date(),
): PartnerMatch[] {
  const ranked = availableEvidence(catalog, now).flatMap((evidence) =>
    (evidence.kind === "published_need" ? offers : needs).flatMap((ask) => {
      const fit = compareAsk(ask, evidence, locations);
      return fit ? [{ evidence, ask, ...fit }] : [];
    }),
  );
  ranked.sort((a, b) =>
    priority[a.evidence.kind] - priority[b.evidence.kind] ||
    b.score - a.score ||
    Number(a.checkPlace) - Number(b.checkPlace) ||
    (b.evidence.source.publishedOn ?? "").localeCompare(a.evidence.source.publishedOn ?? "") ||
    a.evidence.id.localeCompare(b.evidence.id),
  );
  const seen = new Set<string>();
  return ranked.filter(({ ask, evidence }) => {
    const key = `${ask.id}/${evidence.projectId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
