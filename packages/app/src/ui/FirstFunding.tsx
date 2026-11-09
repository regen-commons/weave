import { useCatalog } from "../funding/use-catalog.ts";
import { catalogEntries } from "../funding/catalog.ts";
import { CardGrid } from "./Card.tsx";
import { OpportunityCard } from "./OpportunityCard.tsx";
import { ButtonLink } from "./ButtonLink.tsx";
export function FirstFunding() {
  const { bundle, results, loading, ranking, error, retry } = useCatalog();
  const entries = bundle ? catalogEntries(bundle) : [];
  const first = results?.filter((result) => result.group === "lead").slice(0, 2) ?? [];
  return (
    <>
      {loading || ranking ? (
        <p role="status">Comparing your card with funding on this device</p>
      ) : error ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p>{error}</p>
            <button className="rc-button" data-variant="secondary" onClick={retry}>
              Try again
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
        <p>No strong research leads were found in the keyword match. The whole catalog remains available.</p>
      )}
      <ButtonLink href="/funding" variant="secondary">
        Browse all funding
      </ButtonLink>
    </>
  );
}
