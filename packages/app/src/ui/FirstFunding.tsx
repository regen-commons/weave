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
  const { bundle, results, loading, ranking, error, retry, personalized } = useCatalog(undefined, subject);
  const fits = bundle && results ? fundingFits(catalogEntries(bundle), results) : null;
  // A checked card is compared as soon as the catalog is here; until its ranking lands it is still
  // loading, never "not compared", even for the moment between the two.
  const waiting = loading || ranking || (personalized && !results && !error);
  return (
    <>
      {waiting ? (
        // The two cards' shapes and the count line's room, so the block is its loaded height and
        // what follows it on the page does not move when the ranking lands (DL-108).
        <>
          <CardGridSkeleton kind="funding" matched count={2} label="Comparing your card with funding on this device" />
          <p aria-hidden="true">
            <span className="rc-skeleton" data-shape="hold">
              {fundingFitsLine({ well: 26, possible: 0 })}
            </span>
          </p>
        </>
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
