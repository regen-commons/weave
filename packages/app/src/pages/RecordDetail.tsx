import { SocialAction } from "../social/Action.tsx";
import { useEffect } from "react";
import type { ListingRecord } from "../listing.ts";
import type { FixtureContext } from "../fixtures.ts";
import { STAGE_LABELS } from "../listing.ts";
import { fullDate } from "../home.ts";
import { currentRoute, navigate } from "../router.tsx";
import { routeWith } from "../routes.ts";
import { DetailSheet, recordSectionLevel, type Presentation, type SheetState } from "../ui/DetailSheet.tsx";
import { sectionTag } from "../ui/section-level.ts";
import { PublicProjectRecord } from "../partners/PublicProjectRecord.tsx";
import { projectUriOf } from "../partners/public-project.ts";
import { LinkPreview } from "../ui/LinkPreview.tsx";
import { Media } from "../ui/Media.tsx";
import { PublicAsks } from "../ui/PublicAsks.tsx";
import { WorkTag } from "../ui/WorkTag.tsx";
import { LinesSkeleton } from "../ui/CardSkeleton.tsx";

/**
 * One initiative, over the page the person was on or as a page of its own. An address that names a
 * public Certified project shows that project; any other is one of the development examples, and
 * production has none of those.
 */
export function RecordDetail({
  id,
  record,
  fixture,
  sheet,
  presentation,
}: {
  id: string;
  record?: ListingRecord;
  fixture?: FixtureContext;
  sheet: SheetState;
  presentation: Presentation;
}) {
  const project = projectUriOf(id);
  return project ? (
    <PublicProjectRecord uri={project} sheet={sheet} presentation={presentation} />
  ) : (
    <ExampleRecord record={record} fixture={fixture} sheet={sheet} presentation={presentation} />
  );
}

/** A development example of a shared initiative, with its needs, offers and links. */
function ExampleRecord({
  record,
  fixture,
  sheet,
  presentation,
}: {
  record?: ListingRecord;
  fixture?: FixtureContext;
  sheet: SheetState;
  presentation: Presentation;
}) {
  const available = import.meta.env.DEV && !!fixture;
  const shown = available ? record : undefined;
  const state = fixture?.state;
  const title = shown?.title ?? "Initiative Not Available";
  useEffect(() => {
    if (sheet.open || presentation === "page") document.title = `${title} | Weave`;
  }, [title, sheet.open, presentation]);
  const Section = sectionTag(recordSectionLevel(presentation));
  function retry() {
    navigate(routeWith(currentRoute(), "state", "ready"), true);
  }
  return (
    <DetailSheet title={title} state={sheet} presentation={presentation}>
      {state === "loading" ? (
        <LinesSkeleton label="Loading initiative" panel />
      ) : state === "error" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <Section className="rc-notice-title">The initiative did not load</Section>
            <p>Your device card is safe.</p>
            <button type="button" className="rc-button" data-variant="secondary" onClick={retry}>
              Try Again
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
            <Section className="rc-heading" data-size="section">
              Get In Touch
            </Section>
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
