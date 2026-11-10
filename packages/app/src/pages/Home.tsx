import { useState, type FormEvent } from "react";
import { useAccount } from "../account/context.tsx";
import { CAPITALS } from "../capitals.ts";
import { useDraft } from "../describe/use-draft.ts";
import type { FixtureContext } from "../fixtures.ts";
import { fullDate, homeDoors, homePreviews, resumeLabel } from "../home.ts";
import { cardName, cardRoute } from "../initiative/status.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { currentRoute, navigate, routeSearch } from "../router.tsx";
import { fixtureHref, pathTo, routeWith } from "../routes.ts";
import { useSocialFixture } from "../social/context.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { HomeHero, Stack } from "../ui/layouts.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { NumberedList } from "../ui/NumberedList.tsx";
import { Section } from "../ui/Section.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import { TileGrid } from "../ui/TileGrid.tsx";

/**
 * Home says what Weave is and where to start. It has two doors: start an initiative, or open one
 * the person already has. A person with a card to come back to resumes it from the status line
 * instead, and the doors step back so the page keeps one solid primary.
 */
export function Home({ fixture }: { fixture?: FixtureContext }) {
  const [search, setSearch] = useState("");
  const { draft } = useDraft();
  const status = useCardStatus();
  const account = useAccount();
  const social = useSocialFixture();
  const asOf = fixture?.asOf ?? new Date().toISOString().slice(0, 10);
  const { recent, upcoming, sharedCount } = homePreviews(
    fixture?.initiatives ?? [],
    fixture?.funding ?? [],
    asOf,
  );
  const loading = fixture?.state === "loading";
  const failed = fixture?.state === "error";
  const long = fixture?.state === "long";
  const example = import.meta.env.DEV && social ? social.state : null;
  const signedIn = example ? !!example.identity : !!account.state?.user;
  // Initiatives a signed-in person keeps somewhere other than this device.
  const elsewhere = !signedIn
    ? 0
    : example
      ? example.cards.length + example.records.length
      : (account.state?.items.length ?? 0);
  const route = cardRoute(draft);
  const doors = homeDoors(status.state !== "none", elsewhere);
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
      <p role="status">Loading examples</p>
      <div className="rc-skeleton" />
      <div className="rc-skeleton" />
    </div>
  );
  return (
    <Stack wide>
      {doors.resume && (
        <StatusLine
          state={status.state}
          actions={
            <ButtonLink href={pathTo(route)} variant="primary" size="sm">
              {resumeLabel(route)}
            </ButtonLink>
          }
        >
          <strong>{cardName(draft)}</strong>. {status.line}
        </StatusLine>
      )}
      <HomeHero
        actions={
          <>
            <ButtonLink href={pathTo("initiative")} variant={doors.start} size="lg">
              Start an initiative
            </ButtonLink>
            {/* Choosing a Certified project exists only in the example world, so only its door names Certified. */}
            <ButtonLink href={pathTo("your-initiatives")} variant={doors.open} size="lg">
              {import.meta.env.DEV && social ? "Open one from Certified" : "Open your saved initiative"}
            </ButtonLink>
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
            <p className="rc-meta">{loading ? "Loading what is new" : "Latest examples unavailable"}</p>
          ) : (
            sharedCount > 0 && (
              <ButtonLink href={pathTo("initiatives")} variant="quiet" size="sm">
                {sharedCount} example {sharedCount === 1 ? "initiative" : "initiatives"} shared
              </ButtonLink>
            )
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
        <p className="rc-prose">Describe your initiative once to find support.</p>
      </HomeHero>
      {fixture?.state === "offline" && (
        <p className="rc-notice" data-tone="info">
          You are viewing offline examples.
        </p>
      )}
      {failed && (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The latest examples did not load</h2>
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
              href: pathTo("initiative"),
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
      <Section id="kinds" title="Money is one of eight kinds of support">
        <TileGrid capitals={CAPITALS} />
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
            title={failed ? "Shared examples unavailable" : "No shared initiatives here yet"}
            action={
              <ButtonLink href={pathTo("initiative")} variant="secondary">
                Start an initiative
              </ButtonLink>
            }
          >
            {failed ? "Try loading the examples again above." : "Shared initiatives will appear here."}
          </EmptyState>
        )}
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
        {fixture && (
          <p className="rc-meta">Example dates as of {fullDate(asOf)}. Check eligibility with the funder.</p>
        )}
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
            title={failed ? "Funding examples unavailable" : "No upcoming deadlines here yet"}
            action={
              <ButtonLink href={pathTo("funding")} variant="quiet">
                Browse funding
              </ButtonLink>
            }
          >
            {failed
              ? "Try loading the examples again above."
              : "The current catalog remains available through Funding Commons."}
          </EmptyState>
        )}
      </Section>
    </Stack>
  );
}
