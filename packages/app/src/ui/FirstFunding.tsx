import { useCatalog, type FundingSubject } from "../funding/use-catalog.ts";
import { catalogEntries } from "../funding/catalog.ts";
import { CardGrid } from "./Card.tsx";
import { CardGridSkeleton } from "./CardSkeleton.tsx";
import { OpportunityCard } from "./OpportunityCard.tsx";
import { ButtonLink } from "./ButtonLink.tsx";
export function FirstFunding({ subject }: { subject?: FundingSubject }) {
  const { bundle, results, loading, ranking, error, retry } = useCatalog(undefined, subject);
  const entries = bundle ? catalogEntries(bundle) : [];
  const first = results?.filter((result) => result.group === "lead").slice(0, 2) ?? [];
  return (
    <>
      {loading || ranking ? (
        <CardGridSkeleton kind="funding" count={2} label="Comparing your card with funding on this device" />
      ) : error ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p>{error}</p>
            <button className="rc-button" data-variant="secondary" onClick={retry}>
              Try Again
            </button>
          </div>
        </section>
      ) : first.length ? (
        <CardGrid>
          {first.map((result) => {
            const entry = entries.find((value) => value.id === result.documentId)!;
            return (
              <li key={entry.id}>
                <OpportunityCard entry={entry} result={result} level={3} />
              </li>
            );
          })}
        </CardGrid>
      ) : (
        <p>Nothing in the catalog matches this card yet.</p>
      )}
      <ButtonLink href="/funding" variant="secondary">
        Browse All Funding
      </ButtonLink>
    </>
  );
}
