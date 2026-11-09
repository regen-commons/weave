import type { AskFields } from "../intake/contracts.ts";

type Terms = AskFields["exchangeTerms"];
type Scope = AskFields["placeScope"];
export type EvidenceKind = "inferred_capability" | "published_offer" | "confirmed_offer" | "published_need";
interface EvidenceSource {
  readonly url: string;
  readonly publisher: string;
  readonly checkedOn: string;
  readonly publishedOn?: string;
}
interface Evidence {
  readonly id: string;
  readonly projectId: string;
  readonly project: string;
  readonly summary: string;
  readonly topics: string;
  readonly capitals: readonly AskFields["capitalForms"][number][];
  readonly source: EvidenceSource;
  readonly terms?: Terms;
  readonly scope?: Scope;
  readonly places?: readonly string[];
}
export type PartnerEvidence = Evidence & (
  | { readonly kind: Exclude<EvidenceKind, "confirmed_offer"> }
  | {
      readonly kind: "confirmed_offer";
      readonly terms: Terms;
      readonly scope: Scope;
      readonly confirmation: {
        readonly authority: string;
        readonly revision: string;
        readonly confirmedOn: string;
        readonly validThrough: string;
        readonly status: "open" | "withdrawn" | "met";
        readonly capacity: string;
        readonly audience: string;
      };
    }
);
