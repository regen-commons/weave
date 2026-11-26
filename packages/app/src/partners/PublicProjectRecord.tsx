import { useEffect, useMemo, useState } from "react";
import { useSetAside } from "../account/set-aside.ts";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { cardName } from "../initiative/status.ts";
import { initiativeShare } from "../record-share.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { DetailSheet, RecordLead, RecordSkeleton, recordSectionLevel, type Presentation, type SheetState } from "../ui/DetailSheet.tsx";
import { sectionTag, type SectionTag } from "../ui/section-level.ts";
import { DescribeDoor } from "../ui/DescribePrompt.tsx";
import { Fit } from "../ui/Fit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Link } from "../router.tsx";
import { ShareMenu } from "../ui/ShareMenu.tsx";
import { InitiativeShortlistButton, SHORTLIST_FULL } from "../shortlist/ShortlistButton.tsx";
import { entryLine, FIT_BASIS, fitLead, fitStrength, strongestFit } from "./groups.ts";
import { MatchDetails, PartialFitDetails } from "./NetworkResults.tsx";
import { contactLine, missingLine, projectAddress, projectFit, projectPassages, rememberedProject, requestPublicProject } from "./public-project.ts";
import { sharedByLine, type PublicProjectCard } from "./public-projects.ts";
import { MatchingDate } from "./SharingReview.tsx";
import { recordFirstView } from "../record-first-view.ts";
import { PublicAsks } from "../ui/PublicAsks.tsx";
import { Media } from "../ui/Media.tsx";
import { StepLayout } from "../ui/layouts.tsx";
import { Tag } from "../ui/Tag.tsx";
import { keyLabel } from "./public-projects.ts";
import { initialsOf, publicAsk, requestPublicInitiative, type InitiativeLookup } from "./public-initiative.ts";

type Loaded =
  | { status: "loading" }
  | { status: "found"; card: PublicProjectCard }
  | { status: "missing" }
  | { status: "off" }
  | { status: "failed" };

/**
 * One public Certified project at its Weave address (22 November 2026): who shared it and where, its own
 * words, whether it could partner with the person's initiative, how to reach it, and Share. A card the
 * person opened from a list shows at once; a link loads the one card from the list.
 */
export function PublicProjectRecord({ uri, sheet, presentation }: { uri: string; sheet: SheetState; presentation: Presentation }) {
  const [loaded, setLoaded] = useState<Loaded>(() => {
    const card = rememberedProject(uri);
    return card ? { status: "found", card } : { status: "loading" };
  });
  useEffect(() => {
    if (loaded.status !== "loading") return;
    const controller = new AbortController();
    requestPublicProject(uri, controller.signal).then(
      (lookup) => {
        if (!controller.signal.aborted) setLoaded(lookup);
      },
      () => {
        if (!controller.signal.aborted) setLoaded({ status: "failed" });
      },
    );
    return () => controller.abort();
  }, [uri, loaded.status]);
  // Opened from a link, the page came with the initiative's heading and summary, which stay while it loads.
  const path = projectAddress(uri);
  const firstView = presentation === "page" && path ? recordFirstView(path) : undefined;
  const title =
    loaded.status === "found"
      ? loaded.card.name
      : loaded.status === "loading"
        ? (firstView?.title ?? "Opening Initiative")
        : "Initiative Not Available";
  useEffect(() => {
    if (sheet.open || presentation === "page") document.title = `${title} | Weave`;
  }, [title, sheet.open, presentation]);
  const Section = sectionTag(recordSectionLevel(presentation));
  return (
    <DetailSheet title={title} state={sheet} presentation={presentation} wide>
      {loaded.status === "loading" ? (
        <>
          {firstView && <RecordLead summary={firstView.summary} />}
          <RecordSkeleton label="Loading initiative" />
        </>
      ) : loaded.status === "failed" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p className="rc-notice-title">The initiative did not load</p>
            <p>{navigator.onLine ? "Weave could not reach the list of initiatives." : "You are offline."}</p>
            <button
              type="button"
              className="rc-button"
              data-variant="secondary"
              onClick={() => setLoaded({ status: "loading" })}
            >
              Try Again
            </button>
          </div>
        </section>
      ) : loaded.status === "missing" || loaded.status === "off" ? (
        <>
          <p>{missingLine(loaded.status)}</p>
          <div className="rc-action-bar">
            <ButtonLink href={pathTo("initiatives")} variant="secondary">
              See All Initiatives
            </ButtonLink>
          </div>
        </>
      ) : (
        <ProjectBody card={loaded.card} Section={Section} />
      )}
    </DetailSheet>
  );
}

type Detail = { status: "loading" } | InitiativeLookup | { status: "failed" };

/**
 * The initiative's own answer (`/api/public-initiative`), asked for on every opening, from a link or from the
 * list, and never kept: only current, confirmed public needs and offers of exactly this project are shown, so
 * one withdrawn or expired since is gone when the page opens again.
 */
function useInitiativeDetail(uri: string): [Detail, () => void] {
  const [detail, setDetail] = useState<Detail>({ status: "loading" });
  useEffect(() => {
    if (detail.status !== "loading") return;
    const controller = new AbortController();
    requestPublicInitiative(uri, controller.signal).then(
      (lookup) => { if (!controller.signal.aborted) setDetail(lookup); },
      () => { if (!controller.signal.aborted) setDetail({ status: "failed" }); },
    );
    return () => controller.abort();
  }, [uri, detail.status]);
  return [detail, () => setDetail({ status: "loading" })];
}

/**
 * A public initiative's page (DL-151, Direction 1 of 25 November 2026): its mark beside who shared it, where
 * and its focus; its own words and what it needs and can offer in the main column; whether it could
 * partner with the person's initiative, its links, Share, how to reach it and the small print in the rail
 * beside them on a wide screen, under them on a phone.
 */
function ProjectBody({ card, Section }: { card: PublicProjectCard; Section: SectionTag }) {
  const line = sharedByLine(card);
  const path = projectAddress(card.uri);
  const [detail, retry] = useInitiativeDetail(card.uri);
  const [shortlistFull, setShortlistFull] = useState(false);
  const found = detail.status === "found" ? detail.initiative : null;
  // The fuller description, once the initiative's own answer is here; the list's opening words until then.
  const passages = found?.project.description.length ? found.project.description : projectPassages(card);
  const focus = found ? [...new Set([...found.project.focus, ...found.project.organizationTypes])] : [];
  const main = (
    <>
      {passages.map((passage) => (
        <p className="rc-prose" key={passage}>
          {passage}
        </p>
      ))}
      {detail.status === "loading" ? (
        <p className="rc-meta" role="status">Checking what this initiative needs and can offer.</p>
      ) : detail.status === "failed" ? (
        <section className="rc-notice" data-tone="warning" aria-label="Needs and offers">
          <div className="rc-notice-body">
            <p>Weave could not check what this initiative needs and can offer.</p>
            <div className="rc-action-bar">
              <button type="button" className="rc-button" data-variant="secondary" onClick={retry}>Try Again</button>
            </div>
          </div>
        </section>
      ) : found ? (
        <>
          <PublicAsks kind="needs" asks={found.needs.map(publicAsk)} />
          <PublicAsks kind="offers" asks={found.offers.map(publicAsk)} />
          {(found.needs.length > 0 || found.offers.length > 0) && (
            <p className="rc-meta">Published by Weave to the project's own Certified repository. Anyone can read them.</p>
          )}
        </>
      ) : null}
    </>
  );
  const rail = (
    <>
      <section className="rc-stack">
        <Section className="rc-heading" data-size="section">
          Could It Partner With Your Initiative?
        </Section>
        <ProjectFitPanel card={card} />
      </section>
      {found && found.project.publisherLinks.length > 0 && (
        <section className="rc-stack">
          <Section className="rc-heading" data-size="section">Links</Section>
          <div className="rc-action-bar" data-layout="rows">
            {found.project.publisherLinks.map((link) => (
              <ButtonLink key={link.url} href={link.url} variant="quiet">{link.label}</ButtonLink>
            ))}
          </div>
        </section>
      )}
      {/* Keeping and sending share a row (DL-153). */}
      {path && (
        <ShareMenu
          share={initiativeShare({ name: card.name, path })}
          before={<InitiativeShortlistButton project={card} place="button" onChange={(change) => setShortlistFull(change === "full")} />}
          note={shortlistFull ? SHORTLIST_FULL : ""}
        />
      )}
      <section className="rc-stack">
        <Section className="rc-heading" data-size="section">
          Get In Touch
        </Section>
        <p>{contactLine(found ? found.project.publisherLinks.length > 0 : null)}</p>
      </section>
      <p className="rc-meta">
        Shared on Certified on <MatchingDate value={card.sharedAt} />. Weave last checked it on <MatchingDate value={card.checkedAt} />.
      </p>
      {/* The record's raw data is for people checking or building on it, so it waits behind its own line
          instead of standing as a way to learn about the initiative (DL-154). */}
      <details className="rc-stack">
        <summary>Where this comes from</summary>
        <p className="rc-meta">
          {card.publisher ? `${card.publisher} published` : "Its publisher published"} this initiative as a public record on Certified,
          in the open Hypercerts format. Weave reads it from there and shows it here.
        </p>
        <p className="rc-meta">
          <Link href={card.sourceUrl}>Open the raw record (JSON)</Link>
        </p>
      </details>
    </>
  );
  return (
    <>
      <div className="rc-record-head">
        <Media thumb initials={initialsOf(card.name)} />
        <div className="rc-record-head-text">
          {line && <p className="rc-card-meta">{line}</p>}
          {focus.length > 0 && (
            <ul className="rc-tag-list" aria-label="Focus">
              {focus.map((key) => <li key={key}><Tag>{keyLabel(key)}</Tag></li>)}
            </ul>
          )}
        </div>
      </div>
      <StepLayout wide aside={rail}>{main}</StepLayout>
    </>
  );
}

/**
 * Whether this project could partner with the initiative on this device, worked out here from the card's
 * kept needs and offers and the project's words. A card that belongs to another account is not read.
 */
function ProjectFitPanel({ card }: { card: PublicProjectCard }) {
  const { draft } = useDraft();
  const setAside = useSetAside();
  const own = !setAside && hasDraft(draft);
  const fit = useMemo(
    () =>
      own
        ? projectFit(card, {
            id: draft.id,
            revision: 0,
            needs: draft.needs.items.filter(({ decision }) => decision === "kept"),
            offers: draft.offers.items.filter(({ decision }) => decision === "kept"),
            card: draft.confirmed,
          })
        : null,
    [own, card, draft.id, draft.needs.items, draft.offers.items, draft.confirmed],
  );
  if (!fit)
    return (
      <>
        <p>
          {own
            ? `Add what ${cardName(draft)} needs and offers to see whether this initiative could partner with it.`
            : "Describe your initiative, with what it needs and offers, to see whether this one could partner with it."}
        </p>
        <div className="rc-action-bar">
          <DescribeDoor variant="secondary" />
        </div>
      </>
    );
  if (!fit.fits.length)
    return (
      <p>
        Nothing in this initiative's own words matches what {cardName(draft)} needs or offers. Weave compared only the words on its
        card, so it may still be worth a look.
      </p>
    );
  const strength = strongestFit(fit.fits.map(({ match }) => fitStrength(match.evidenceKind, match.reciprocal)));
  const onlyPartial = fit.fits.every(({ match }) => match.partial);
  const several = fit.fits.length > 1;
  return (
    <>
      <Fit level={strength} explanation={onlyPartial ? "Public evidence covers part of the need." : FIT_BASIS[strength]}
        label={onlyPartial ? "Partial fit" : undefined} />
      <ul className="rc-reasons">
        {fit.fits.map(({ query, match }) => {
          const { direction, lead } = fitLead(match.evidenceKind);
          return (
            <li className="rc-reason" key={`${query.kind}:${query.entryId}`}>
              <Icon name={direction === "they-offer" ? "offer" : "need"} size="sm" />
              <span>
                {match.partial ? "They cover part of your need" : lead}: <strong>{String(query.value.title)}</strong>
              </span>
            </li>
          );
        })}
      </ul>
      {fit.fits.map(({ query, match }) => match.partial && (
        <div key={query.entryId} className="rc-stack">
          {several && <p><strong>{entryLine(query.kind, String(query.value.title))}</strong></p>}
          {match.evidence.type === "public" && <blockquote className="rc-prose">{match.evidence.passage}</blockquote>}
          <PartialFitDetails partial={match.partial} />
        </div>
      ))}
      <details className="rc-stack">
        <summary>{several ? "Why these fit" : "Why this fits"}</summary>
        {fit.fits.map(({ query, match }) => (
          <div className="rc-stack" key={`${query.kind}:${query.entryId}`}>
            {several && (
              <p>
                <strong>{entryLine(query.kind, String(query.value.title))}</strong>
              </p>
            )}
            <MatchDetails match={match} />
          </div>
        ))}
      </details>
      <p className="rc-meta">Compared on this device with {cardName(draft)}. Nothing about your initiative left it.</p>
    </>
  );
}
