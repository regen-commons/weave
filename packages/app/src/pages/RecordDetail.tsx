import { SocialAction } from "../social/Action.tsx";
import { useEffect } from "react";
import type { ListingRecord } from "../listing.ts";
import type { FixtureContext } from "../fixtures.ts";
import { STAGE_LABELS } from "../listing.ts";
import { fullDate } from "../home.ts";
import { currentRoute, navigate } from "../router.tsx";
import { routeWith } from "../routes.ts";
import { DetailSheet, type SheetState } from "../ui/DetailSheet.tsx";
import { LinkPreview } from "../ui/LinkPreview.tsx";
import { Media } from "../ui/Media.tsx";
import { PublicAsks } from "../ui/PublicAsks.tsx";
import { WorkTag } from "../ui/WorkTag.tsx";

/**
 * One shared initiative, opened over the page the person was on. Public records only: the
 * production public-directory adapter is not connected yet.
 */
export function RecordDetail({
  record,
  fixture,
  sheet,
}: {
  record?: ListingRecord;
  fixture?: FixtureContext;
  sheet: SheetState;
}) {
  const available = import.meta.env.DEV && !!fixture;
  const shown = available ? record : undefined;
  const state = fixture?.state;
  const title = shown?.title ?? "Initiative not available";
  useEffect(() => {
    if (sheet.open) document.title = `${title} | Weave`;
  }, [title, sheet.open]);
  function retry() {
    navigate(routeWith(currentRoute(), "state", "ready"), true);
  }
  return (
    <DetailSheet title={title} state={sheet}>
      {state === "loading" ? (
        <section aria-busy="true" aria-label="Loading initiative" className="rc-stack">
          <p role="status">Loading initiative</p>
          <div className="rc-skeleton" />
        </section>
      ) : state === "error" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h3 className="rc-notice-title">The initiative did not load</h3>
            <p>Your device card is safe.</p>
            <button type="button" className="rc-button" data-variant="secondary" onClick={retry}>
              Try again
            </button>
          </div>
        </section>
      ) : shown ? (
        <>
          {state === "offline" && (
            <p className="rc-notice" data-tone="info">
              You are offline. Showing the copy saved on this device.
            </p>
          )}
          <Media wide />
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
          <section className="rc-stack">
            <h3 className="rc-heading" data-size="section">
              Get in touch
            </h3>
            <p>Weave makes no introductions yet. Their links may say how to reach them.</p>
            {shown.publicDetails?.links.length ? (
              shown.publicDetails.links.map((link) => <LinkPreview key={link.url} {...link} />)
            ) : (
              <p className="rc-meta">No links listed.</p>
            )}
            {import.meta.env.DEV && fixture && (
              <SocialAction intent={{ kind: "lead", id: shown.id, name: shown.title }} />
            )}
          </section>
          <p className="rc-meta">
            Confirmed <time dateTime={shown.confirmed}>{fullDate(shown.confirmed)}</time>
          </p>
        </>
      ) : (
        <p>The public initiative service is not connected yet. Private saved cards stay in your account.</p>
      )}
    </DetailSheet>
  );
}
