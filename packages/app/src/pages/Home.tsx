import { useState, type FormEvent } from "react";
import { useAccount } from "../account/context.tsx";
import { CAPITALS } from "../capitals.ts";
import { useDraft } from "../describe/use-draft.ts";
import type { FixtureContext } from "../fixtures.ts";
import { CLOSING_SOON_DAYS, homeDoors, homePreviews, openLabel, resumeLabel } from "../home.ts";
import { cardName, cardRoute } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { currentRoute, navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo, routeWith } from "../routes.ts";
import { useSocial } from "../social/context.tsx";
import { readWorkspaceResume } from "../initiative/workspace-resume.ts";
import { teamWorkspacePath } from "../routes.ts";
import { BUILDER, COMMONS, EIGHT_FORMS_OF_CAPITAL } from "../links.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { HomeHero, Stack } from "../ui/layouts.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { NumberedList } from "../ui/NumberedList.tsx";
import { Section } from "../ui/Section.tsx";
import { TileGrid } from "../ui/TileGrid.tsx";

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
  const { recent, upcoming, sharedCount, closingSoon } = homePreviews(
    fixture?.initiatives ?? [],
    fixture?.funding ?? [],
    asOf,
  );
  const loading = fixture?.state === "loading";
  const failed = fixture?.state === "error";
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
  const doors = homeDoors(status.state !== "none" || !!resume, elsewhere);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ q: search.trim() });
    navigate(fixtureHref(`${pathTo("initiatives")}?${query}`, routeSearch(), import.meta.env.DEV));
  }
  function retry() {
    navigate(routeWith(currentRoute(), "state", "ready"));
  }
  const skeleton = (
    <div className="rc-stack" aria-busy="true">
      <p role="status">Loading</p>
      <div className="rc-skeleton" />
      <div className="rc-skeleton" />
    </div>
  );
  return (
    <Stack wide>
      <HomeHero
        actions={
          <>
            {doors.resume && (
              <ButtonLink href={resume?.workspaceId ? teamWorkspacePath(resume.workspaceId) : pathTo(route)} variant="primary" size="lg">
                {resume ? "Continue your initiative" : resumeLabel(route)}
              </ButtonLink>
            )}
            {doors.start && (
              <ButtonLink href={pathTo("initiative")} variant={doors.start} size="lg">
                Start an initiative
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
                  {sharedCount} {sharedCount === 1 ? "initiative" : "initiatives"} shared
                </ButtonLink>
              )}
              {/* Opens Funding on the same deadlines it counts, soonest first. */}
              {closingSoon > 0 && (
                <ButtonLink
                  href={`${pathTo("funding")}?closing=${CLOSING_SOON_DAYS}&sort=closing`}
                  variant="quiet"
                  size="sm"
                >
                  {closingSoon} {closingSoon === 1 ? "fund" : "funds"} closing soon
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
              Find partners and funding for <em>regenerative work</em>
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
      {failed && (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The latest did not load</h2>
            <button className="rc-button" data-variant="secondary" type="button" onClick={retry}>
              Try again
            </button>
          </div>
        </section>
      )}
      <Section id="how" title="Three steps">
        <NumberedList
          items={[
            {
              title: long ? "Conte sobre a sua iniciativa e o trabalho que fazem juntos" : "Describe your initiative",
              note: "Four short fields.",
            },
            { title: "Add what you need and can offer", note: "Up to five of each." },
            {
              title: "See funding that fits",
              // Linking a project is not built outside the example world, so only there does the note name it.
              note:
                import.meta.env.DEV && social
                  ? "No sign-in needed. Partner suggestions start with a Certified project."
                  : "No sign-in needed.",
            },
          ]}
        />
      </Section>
      <Section
        id="kinds"
        title="Money is one of eight kinds of support"
        note={
          <>
            An initiative also runs on skills, relationships, land and culture. Every need and offer in
            Weave names its kind, an idea from <a href={EIGHT_FORMS_OF_CAPITAL}>the eight forms of capital</a>.
          </>
        }
      >
        <TileGrid capitals={CAPITALS} />
      </Section>
      <Section
        id="soon"
        title="Funding closing soon"
        action={
          <ButtonLink href={pathTo("funding")} variant="quiet" size="sm">
            See all funding
          </ButtonLink>
        }
      >
        {loading ? (
          skeleton
        ) : upcoming.length && !failed ? (
          <CardGrid>
            {upcoming.map(({ record, days }) => (
              <li key={record.id}>
                <ListingCard record={record} level={3} days={days} />
              </li>
            ))}
          </CardGrid>
        ) : (
          <EmptyState
            title={failed ? "Funding did not load" : "No upcoming deadlines here yet"}
            action={
              <ButtonLink href={pathTo("funding")} variant="quiet">
                Browse funding
              </ButtonLink>
            }
          >
            {failed
              ? "Try again above."
              : "The current catalog remains available through Funding Commons."}
          </EmptyState>
        )}
      </Section>
      <Section
        id="recent"
        title="Recently shared"
        action={
          <ButtonLink href={pathTo("initiatives")} variant="quiet" size="sm">
            Browse all initiatives
          </ButtonLink>
        }
      >
        {loading ? (
          skeleton
        ) : recent.length && !failed ? (
          <CardGrid>
            {recent.map((record) => (
              <li key={record.id}>
                <ListingCard record={record} level={3} />
              </li>
            ))}
          </CardGrid>
        ) : (
          <EmptyState
            title={failed ? "Shared initiatives did not load" : "No shared initiatives here yet"}
            action={
              <ButtonLink href={pathTo("initiative")} variant="secondary">
                Start an initiative
              </ButtonLink>
            }
          >
            {failed ? "Try again above." : "Shared initiatives will appear here."}
          </EmptyState>
        )}
      </Section>
      <Section
        id="commons"
        title="Built by Regen Commons"
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
            Learn about Regen Commons
          </ButtonLink>
          <ButtonLink href={COMMONS.membership} variant="secondary">
            Become a member
          </ButtonLink>
        </div>
        <p className="rc-meta">
          Weave is built by <a href={BUILDER.href}>{BUILDER.name}</a> for Regen Commons.
        </p>
      </Section>
    </Stack>
  );
}
