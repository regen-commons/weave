import { useState, type FormEvent } from "react";
import { CAPITALS } from "../capitals.ts";
import type { FixtureContext } from "../fixtures.ts";
import { fullDate, homePreviews } from "../home.ts";
import { navigate } from "../router.tsx";
import { fixtureHref, pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { CardGrid } from "../ui/Card.tsx";
import { EmptyState } from "../ui/EmptyState.tsx";
import { Heading } from "../ui/Heading.tsx";
import { HomeHero, Stack } from "../ui/layouts.tsx";
import { ListingCard } from "../ui/ListingCard.tsx";
import { NumberedList } from "../ui/NumberedList.tsx";
import { Section } from "../ui/Section.tsx";
import { TileGrid } from "../ui/TileGrid.tsx";

export function Home({ fixture }: { fixture?: FixtureContext }) {
  const [search, setSearch] = useState("");
  const asOf = fixture?.asOf ?? new Date().toISOString().slice(0, 10);
  const { recent, upcoming, sharedCount } = homePreviews(
    fixture?.initiatives ?? [],
    fixture?.funding ?? [],
    asOf,
  );
  const loading = fixture?.state === "loading";
  const failed = fixture?.state === "error";
  const long = fixture?.state === "long";
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = new URLSearchParams({ q: search.trim() });
    navigate(fixtureHref(`${pathTo("initiatives")}?${query}`, window.location.search, import.meta.env.DEV));
  }
  function retry() {
    const url = new URL(window.location.href);
    url.searchParams.set("state", "ready");
    navigate(`${url.pathname}${url.search}`);
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
      <HomeHero
        actions={
          <>
            <ButtonLink href={pathTo("initiative")} variant="primary" size="lg">
              Describe your initiative
            </ButtonLink>
            <ButtonLink href={pathTo("initiatives")} variant="secondary" size="lg">
              Browse initiatives
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
          !loading && !failed && sharedCount > 0 ? (
            <ButtonLink href={pathTo("initiatives")} variant="quiet" size="sm">
              {sharedCount} example {sharedCount === 1 ? "initiative" : "initiatives"} shared
            </ButtonLink>
          ) : (
            <p className="rc-meta">
              {loading
                ? "Loading what is new"
                : failed
                  ? "Latest examples unavailable"
                  : "A place for shared regenerative work"}
            </p>
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
          You are viewing offline examples. The rest of this page still works on this device.
        </p>
      )}
      {failed && (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <h2 className="rc-notice-title">The latest examples did not load</h2>
            <p>You can still explore the steps and kinds of support.</p>
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
              title: long ? "Conte sobre a sua iniciativa e o trabalho que fazem juntos" : "Tell us about it",
              note: "Start with the work you do together.",
              href: pathTo("initiative"),
            },
            {
              title: "Say what you need and offer",
              note: "Up to five of each. Money is one of eight kinds.",
            },
            { title: "See who fits", note: "Funding first. Partners once you share." },
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
              <ButtonLink href={pathTo("initiative")} variant="primary">
                Describe your initiative
              </ButtonLink>
            }
          >
            {failed
              ? "Try loading the examples again above."
              : "Shared initiatives will appear here."}
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
              <ButtonLink href={pathTo("funding")} variant="secondary">
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
