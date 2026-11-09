import { SocialAction } from "../social/Action.tsx";
import { useEffect } from "react";
import type { ListingRecord } from "../listing.ts";
import type { FixtureContext } from "../fixtures.ts";
import { STAGE_LABELS } from "../listing.ts";
import { fullDate } from "../home.ts";
import { Link, navigate } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { Heading } from "../ui/Heading.tsx";
import { ListLayout, StepLayout, Stack } from "../ui/layouts.tsx";
import { LinkPreview } from "../ui/LinkPreview.tsx";
import { Media } from "../ui/Media.tsx";
import { PublicAsks } from "../ui/PublicAsks.tsx";
import { WorkTag } from "../ui/WorkTag.tsx";

/** Public records only. The production public-directory adapter is not connected yet. */
export function RecordDetail({ record, fixture }: { record?: ListingRecord; fixture?: FixtureContext }) {
  const available = import.meta.env.DEV && !!fixture;
  const shown = available ? record : undefined;
  const state = fixture?.state;
  useEffect(() => {
    document.title = `${shown?.title ?? "Initiative not available"} | Weave`;
  }, [shown?.title]);
  function retry() {
    const url = new URL(window.location.href);
    url.searchParams.set("state", "ready");
    navigate(`${url.pathname}${url.search}`);
  }
  return (
    <ListLayout>
      <p>
        <Link href={pathTo("initiatives")}>Back to Initiatives</Link>
      </p>
      <Heading level={1} size="page">
        {shown?.title ?? "Initiative not available"}
      </Heading>
      {state === "loading" ? (
        <section aria-busy="true" aria-label="Loading initiative" className="rc-stack">
          <p role="status">Loading example initiative</p>
          <div className="rc-skeleton" />
        </section>
      ) : state === "error" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The example initiative did not load</h2>
            <p>Your device card is safe.</p>
            <button type="button" className="rc-button" data-variant="secondary" onClick={retry}>
              Try again
            </button>
          </div>
        </section>
      ) : shown ? (
        <>
          <p className="rc-meta">Fictional shared initiative. No private record is shown here.</p>
          {state === "offline" && (
            <p className="rc-notice" data-tone="info">
              Showing an offline example saved with this development build.
            </p>
          )}
          <Media wide />
          <StepLayout
            aside={
              <Stack>
                <h2 className="rc-heading" data-size="section">
                  Get in touch
                </h2>
                <p>Introductions are between initiatives shared with the community.</p>
                {import.meta.env.DEV && fixture && (
                  <SocialAction intent={{ kind: "intro", ids: [shown.id], names: [shown.title] }} />
                )}
                <p className="rc-meta">
                  Live introductions are not connected yet. No contact details are shown.
                </p>
                <h2 className="rc-heading" data-size="section">
                  Links
                </h2>
                {shown.publicDetails?.links.length ? (
                  shown.publicDetails.links.map((link) => <LinkPreview key={link.url} {...link} />)
                ) : (
                  <p className="rc-meta">No links listed.</p>
                )}
                <p className="rc-meta">
                  Example confirmed <time dateTime={shown.confirmed}>{fullDate(shown.confirmed)}</time>
                </p>
              </Stack>
            }
          >
            <p className="rc-card-meta">
              {shown.place}, {STAGE_LABELS[shown.stage]}
            </p>
            <ul className="rc-tag-list" aria-label="Type of work">
              {shown.work.map((work) => (
                <li key={work}>
                  <WorkTag work={work} />
                </li>
              ))}
            </ul>
            <p className="rc-prose">{shown.description}</p>
            <PublicAsks kind="needs" asks={shown.publicDetails?.needs ?? []} />
            <PublicAsks kind="offers" asks={shown.publicDetails?.offers ?? []} />
          </StepLayout>
        </>
      ) : (
        <p>The public initiative service is not connected yet. Private saved cards stay in your account.</p>
      )}
    </ListLayout>
  );
}
