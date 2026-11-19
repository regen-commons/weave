import { useEffect, useId, useRef, useState } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import {
  activeChoices,
  narrowing,
  pickedValue,
  pressOption,
  sortChoice,
  withoutChoice,
  type Facet,
  type SortChoice,
} from "../filters.ts";
import { Dialog } from "./Dialog.tsx";
import { Icon } from "./Icon.tsx";

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
 * Sort: one more button in the bar that opens the same menu a filter opens, with one order to pick
 * (DL-100). The button says the order in force, so the bar reads the same before and after a press.
 */
function SortMenu({ sort, name, onSort }: { sort: SortChoice; name: string; onSort(value: string): void }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, []);
  const current = sortChoice(sort);
  return (
    <>
      <button className="rc-button" data-variant="secondary" type="button" ref={trigger} popoverTarget={id}>
        Sort: {current?.label}
      </button>
      <div className="rc-menu" ref={panel} id={id} popover="auto" data-align="end">
        <fieldset className="rc-menu-group">
          <legend>Sort</legend>
          <div className="rc-menu-options">
            {sort.options.map((option) => (
              <label className="rc-menu-option" key={option.value}>
                <input
                  className="rc-check"
                  type="radio"
                  name={name}
                  checked={current?.value === option.value}
                  onChange={() => onSort(option.value)}
                />
                {option.label}
              </label>
            ))}
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
 * Filter bar organism (`rc-filter-bar`): the same on every list, in the same place under the page's
 * opening line (DL-061, DL-081). Search, the filters, Sort, the choices in force as removable chips,
 * and how much of the list is left. The list narrows as a person types, so the field has no button.
 * On a phone one Filters button opens every filter in a sheet; a wide screen gives each filter its
 * own menu. Choices take effect as they are made, so the sheet's foot only says how many results
 * they leave. While the list loads the bar is already whole: the search works, the filters and Sort
 * are drawn as they will be and wait, and the count line keeps the room its sentence will take
 * (`reserve`), so nothing moves when the list arrives (DL-104).
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
  /** A sentence about as long as the count line will be, which keeps its room while the list loads. */
  reserve?: string;
  /** Takes off the search and every filter. The sort order stays. */
  onClear(): void;
}) {
  const id = useId();
  const [sheet, setSheet] = useState(false);
  const choices = activeChoices(facets);
  const narrowed = facets.reduce((sum, facet) => sum + narrowing(facet), 0);
  const query = search.trim();
  const controls = facets.length > 0 || !!sort;
  return (
    <section className="rc-filter-bar" aria-label={`Filter ${noun}`} aria-busy={loading || undefined}>
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
          {facets.length > 0 && (
            <button className="rc-button" data-variant="secondary" data-filter="all" type="button" disabled>
              <Icon name="filter" size="sm" />
              Filters{narrowed > 0 ? ` (${narrowed})` : ""}
            </button>
          )}
          {facets.map((facet) => (
            <button key={facet.key} className="rc-button" data-variant="secondary" data-filter="one" data-menu type="button" disabled>
              {facet.label}
              {narrowing(facet) > 0 ? ` (${narrowing(facet)})` : ""}
            </button>
          ))}
          {sort && (
            <button className="rc-button" data-variant="secondary" data-menu type="button" disabled>
              Sort: {sortChoice(sort)?.label}
            </button>
          )}
        </div>
      ) : controls ? (
        <div className="rc-filter-controls">
          {facets.length > 0 && (
            <button
              className="rc-button"
              data-variant="secondary"
              data-filter="all"
              data-active={narrowed > 0}
              type="button"
              onClick={() => setSheet(true)}
            >
              <Icon name="filter" size="sm" />
              Filters{narrowed > 0 ? ` (${narrowed})` : ""}
            </button>
          )}
          {facets.map((facet) => (
            <FilterMenu key={facet.key} facet={facet} name={`${id}-${facet.key}-menu`} onChange={onFacet} />
          ))}
          {sort && onSort && <SortMenu sort={sort} name={`${id}-sort`} onSort={onSort} />}
        </div>
      ) : null}
      {(query || choices.length > 0) && (
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
          <button className="rc-button" data-variant="quiet" data-size="sm" type="button" onClick={onClear}>
            Clear Filters
          </button>
        </div>
      )}
      <p className="rc-meta">
        {/* While the list loads the words are for assistive technology; the eye gets the line's room. */}
        <span role="status" aria-atomic="true" className={loading ? "rc-visually-hidden" : undefined}>
          {loading ? `Loading ${noun}` : summary ?? `${count} of ${total} ${things}${note ? "." : ""}`}
        </span>
        {loading ? (
          <span className="rc-skeleton" data-shape="hold" aria-hidden="true">
            {reserve ?? `0 of 0 ${things}`}
          </span>
        ) : note ? (
          ` ${note}`
        ) : (
          ""
        )}
      </p>
      <Dialog presentation="information" title="Filters" open={sheet} leaves onClose={() => setSheet(false)}>
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
        <div className="rc-dialog-foot">
          <button
            className="rc-button"
            data-variant="secondary"
            type="button"
            disabled={!query && choices.length === 0}
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
