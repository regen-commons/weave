import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import {
  activeChoices,
  choicesKey,
  chosenSort,
  defaultSort,
  narrowing,
  pickedValue,
  pressOption,
  sortChoice,
  underAppBar,
  withoutChoice,
  type Facet,
  type SortChoice,
} from "../filters.ts";
import { Dialog } from "./Dialog.tsx";
import { Icon } from "./Icon.tsx";
import { RadioMenu } from "./RadioMenu.tsx";

type ChangeFacet = (key: string, chosen: readonly string[]) => void;

/**
 * A facet's options as native checks or radios: rows in a wide screen's menu, chips in a phone's
 * sheet. Each place needs its own `name`, or two copies of one radio group would act as one.
 */
function Options({ facet, name, chips, onChange }: {
  facet: Facet;
  name: string;
  chips: boolean;
  onChange: ChangeFacet;
}) {
  const picked = pickedValue(facet);
  return facet.options.map((option) => (
    <label className={chips ? "rc-chip" : "rc-menu-option"} key={option.value}>
      <input
        className="rc-check"
        type={facet.kind === "one" ? "radio" : "checkbox"}
        name={facet.kind === "one" ? name : undefined}
        checked={facet.kind === "one" ? picked === option.value : facet.chosen.includes(option.value)}
        onChange={() => onChange(facet.key, pressOption(facet, option.value))}
      />
      {option.label}
    </label>
  ));
}

/** From this many options a menu reads down two columns, so it stays a menu and does not fill the window. */
const LONG_MENU = 9;

/** One filter's menu, for screens wide enough to give each filter its own button. */
function FilterMenu({ facet, name, onChange }: { facet: Facet; name: string; onChange: ChangeFacet }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, []);
  const count = narrowing(facet);
  return (
    <>
      <button
        className="rc-button"
        data-variant="secondary"
        data-filter="one"
        data-facet={facet.key}
        data-active={count > 0}
        type="button"
        ref={trigger}
        popoverTarget={id}
      >
        {facet.label}
        {count > 0 ? ` (${count})` : ""}
      </button>
      <div className="rc-menu" ref={panel} id={id} popover="auto">
        {facet.scope && (
          <fieldset className="rc-menu-group">
            <legend>{facet.scope.label}</legend>
            <div className="rc-menu-options">
              <Options facet={facet.scope} name={`${name}-scope`} chips={false} onChange={onChange} />
            </div>
          </fieldset>
        )}
        <fieldset className="rc-menu-group">
          <legend>{facet.label}</legend>
          <div className="rc-menu-options" data-columns={facet.options.length >= LONG_MENU ? "2" : undefined}>
            <Options facet={facet} name={name} chips={false} onChange={onChange} />
          </div>
        </fieldset>
        <button type="button" className="rc-button" data-variant="quiet" data-close-popover>
          Done
        </button>
      </div>
    </>
  );
}

/**
 * Sort on a wide screen: one more button in the bar that opens the same menu a filter opens, with one
 * order to pick (DL-100). It says only "Sort", so it never grows with a long order's name; an order
 * other than the list's own shows as a chip, and the button is marked in use like a chosen filter
 * (DL-122). A phone leaves it out, since Sort is the first group in its sheet.
 */
function SortMenu({ sort, name, onSort }: { sort: SortChoice; name: string; onSort(value: string): void }) {
  const current = sortChoice(sort);
  return (
    <RadioMenu
      label="Sort"
      legend="Sort"
      name={name}
      options={sort.options}
      value={current?.value}
      onChange={onSort}
      align="end"
      filter="one"
      active={!!chosenSort(sort)}
    />
  );
}

/**
 * The row of controls: on a phone one Filters button that opens the sheet, and on a wide screen a
 * menu for each filter and Sort. The bar draws it under the search, and the pinned row draws it
 * again while the bar is out of view, so each copy names its radios for its own place.
 */
function Controls({ place, facets, onFacet, sort, onSort, sheetLabel, narrowed, ordered, onSheet, lead }: {
  place: string;
  facets: readonly Facet[];
  onFacet: ChangeFacet;
  sort?: SortChoice;
  onSort?(value: string): void;
  sheetLabel: string;
  narrowed: number;
  ordered: boolean;
  onSheet(): void;
  /** What comes first in the row, such as the pinned row's way back to the search. */
  lead?: ReactNode;
}) {
  return (
    <div className="rc-filter-controls">
      {lead}
      <button
        className="rc-button"
        data-variant="secondary"
        data-filter="all"
        data-active={narrowed > 0 || ordered}
        type="button"
        onClick={onSheet}
      >
        <Icon name="filter" size="sm" />
        {sheetLabel}{narrowed > 0 ? ` (${narrowed})` : ""}
      </button>
      {facets.map((facet) => (
        <FilterMenu key={facet.key} facet={facet} name={`${place}-${facet.key}-menu`} onChange={onFacet} />
      ))}
      {sort && onSort && <SortMenu sort={sort} name={`${place}-sort`} onSort={onSort} />}
    </div>
  );
}

/**
 * How far down the window the app bar reaches while the page scrolls, which whatever sticks to the
 * top keeps clear of. None in a short window, where the page's header scrolls away (DL-132).
 */
function appBarHeight(): number {
  const appBar = document.querySelector<HTMLElement>(".rc-app-header");
  if (!appBar) return 0;
  const header = appBar.closest<HTMLElement>(".rc-app-head") ?? appBar;
  return getComputedStyle(header).position === "sticky" ? appBar.offsetHeight : 0;
}

/**
 * Brings the bar back up under the app bar, at once: a glide back over a long list would be slow,
 * and one that starts as focus moves can stop where it began.
 */
function toBar(section: HTMLElement) {
  const gap = Number.parseFloat(getComputedStyle(section).rowGap) || 0;
  const top = section.getBoundingClientRect().top + window.scrollY - appBarHeight() - gap;
  window.scrollTo({ top: Math.max(0, top), behavior: "instant" });
}

/**
 * Filter bar organism (`rc-filter-bar`): the same on every list, in the same place under the page's
 * opening line (DL-061, DL-081). Search, the filters, Sort, the choices in force as removable chips,
 * and how much of the list is left. The list narrows as a person types, so the field has no button.
 * On a phone one Filters button opens every filter in a sheet, with Sort as its first group; a wide
 * screen gives each filter its own menu and Sort its own (DL-122). An order other than the list's own
 * shows as a chip with the filters, and Clear Filters takes it off too. Choices take effect as they
 * are made, so the sheet's foot only says how many results they leave. While the list loads the bar is already whole: the search works, the filters and Sort
 * are drawn as they will be and wait, and the count and the fact under it each keep their line
 * (`reserve`), so nothing moves when the list arrives (DL-104, DL-108).
 */
export function FilterBar({
  noun,
  things = noun,
  search,
  onSearch,
  maxLength,
  facets,
  onFacet,
  sort,
  onSort,
  count,
  total,
  summary,
  note,
  loading = false,
  reserve,
  onClear,
}: {
  /** What the list holds, as the search field names it: "initiatives", "funding". */
  noun: string;
  /** What the count counts, where that differs from the noun. */
  things?: string;
  search: string;
  onSearch(value: string): void;
  /** The longest search the list accepts, where it has a limit. */
  maxLength?: number;
  /** A list with nothing to filter on yet passes none, and the bar is its search alone. */
  facets: readonly Facet[];
  onFacet: ChangeFacet;
  /** Left out where the list has one order. */
  sort?: SortChoice;
  onSort?(value: string): void;
  count: number;
  total: number;
  /** The sentence that says how much of the list is left, where "3 of 12 initiatives" does not fit it. */
  summary?: string;
  /** A fact about the whole list, after the count: where it comes from or when it was checked. */
  note?: string;
  /** The list is still arriving: search works, and the filters and the count hold their places. */
  loading?: boolean;
  /** A sentence about as long as `note` will be. It says a note is coming, so its line is there while the list loads. */
  reserve?: string;
  /** Takes off the search and every filter, and returns the order to the list's own (DL-122). */
  onClear(): void;
}) {
  const id = useId();
  const [sheet, setSheet] = useState(false);
  const choices = activeChoices(facets);
  const narrowed = facets.reduce((sum, facet) => sum + narrowing(facet), 0);
  const query = search.trim();
  const controls = facets.length > 0 || !!sort;
  const ordered = chosenSort(sort);
  // A phone's one button opens every filter and Sort. With no filter yet it is the Sort button.
  const sheetLabel = facets.length > 0 ? "Filters" : "Sort";
  // The fact under the count: the list's own once it is here, and a sentence about as long until then.
  const noted = loading ? reserve : note;

  // The pinned row (DL-130). Once the bar's controls have gone up under the app bar, the same
  // controls stay at the top of the window, so a person deep in the list changes the search, a
  // filter or the order without scrolling back. While a menu or the sheet it opened is open it
  // stays, even where the list has shrunk and brought the bar back into view.
  const bar = useRef<HTMLElement>(null);
  const pin = useRef<HTMLDivElement>(null);
  const [above, setAbove] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [sheetFrom, setSheetFrom] = useState<"bar" | "pin">("bar");
  // The app bar's reach changes when a phone turns on its side and the header stops sticking.
  const [header, setHeader] = useState(0);
  const latestChoices = useRef("");
  latestChoices.current = choicesKey(search, facets, sort);
  // The choices as they stood when the pinned row opened a menu or the sheet; null when it opened none.
  const openedWith = useRef<string | null>(null);
  const pinned = !loading && (above || pinOpen);

  useEffect(() => {
    const target = bar.current?.querySelector(":scope > .rc-filter-controls, :scope > .rc-field");
    if (!target || loading || typeof IntersectionObserver !== "function") return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) setAbove(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? header));
      },
      { rootMargin: underAppBar(header) },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [loading, controls, header]);
  useEffect(() => {
    const measure = () => setHeader(appBarHeight());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // A change made from the pinned row starts the list again from its first card, so when the menu
  // or the sheet closes the page goes back to the bar, and focus to the same control in it.
  function settle(trigger: Element | null) {
    const before = openedWith.current;
    openedWith.current = null;
    setPinOpen(false);
    const section = bar.current;
    const row = pin.current;
    if (before === null || before === latestChoices.current || !section || !row) return;
    // The same control in the bar: the same filter's menu, Filters or Sort. Where the bar has none at
    // this width, as when the row's Filters stands for the bar's menus, focus goes to its first control.
    const which = (button: HTMLElement) => button.dataset.facet ?? button.dataset.filter ?? "sort";
    const shown = [...section.querySelectorAll<HTMLElement>(":scope > .rc-filter-controls > .rc-button")].filter(
      (button) => button.offsetParent !== null,
    );
    const same = trigger instanceof HTMLElement ? shown.find((button) => which(button) === which(trigger)) : undefined;
    toBar(section);
    (same ?? shown[0])?.focus({ preventScroll: true });
  }
  const latestSettle = useRef(settle);
  latestSettle.current = settle;
  // A menu's toggle does not bubble, so the row listens as it passes down to the menu.
  useEffect(() => {
    const row = pin.current;
    if (!row) return;
    const toggled = (event: Event) => {
      if (!(event instanceof ToggleEvent) || !(event.target instanceof HTMLElement)) return;
      if (event.newState === "open") {
        openedWith.current = latestChoices.current;
        setPinOpen(true);
      } else latestSettle.current(row.querySelector(`[aria-controls="${CSS.escape(event.target.id)}"]`));
    };
    row.addEventListener("toggle", toggled, true);
    return () => row.removeEventListener("toggle", toggled, true);
  }, []);
  function openSheet(from: "bar" | "pin") {
    if (from === "pin") {
      openedWith.current = latestChoices.current;
      setPinOpen(true);
    }
    setSheetFrom(from);
    setSheet(true);
  }
  function closeSheet() {
    setSheet(false);
    if (sheetFrom === "pin") settle(pin.current?.querySelector("[data-filter='all']") ?? null);
  }
  // The pinned row's Search goes back to the field, which is where a search is typed and read.
  function toSearch() {
    const section = bar.current;
    if (!section) return;
    toBar(section);
    section.querySelector<HTMLInputElement>("input[type='search']")?.focus({ preventScroll: true });
  }
  const searchButton = (
    <button className="rc-button" data-variant="secondary" data-filter="search" data-active={!!query} type="button" onClick={toSearch}>
      <Icon name="search" size="sm" />
      Search
    </button>
  );
  const controlProps = { facets, onFacet, sort, onSort, sheetLabel, narrowed, ordered: !!ordered };
  return (
    <section className="rc-filter-bar" ref={bar} aria-label={`Filter ${noun}`} aria-busy={loading || undefined}>
      {/* The list follows each letter; Enter has nothing left to send. */}
      <form className="rc-field" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={`${id}-search`}>Search {noun}</label>
        <div className="rc-search rc-inline-field">
          <input
            className="rc-input"
            id={`${id}-search`}
            type="search"
            enterKeyHint="search"
            maxLength={maxLength}
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
        </div>
      </form>
      {loading && controls ? (
        // The real buttons, waiting: the same words at the same sizes, so the row is the one that stays.
        <div className="rc-filter-controls">
          <button className="rc-button" data-variant="secondary" data-filter="all" type="button" disabled>
            <Icon name="filter" size="sm" />
            {sheetLabel}{narrowed > 0 ? ` (${narrowed})` : ""}
          </button>
          {facets.map((facet) => (
            <button key={facet.key} className="rc-button" data-variant="secondary" data-filter="one" data-menu type="button" disabled>
              {facet.label}
              {narrowing(facet) > 0 ? ` (${narrowing(facet)})` : ""}
            </button>
          ))}
          {sort && (
            <button className="rc-button" data-variant="secondary" data-filter="one" data-menu type="button" disabled>
              Sort
            </button>
          )}
        </div>
      ) : controls ? (
        <Controls place={id} onSheet={() => openSheet("bar")} {...controlProps} />
      ) : null}
      {(query || choices.length > 0 || ordered) && (
        <div className="rc-active-filters" role="group" aria-label="Chosen filters">
          {query && (
            <button className="rc-chip" type="button" onClick={() => onSearch("")} aria-label={`Remove search: ${query}`}>
              Search: {query}
              <Icon name="close" size="sm" />
            </button>
          )}
          {choices.map((choice) => (
            <button
              key={`${choice.facet.key} ${choice.value}`}
              className="rc-chip"
              type="button"
              onClick={() => onFacet(choice.facet.key, withoutChoice(choice))}
              aria-label={`Remove ${choice.label}`}
            >
              {choice.label}
              <Icon name="close" size="sm" />
            </button>
          ))}
          {sort && onSort && ordered && (
            <button className="rc-chip" type="button" onClick={() => onSort(defaultSort(sort))} aria-label={`Remove Sort: ${ordered.label}`}>
              Sort: {ordered.label}
              <Icon name="close" size="sm" />
            </button>
          )}
          <button className="rc-button" data-variant="quiet" data-size="sm" type="button" onClick={onClear}>
            Clear Filters
          </button>
        </div>
      )}
      {/* The count has one line and the fact about the whole list its own line under it. Each keeps
          set room, so the bar is one height loading and loaded (DL-108). While the list loads the
          words are for assistive technology and the eye gets the lines' shapes. */}
      <p className="rc-meta">
        <span role="status" aria-atomic="true" className={loading ? "rc-visually-hidden" : undefined}>
          {loading ? `Loading ${noun}` : summary ?? `${count} of ${total} ${things}${note ? "." : ""}`}
        </span>
        {loading && (
          <span aria-hidden="true">
            <span className="rc-skeleton" data-shape="hold">{`0 of 0 ${things}`}</span>
          </span>
        )}
        {noted && (
          <span data-part="note" aria-hidden={loading || undefined}>
            {loading ? <span className="rc-skeleton" data-shape="hold">{noted}</span> : noted}
          </span>
        )}
      </p>
      <div className="rc-filter-pin" ref={pin} role="group" aria-label={`Filter ${noun}`} hidden={!pinned}>
        {controls ? (
          <Controls place={`${id}-pin`} onSheet={() => openSheet("pin")} lead={searchButton} {...controlProps} />
        ) : (
          <div className="rc-filter-controls">{searchButton}</div>
        )}
      </div>
      <Dialog presentation="information" title={sheetLabel} open={sheet} leaves onClose={closeSheet}>
        <div className="rc-dialog-scroll">
          {sort && onSort && (
            <fieldset>
              <legend>Sort</legend>
              <div className="rc-chip-group">
                {sort.options.map((option) => (
                  <label className="rc-chip" key={option.value}>
                    <input
                      className="rc-check"
                      type="radio"
                      name={`${id}-sort-sheet`}
                      checked={sortChoice(sort)?.value === option.value}
                      onChange={() => onSort(option.value)}
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {facets.map((facet) => (
            <fieldset key={facet.key}>
              <legend>{facet.label}</legend>
              <div className="rc-chip-group">
                <Options facet={facet} name={`${id}-${facet.key}-sheet`} chips onChange={onFacet} />
              </div>
              {facet.scope && (
                <fieldset>
                  <legend>{facet.scope.label}</legend>
                  <div className="rc-chip-group">
                    <Options facet={facet.scope} name={`${id}-${facet.scope.key}-sheet`} chips onChange={onFacet} />
                  </div>
                </fieldset>
              )}
            </fieldset>
          ))}
        </div>
        <div className="rc-dialog-foot">
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            disabled={!query && choices.length === 0 && !ordered}
            onClick={onClear}
          >
            Clear All
          </button>
          <button className="rc-button" data-variant="primary" type="button" onClick={() => setSheet(false)}>
            Show {count} {count === 1 ? "Result" : "Results"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
