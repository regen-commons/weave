import { useMemo, useState, type FormEvent } from "react";
import { useAccount } from "../account/context.tsx";
import { CAPITALS } from "../capitals.ts";
import { useDraft } from "../describe/use-draft.ts";
import { fundingFixture, type FixtureContext } from "../fixtures.ts";
import { catalogEntries } from "../funding/catalog.ts";
import { useCatalogBundle } from "../funding/use-catalog.ts";
import {
  CLOSING_SOON_DAYS, FUNDING_PREVIEW_COUNT, RECENT_PREVIEW_COUNT, fundingPreviews, homeDoors, homePreviews, openLabel, resumeLabel,
} from "../home.ts";
import { cardName, cardRoute } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { currentRoute, Link, navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo, routeWith } from "../routes.ts";
import { useSocial } from "../social/context.tsx";
import { readWorkspaceResume } from "../initiative/workspace-resume.ts";
import { useSetAside } from "../account/set-aside.ts";
import { teamWorkspacePath } from "../routes.ts";
import { BUILDER, COMMONS, EIGHT_FORMS_OF_CAPITAL } from "../links.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { CardGridSkeleton } from "../ui/CardSkeleton.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { HomeHero, Stack } from "../ui/layouts.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { NumberedList } from "../ui/NumberedList.tsx";
import { OpportunityCard } from "../ui/OpportunityCard.tsx";
import { Section } from "../ui/Section.tsx";
import { TileGrid } from "../ui/TileGrid.tsx";
import { PublicProjectCard, usePublicProjects } from "../partners/PublicProjects.tsx";
import { sharedLabel } from "../partners/public-projects.ts";

/**
 * Home says what Weave is and where to start. Its hero has two doors: start an initiative, or
 * open one the person already has. A person with a card to come back to gets one action instead,
 * to resume it, so the page keeps one solid primary.
 */
export function Home({ fixture }: { fixture?: FixtureContext }) {
  const [search, setSearch] = useState("");
  const { draft } = useDraft();
  const status = useCardStatus();
  const account = useAccount();
  const social = useSocial();
  const asOf = fixture?.asOf ?? new Date().toISOString().slice(0, 10);
  const previews = homePreviews(fixture?.initiatives ?? [], asOf);
  // Without the example world, Recently shared lists the newest public Certified projects.
  const { list: published, retry: retryPublished } = usePublicProjects("", { limit: RECENT_PREVIEW_COUNT, enabled: !fixture });
  const publishedReady = published.status === "ready" ? published : null;
  const recent = fixture ? previews.recent : [];
  const sharedCount = fixture ? previews.sharedCount : publishedReady?.page.index.total ?? 0;
  // The live funding catalog, read once the page is idle and shared with Funding. The example
  // world brings its own, as Funding's does.
  const fundingExample = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  const catalog = useCatalogBundle(fundingExample, { idle: true });
  const { upcoming, closingSoon } = useMemo(
    () => fundingPreviews(catalog.bundle ? catalogEntries(catalog.bundle) : [], new Date()),
    [catalog.bundle],
  );
  const loading = fixture?.state === "loading";
  const failed = fixture?.state === "error";
  const fundingLoading = loading || catalog.loading;
  const fundingFailed = failed || catalog.failed;
  const long = fixture?.state === "long";
  const example = social?.mode === "fixture" ? social.state : null;
  let resumeId: string | null = null;
  try { if (account.state?.user) resumeId = readWorkspaceResume(account.state.user.id, window.localStorage); } catch { /* Optional navigation hint. */ }
  const resume = social?.mode === "live" ? social.state.workspaces?.find(item => item.workspaceId === resumeId && item.group) : null;
  const signedIn = example ? !!example.identity : !!account.state?.user;
  // Initiatives a signed-in person keeps somewhere other than this device.
  const elsewhere = !signedIn
    ? 0
    : example
      ? example.cards.length + example.records.length
      : (account.state?.items.length ?? 0) + (social?.state.workspaces?.length ?? 0);
  const route = cardRoute(draft);
  // Another account's card on this device is not one to resume here (DL-055).
  const setAside = useSetAside();
  const doors = homeDoors((status.state !== "none" && !setAside) || !!resume, elsewhere);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ q: search.trim() });
    navigate(fixtureHref(`${pathTo("initiatives")}?${query}`, routeSearch(), import.meta.env.DEV));
  }
  function retry() {
    if (catalog.failed) catalog.retry();
    if (failed) navigate(routeWith(currentRoute(), "state", "ready"));
  }
  const skeleton = (kind: "funding" | "initiative" | "project", preview: "row" | "rows") => (
    <div aria-busy="true">
      <p className="rc-visually-hidden" role="status">
        Loading
      </p>
      {/* As many shapes as the preview asks for; its layout shows the same whole rows of either (DL-108). */}
      <CardGridSkeleton kind={kind} preview={preview} count={preview === "row" ? FUNDING_PREVIEW_COUNT : RECENT_PREVIEW_COUNT} />
    </div>
  );
  return (
    <Stack wide>
      <HomeHero
        actions={
          <>
            {doors.resume && (
              <ButtonLink href={resume?.workspaceId ? teamWorkspacePath(resume.workspaceId) : pathTo(route)} variant="primary" size="lg">
                {resume ? "Continue Your Initiative" : resumeLabel(route)}
              </ButtonLink>
            )}
            {doors.start && (
              <ButtonLink href={pathTo("new-initiative")} variant={doors.start} size="lg">
                Start An Initiative
              </ButtonLink>
            )}
            {/* Choosing a Certified project exists only in the example world, so only its door names Certified. */}
            {doors.open && (
              <ButtonLink href={pathTo("your-initiatives")} variant={doors.open} size="lg">
                {openLabel(example && { signedIn, projects: example.records.length })}
              </ButtonLink>
            )}
          </>
        }
        search={
          <form className="rc-field" role="search" onSubmit={submit} action={pathTo("initiatives")}>
            <label htmlFor="home-search">Search initiatives</label>
            <div className="rc-search rc-inline-field">
              <input
                className="rc-input"
                type="search"
                id="home-search"
                name="q"
                enterKeyHint="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <button className="rc-button" data-variant="secondary" type="submit">
                Search
              </button>
            </div>
          </form>
        }
        live={
          loading || failed ? (
            <p className="rc-meta">{loading ? "Loading what is new" : "The latest did not load"}</p>
          ) : (
            <>
              {sharedCount > 0 && (
                <ButtonLink href={pathTo("initiatives")} variant="quiet" size="sm">
                  {fixture ? `${sharedCount} ${sharedCount === 1 ? "Initiative" : "Initiatives"} Shared` : sharedLabel(sharedCount)}
                </ButtonLink>
              )}
              {/* Opens Funding on the same deadlines it counts, soonest first. */}
              {closingSoon > 0 && (
                <ButtonLink
                  href={`${pathTo("funding")}?closing=${CLOSING_SOON_DAYS}&sort=closing`}
                  variant="quiet"
                  size="sm"
                >
                  {closingSoon} {closingSoon === 1 ? "Fund" : "Funds"} Closing Soon
                </ButtonLink>
              )}
            </>
          )
        }
      >
        <Heading level={1} size="hero" id="home-title">
          {long ? (
            <span lang="pt">
              Encontre parceiros e financiamento para o <em>trabalho regenerativo</em>
            </span>
          ) : (
            <>
              Find Partners And Funding For <em>Regenerative Work</em>
            </>
          )}
        </Heading>
        {doors.resume ? (
          <p className="rc-prose">
            <strong>{resume?.name ?? cardName(draft)}</strong>. {resume ? "Saved in your team workspace." : status.line}
          </p>
        ) : (
          <p className="rc-prose">Describe your initiative once to find support.</p>
        )}
      </HomeHero>
      {fixture?.state === "offline" && (
        <p className="rc-notice" data-tone="info">
          You are offline. These lists may be out of date.
        </p>
      )}
      {(failed || catalog.failed) && (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The latest did not load</h2>
            <button className="rc-button" data-variant="secondary" type="button" onClick={retry}>
              Try Again
            </button>
          </div>
        </section>
      )}
      <Section id="how" title="Three Steps">
        <NumberedList
          items={[
            {
              title: long ? "Conte sobre a sua iniciativa e o trabalho que fazem juntos" : "Describe Your Initiative",
              note: "Four short fields.",
            },
            { title: "Add What You Need And Can Offer", note: "Up to four of each." },
            {
              // The maker's wording, chosen over "fit", which the results pages keep (DL-063).
              title: "See Funding And Partners That Align",
              // The step names two things, and only one of them works signed out.
              note: "Funding needs no sign-in. Partners start with a Certified project.",
            },
          ]}
        />
      </Section>
      <Section
        id="kinds"
        title="Money Is One Of Eight Kinds Of Support"
        note={
          <>
            An initiative also runs on skills, relationships, land and culture. Every need and offer in
            Weave names its kind, an idea from <Link href={EIGHT_FORMS_OF_CAPITAL}>the eight forms of capital</Link>.
          </>
        }
      >
        <TileGrid capitals={CAPITALS} />
      </Section>
      <Section
        id="soon"
        title="Funding Closing Soon"
        action={
          <ButtonLink href={pathTo("funding")} variant="quiet" size="sm">
            See All Funding
          </ButtonLink>
        }
      >
        {fundingLoading ? (
          skeleton("funding", "row")
        ) : upcoming.length && !fundingFailed ? (
          <CardGrid preview="row">
            {upcoming.map((entry) => (
              <li key={entry.id}>
                <OpportunityCard entry={entry} level={3} />
              </li>
            ))}
          </CardGrid>
        ) : (
          <EmptyState
            title={fundingFailed ? "Funding did not load" : "No closing dates coming up"}
            action={
              <ButtonLink href={pathTo("funding")} variant="quiet">
                Browse Funding
              </ButtonLink>
            }
          >
            {fundingFailed ? "Try again above." : "Some funding has no closing date. Funding lists it all."}
          </EmptyState>
        )}
      </Section>
      <Section
        id="recent"
        title="Recently Shared"
        action={
          <ButtonLink href={pathTo("initiatives")} variant="quiet" size="sm">
            Browse All Initiatives
          </ButtonLink>
        }
      >
        {loading || (!fixture && published.status === "loading") ? (
          skeleton(fixture ? "initiative" : "project", "rows")
        ) : publishedReady && publishedReady.projects.length ? (
          <CardGrid preview="rows">
            {publishedReady.projects.map((project) => (
              <li key={project.uri}>
                <PublicProjectCard project={project} level={3} />
              </li>
            ))}
          </CardGrid>
        ) : recent.length && !failed ? (
          <CardGrid preview="rows">
            {recent.map((record) => (
              <li key={record.id}>
                <ListingCard record={record} level={3} />
              </li>
            ))}
          </CardGrid>
        ) : !fixture && published.status === "failed" ? (
          <EmptyState
            title="Shared initiatives did not load"
            action={
              <button className="rc-button" data-variant="secondary" type="button" onClick={retryPublished}>
                Try Again
              </button>
            }
          >
            Initiatives still lists a few public sources.
          </EmptyState>
        ) : (
          <EmptyState
            title={failed ? "Shared initiatives did not load" : "No shared initiatives here yet"}
            action={
              <ButtonLink href={pathTo("new-initiative")} variant="secondary">
                Start An Initiative
              </ButtonLink>
            }
          >
            {failed ? "Try again above." : "Shared initiatives will appear here."}
          </EmptyState>
        )}
      </Section>
      <Section
        id="commons"
        title="Part Of Regen Commons"
        note={
          <>
            Regen Commons is a shared home for the regenerative movement. Across places and practices, people
            are regenerating the same living systems, often without knowing each other exists. Weave helps
            them find each other.
          </>
        }
      >
        <div className="rc-action-bar">
          <ButtonLink href={COMMONS.learn} variant="secondary">
            Learn About Regen Commons
          </ButtonLink>
          <ButtonLink href={COMMONS.membership} variant="secondary">
            Become A Member
          </ButtonLink>
        </div>
        <p className="rc-meta">
          Weave is built by <Link href={BUILDER.href}>{BUILDER.name}</Link>.
        </p>
      </Section>
    </Stack>
  );
}
