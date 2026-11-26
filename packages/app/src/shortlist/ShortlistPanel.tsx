import { useId, useMemo, useRef, useState } from "react";
import { catalogEntries, researchSnapshotDate } from "../funding/catalog.ts";
import type { Entry } from "../funding/contracts.ts";
import { fundingDocument, fundingExport, fundingCsv, fundingFileName } from "../funding/export.ts";
import { useCatalogBundle } from "../funding/use-catalog.ts";
import { ExportMenu } from "../export/ExportMenu.tsx";
import {
  initiativeCsv, initiativeDocument, initiativeExport, initiativeFileName,
} from "../partners/initiative-export.ts";
import { requestPublicInitiative } from "../partners/public-initiative.ts";
import type { PublicInitiative } from "@weave/api/public-initiative-contract";
import { Link, replaceRouteQuietly, routePath } from "../router.tsx";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Section } from "../ui/Section.tsx";
import { StatusLine } from "../ui/StatusLine.tsx";
import type { FundItem, InitiativeItem } from "./items.ts";
import { fundRows, initiativeRows, openingKind, shortlistSummary, type ShortlistKindName, type ShortlistRow } from "./rows.ts";
import { SHORTLIST_NOT_KEPT, ShortlistToggle } from "./ShortlistButton.tsx";
import type { ShortlistEntry } from "./store.ts";
import { useInitiativeLookups } from "./use-initiative-lookups.ts";
import { useFundShortlist, useInitiativeShortlist } from "./use-shortlist.ts";

/** Which kind this viewer last looked at: a convenience kept in this browser, never needed. */
const KIND_KEY = "weave-shortlist-kind";
function rememberedKind(): string | null {
  try {
    return localStorage.getItem(KIND_KEY);
  } catch {
    return null;
  }
}
function remember(kind: ShortlistKindName) {
  try {
    localStorage.setItem(KIND_KEY, kind);
  } catch {
    /* The choice still holds for this visit. */
  }
}

/**
 * The shortlist in the order it was kept, newest first, with anything taken off while it is open left
 * in place with its bookmark off, so no row jumps under the finger and pressing again puts it back.
 */
function useInPlace<T extends ShortlistEntry>(items: readonly T[]): { item: T; on: boolean }[] {
  const seen = useRef<T[]>([]);
  const known = new Set(seen.current.map((item) => item.id));
  seen.current = [...items.filter((item) => !known.has(item.id)), ...seen.current];
  const on = new Set(items.map((item) => item.id));
  return seen.current.map((item) => ({ item, on: on.has(item.id) }));
}

/**
 * One row (`rc-record-row`): the name, then one line of when and who, and the bookmark at its end. A
 * deadline within two weeks is in bold, and its words say how soon. A record its list no longer holds
 * keeps its name and offers Remove in the bookmark's place.
 */
function Row({ row, on, level, onToggle, onRemove }: {
  row: ShortlistRow;
  on: boolean;
  level: 2 | 3;
  onToggle(): void;
  onRemove(): void;
}) {
  const Title = level === 2 ? "h2" : "h3";
  return (
    <li className="rc-record-row" data-layout="actions">
      <div className="rc-record-text">
        <Title className="rc-record-title">{row.href ? <Link href={row.href}>{row.name}</Link> : row.name}</Title>
        <p className="rc-meta">
          {row.state === "checking" ? (
            <span className="rc-skeleton" data-shape="hold" aria-hidden="true">Closes in 00 days.</span>
          ) : row.soon ? (
            <strong>{row.when}</strong>
          ) : (
            row.when
          )}
          {row.by && <> {row.by}</>}
        </p>
      </div>
      <div className="rc-action-bar">
        {row.state === "gone" ? (
          <button className="rc-button" data-variant="quiet" data-size="sm" type="button" aria-label={`Remove ${row.name} from your shortlist`} onClick={onRemove}>
            Remove
          </button>
        ) : (
          <ShortlistToggle on={on} name={row.name} place="row" onPress={onToggle} />
        )}
      </div>
    </li>
  );
}

function Rows<T extends ShortlistEntry>({ rows, list, level, store }: {
  rows: readonly ShortlistRow[];
  list: readonly { item: T; on: boolean }[];
  level: 2 | 3;
  store: { toggle(item: T): unknown; remove(id: string): void };
}) {
  return (
    <ul className="rc-record-list">
      {rows.map((row, index) => {
        const { item, on } = list[index]!;
        // A gone record taken off has nothing left to show.
        if (row.state === "gone" && !on) return null;
        return (
          <Row key={row.id} row={row} on={on} level={level}
            onToggle={() => (on ? store.remove(item.id) : store.toggle(item))}
            onRemove={() => store.remove(item.id)} />
        );
      })}
    </ul>
  );
}

function Empty({ noun, href, browse }: { noun: "funds" | "initiatives"; href: string; browse: string }) {
  return (
    <div className="rc-action-bar">
      <p className="rc-meta">No {noun} on your shortlist yet. Press the bookmark on one to keep it here.</p>
      <ButtonLink href={href} variant="quiet" size="sm">{browse}</ButtonLink>
    </div>
  );
}

/** At most this many initiatives are read at once for an export. */
const EXPORT_AT_ONCE = 4;

/** Each shortlisted initiative read fresh, with its current needs and offers; the rest are counted, not named. */
async function readForExport(items: readonly InitiativeItem[]): Promise<{ found: PublicInitiative[]; leftOut: number }> {
  const answers: (PublicInitiative | null)[] = new Array(items.length).fill(null);
  let next = 0;
  const abort = new AbortController();
  async function work() {
    while (next < items.length) {
      const index = next++;
      try {
        const lookup = await requestPublicInitiative(items[index]!.id, abort.signal);
        answers[index] = lookup.status === "found" ? lookup.initiative : null;
      } catch {
        answers[index] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(EXPORT_AT_ONCE, items.length) }, work));
  const found = answers.filter((answer): answer is PublicInitiative => answer !== null);
  if (items.length && !found.length) throw Error("no_public_initiative");
  return { found, leftOut: items.length - found.length };
}

/** A few words for what Export takes. */
const what = (count: number, noun: "fund" | "initiative") => `your ${count} shortlisted ${noun}${count === 1 ? "" : "s"}`;

/** The initiatives' rows, which ask the public list about each one while they are shown. */
function InitiativeRows({ list, level }: { list: { item: InitiativeItem; on: boolean }[]; level: 2 | 3 }) {
  const shortlist = useInitiativeShortlist();
  const lookups = useInitiativeLookups(list.map(({ item }) => item.id));
  return <Rows rows={initiativeRows(list.map(({ item }) => item), lookups)} list={list} level={level} store={shortlist} />;
}

/**
 * The shortlist (DL-153): funds and initiatives a person marked, in one place, with a switch between
 * the two and Export for the kind shown. Beside Your Initiatives on a wide screen (`rail`), with
 * Export beside its heading, and its own page on a phone (`page`). Rows, not cards, so a dozen
 * records fit where three cards would. The catalog loads only while funds are shown.
 */
export function ShortlistPanel({ place, asked = null }: { place: "rail" | "page"; asked?: string | null }) {
  const funds = useFundShortlist();
  const initiatives = useInitiativeShortlist();
  const id = useId();
  const [kind, setKind] = useState<ShortlistKindName>(() =>
    openingKind(asked, rememberedKind(), funds.items.length, initiatives.items.length));
  const [problem, setProblem] = useState("");
  const fundList = useInPlace(funds.items);
  const initiativeList = useInPlace(initiatives.items);
  const showingFunds = kind === "funds";
  const catalog = useCatalogBundle(undefined, { enabled: showingFunds && fundList.length > 0 });
  const entries = useMemo(() => (catalog.bundle ? catalogEntries(catalog.bundle) : null), [catalog.bundle]);
  const level = place === "page" ? 2 : 3;

  function choose(next: ShortlistKindName) {
    setKind(next);
    setProblem("");
    remember(next);
    // On its own page the address carries the choice, so a link or the way back opens the same view.
    if (place === "page" && routePath() === pathTo("shortlist")) replaceRouteQuietly(`${pathTo("shortlist")}?show=${next}`);
  }

  // What Export takes: the funds shown that the catalog still holds, or the initiatives still kept.
  const byId = new Map(entries?.map((entry) => [entry.id, entry]));
  const exportedFunds = fundList.flatMap(({ item, on }): Entry[] => {
    const entry = on ? byId.get(item.id) : undefined;
    return entry ? [entry] : [];
  });
  const keptInitiatives = initiativeList.filter(({ on }) => on).map(({ item }) => item);
  const fundData = () =>
    fundingExport(exportedFunds, new Map(), {
      shortlist: true,
      initiative: null,
      catalogCheckedOn: catalog.bundle ? researchSnapshotDate(catalog.bundle.catalog) : null,
    });
  const exportMenu = showingFunds ? (
    <ExportMenu
      size="sm"
      count={exportedFunds.length}
      what={what(exportedFunds.length, "fund")}
      waiting={fundList.length > 0 && !entries && !catalog.failed}
      onProblem={setProblem}
      csv={async () => {
        const data = fundData();
        return { name: fundingFileName(data, "csv"), text: fundingCsv(data) };
      }}
      pdf={async () => {
        const data = fundData();
        return { name: fundingFileName(data, "pdf"), document: fundingDocument(data) };
      }}
    />
  ) : (
    <ExportMenu
      size="sm"
      count={keptInitiatives.length}
      what={what(keptInitiatives.length, "initiative")}
      onProblem={setProblem}
      csv={async () => {
        const { found, leftOut } = await readForExport(keptInitiatives);
        const data = initiativeExport(found, leftOut);
        return { name: initiativeFileName(data, "csv"), text: initiativeCsv(data) };
      }}
      pdf={async () => {
        const { found, leftOut } = await readForExport(keptInitiatives);
        const data = initiativeExport(found, leftOut);
        return { name: initiativeFileName(data, "pdf"), document: initiativeDocument(data) };
      }}
    />
  );

  const switcher = (
    <fieldset>
      <legend className="rc-visually-hidden">Show on your shortlist</legend>
      <div className="rc-chip-group">
        {(["funds", "initiatives"] as const).map((value) => (
          <label className="rc-chip" key={value}>
            <input className="rc-check" type="radio" name={`${id}-kind`} checked={kind === value} onChange={() => choose(value)} />
            {value === "funds" ? `Funds (${funds.items.length})` : `Initiatives (${initiatives.items.length})`}
          </label>
        ))}
      </div>
    </fieldset>
  );
  const body = (
    <>
      {/* In the rail, Export sits beside the heading; on the page, beside the switch. */}
      {place === "rail" ? switcher : <div className="rc-action-bar">{switcher}{exportMenu}</div>}
      {showingFunds ? (
        fundList.length ? (
          <Rows rows={fundRows(fundList.map(({ item }) => item), entries ?? (catalog.failed ? "failed" : "loading"))}
            list={fundList} level={level} store={funds} />
        ) : (
          <Empty noun="funds" href={pathTo("funding")} browse="Browse Funding" />
        )
      ) : initiativeList.length ? (
        <InitiativeRows list={initiativeList} level={level} />
      ) : (
        <Empty noun="initiatives" href={pathTo("initiatives")} browse="Browse Initiatives" />
      )}
      {showingFunds && catalog.failed && (
        <div className="rc-action-bar">
          <p className="rc-meta">The catalog did not load, so deadlines are not shown.</p>
          <button className="rc-button" data-variant="quiet" data-size="sm" type="button" onClick={catalog.retry}>Try Again</button>
        </div>
      )}
      {problem && <p className="rc-notice" data-tone="warning" role="alert">{problem}</p>}
      <p className="rc-meta">{!funds.kept || !initiatives.kept ? SHORTLIST_NOT_KEPT : "Kept in this browser only."}</p>
    </>
  );
  return place === "rail" ? (
    <Section id={`${id}-title`} title="Shortlist" action={exportMenu}>{body}</Section>
  ) : (
    <div className="rc-stack">{body}</div>
  );
}

/**
 * The shortlist in one line, with the way to it, for where the rail is not drawn: under Your
 * Initiatives' heading on a phone (`until="wide"`), or at every width where the page has no rail.
 * Nothing at all while the shortlist is empty.
 */
export function ShortlistLine({ until }: { until?: "wide" }) {
  const funds = useFundShortlist();
  const initiatives = useInitiativeShortlist();
  const summary = shortlistSummary(funds.items.length, initiatives.items.length);
  if (!summary) return null;
  return (
    <StatusLine
      until={until}
      actions={<ButtonLink href={pathTo("shortlist")} variant="secondary" size="sm">Open Shortlist</ButtonLink>}
    >
      {summary}
    </StatusLine>
  );
}

/**
 * The shortlist for the side panel beside Your Initiatives, or nothing at all while it is empty, so
 * the panel stays empty and the page keeps its whole width (DL-153). Once shown on a visit it stays,
 * so taking the last record off does not pull the page out from under the person.
 */
export function ShortlistRail() {
  const funds = useFundShortlist();
  const initiatives = useInitiativeShortlist();
  const shown = useRef(false);
  if (funds.items.length || initiatives.items.length) shown.current = true;
  return shown.current ? <ShortlistPanel place="rail" /> : null;
}
