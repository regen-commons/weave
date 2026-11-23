import { useCatalog, type FundingSubject } from "../funding/use-catalog.ts";
import { catalogEntries } from "../funding/catalog.ts";
import { fundingFits, fundingFitsLine } from "../funding/select.ts";
import { CardGrid } from "./Card.tsx";
import { CardGridSkeleton } from "./CardSkeleton.tsx";
import { OpportunityCard } from "./OpportunityCard.tsx";
import { ButtonLink } from "./ButtonLink.tsx";

/**
 * Funding That Fits on an initiative's own page: the two strongest fits in Funding's own order, each
 * with its fit line and what it still needs checking, and how many more may fit (DL-141). It reads
 * the ranking Funding sorts with (`fundingFits`), so the two never disagree.
 */
export function FirstFunding({ subject }: { subject?: FundingSubject }) {
  const { bundle, results, loading, ranking, error, retry } = useCatalog(undefined, subject);
  const fits = bundle && results ? fundingFits(catalogEntries(bundle), results) : null;
  return (
    <>
      {loading || ranking ? (
        <CardGridSkeleton kind="funding" matched count={2} label="Comparing your card with funding on this device" />
      ) : error ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p>{error}</p>
            <button className="rc-button" data-variant="secondary" onClick={retry}>
              Try Again
            </button>
          </div>
        </section>
      ) : fits && fits.first.length ? (
        <>
          <CardGrid>
            {fits.first.map(({ entry, result }) => (
              <li key={entry.id}>
                <OpportunityCard entry={entry} result={result} level={3} />
              </li>
            ))}
          </CardGrid>
          <p>{fundingFitsLine(fits)}</p>
        </>
      ) : (
        <p>{fits ? fundingFitsLine(fits) : "This card is not compared with funding yet."}</p>
      )}
      <ButtonLink href="/funding" variant="secondary">
        Browse All Funding
      </ButtonLink>
    </>
  );
}
