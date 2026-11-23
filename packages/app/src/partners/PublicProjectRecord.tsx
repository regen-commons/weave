import { useEffect, useMemo, useState } from "react";
import { useSetAside } from "../account/set-aside.ts";
import { useDraft } from "../describe/use-draft.ts";
import { hasDraft } from "../describe/view.ts";
import { cardName } from "../initiative/status.ts";
import { initiativeShare } from "../record-share.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { LinesSkeleton } from "../ui/CardSkeleton.tsx";
import { DetailSheet, type Presentation, type SheetState } from "../ui/DetailSheet.tsx";
import { useDescribeDoor } from "../ui/describe-door.ts";
import { Fit } from "../ui/Fit.tsx";
import { Icon } from "../ui/Icon.tsx";
import { Link } from "../router.tsx";
import { ShareMenu } from "../ui/ShareMenu.tsx";
import { entryLine, FIT_BASIS, fitLead, fitStrength, strongestFit } from "./groups.ts";
import { MatchDetails } from "./NetworkResults.tsx";
import { projectAddress, projectFit, projectPassages, rememberedProject, requestPublicProject } from "./public-project.ts";
import { sharedByLine, type PublicProjectCard } from "./public-projects.ts";
import { MatchingDate } from "./SharingReview.tsx";

type Loaded =
  | { status: "loading" }
  | { status: "ready"; card: PublicProjectCard }
  | { status: "missing" }
  | { status: "failed" };

/**
 * One public Certified project at its Weave address (22 November 2026): who shared it and where, its own
 * words, whether it could partner with the person's initiative, how to reach it, and Share. A card the
 * person opened from a list shows at once; a link loads the one card from the list.
 */
export function PublicProjectRecord({ uri, sheet, presentation }: { uri: string; sheet: SheetState; presentation: Presentation }) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<Loaded>(() => {
    const card = rememberedProject(uri);
    return card ? { status: "ready", card } : { status: "loading" };
  });
  useEffect(() => {
    if (loaded.status !== "loading") return;
    const controller = new AbortController();
    requestPublicProject(uri, controller.signal).then(
      (card) => setLoaded(card ? { status: "ready", card } : { status: "missing" }),
      () => {
        if (!controller.signal.aborted) setLoaded({ status: "failed" });
      },
    );
    return () => controller.abort();
  }, [uri, attempt, loaded.status]);
  const title =
    loaded.status === "ready" ? loaded.card.name : loaded.status === "loading" ? "Opening Initiative" : "Initiative Not Available";
  useEffect(() => {
    if (sheet.open || presentation === "page") document.title = `${title} | Weave`;
  }, [title, sheet.open, presentation]);
  const Section = presentation === "page" ? "h2" : "h3";
  return (
    <DetailSheet title={title} state={sheet} presentation={presentation}>
      {loaded.status === "loading" ? (
        <LinesSkeleton label="Loading initiative" panel />
      ) : loaded.status === "failed" ? (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p className="rc-notice-title">The initiative did not load</p>
            <p>{navigator.onLine ? "Weave could not reach the list of initiatives." : "You are offline."}</p>
            <button
              type="button"
              className="rc-button"
              data-variant="secondary"
              onClick={() => {
                setLoaded({ status: "loading" });
                setAttempt((count) => count + 1);
              }}
            >
              Try Again
            </button>
          </div>
        </section>
      ) : loaded.status === "missing" ? (
        <>
          <p>This initiative is not on the public list. Its publisher may have withdrawn it from Certified.</p>
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

function ProjectBody({ card, Section }: { card: PublicProjectCard; Section: "h2" | "h3" }) {
  const line = sharedByLine(card);
  const path = projectAddress(card.uri);
  return (
    <>
      {line && <p className="rc-card-meta">{line}</p>}
      {projectPassages(card).map((passage) => (
        <p className="rc-prose" key={passage}>
          {passage}
        </p>
      ))}
      <p className="rc-meta">
        Shared on Certified <MatchingDate value={card.sharedAt} />. Weave last checked it on <MatchingDate value={card.checkedAt} />.
      </p>
      {path && <ShareMenu share={initiativeShare({ name: card.name, path })} />}
      <section className="rc-stack">
        <Section className="rc-heading" data-size="section">
          Could It Partner With Your Initiative?
        </Section>
        <ProjectFitPanel card={card} />
      </section>
      <section className="rc-stack">
        <Section className="rc-heading" data-size="section">
          Get In Touch
        </Section>
        <p>Weave makes no introductions yet, and the Certified record lists no website or contact for this initiative.</p>
        <p className="rc-meta">
          <Link href={card.sourceUrl}>See the record's data on Certified</Link>
        </p>
      </section>
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
  const door = useDescribeDoor();
  const own = !setAside && hasDraft(draft);
  const fit = useMemo(
    () =>
      own
        ? projectFit(card, {
            id: draft.id,
            revision: 0,
            needs: draft.needs.items.filter(({ decision }) => decision === "kept"),
            offers: draft.offers.items.filter(({ decision }) => decision === "kept"),
          })
        : null,
    [own, card, draft.id, draft.needs.items, draft.offers.items],
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
          <ButtonLink href={door.href} variant="secondary">
            {door.label}
          </ButtonLink>
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
  const several = fit.fits.length > 1;
  return (
    <>
      <Fit level={strength} explanation={FIT_BASIS[strength]} />
      <ul className="rc-reasons">
        {fit.fits.map(({ query, match }) => {
          const { direction, lead } = fitLead(match.evidenceKind);
          return (
            <li className="rc-reason" key={`${query.kind}:${query.entryId}`}>
              <Icon name={direction === "they-offer" ? "offer" : "need"} size="sm" />
              <span>
                {lead}: <strong>{String(query.value.title)}</strong>
              </span>
            </li>
          );
        })}
      </ul>
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
