import { useEffect, useId, useRef, useState } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import {
  activeChoices,
  narrowing,
  pickedValue,
  pressOption,
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
 * Sort control (`rc-sort`): a native select drawn as one more filter button, so the bar's controls
 * match and a phone opens its own picker. The select lies clear over the face and takes the press.
 */
function SortControl({ sort, onSort }: { sort: SortChoice; onSort(value: string): void }) {
  const id = useId();
  const current = sort.options.find((option) => option.value === sort.value) ?? sort.options[0];
  return (
    <div className="rc-button rc-sort" data-variant="secondary">
      {/* The word is the select's label. The value beside it is for the eye; the select says its own. */}
      <label className="rc-sort-face" htmlFor={id}>
        Sort<span aria-hidden="true">: {current?.label}</span>
      </label>
      <select id={id} value={current?.value} onChange={(event) => onSort(event.target.value)}>
        {sort.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Filter bar organism (`rc-filter-bar`): the same on every list (DL-061). Search, the filters, Sort,
 * the choices in force as removable chips, and how much of the list is left. On a phone one Filters
 * button opens every filter in a sheet; a wide screen gives each filter its own menu. Choices take
 * effect as they are made, so the sheet's foot only says how many results they leave.
 */
export function FilterBar({
  noun,
  things = noun,
  search,
  onSearch,
  facets,
  onFacet,
  sort,
  onSort,
  count,
  total,
  onClear,
}: {
  /** What the list holds, as the search field names it: "initiatives", "funding". */
  noun: string;
  /** What the count counts, where that differs from the noun. */
  things?: string;
  search: string;
  onSearch(value: string): void;
  facets: readonly Facet[];
  onFacet: ChangeFacet;
  sort: SortChoice;
  onSort(value: string): void;
  count: number;
  total: number;
  /** Takes off the search and every filter. The sort order stays. */
  onClear(): void;
}) {
  const id = useId();
  const [sheet, setSheet] = useState(false);
  const choices = activeChoices(facets);
  const narrowed = facets.reduce((sum, facet) => sum + narrowing(facet), 0);
  const query = search.trim();
  return (
    <section className="rc-filter-bar" aria-label={`Filter ${noun}`}>
      <form className="rc-field" role="search" onSubmit={(event) => event.preventDefault()}>
        <label htmlFor={`${id}-search`}>Search {noun}</label>
        <div className="rc-search rc-inline-field">
          <input
            className="rc-input"
            id={`${id}-search`}
            type="search"
            value={search}
            onChange={(event) => onSearch(event.target.value)}
          />
          <button type="submit" className="rc-button" data-variant="secondary">
            Search
          </button>
        </div>
      </form>
      <div className="rc-filter-controls">
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
        {facets.map((facet) => (
          <FilterMenu key={facet.key} facet={facet} name={`${id}-${facet.key}-menu`} onChange={onFacet} />
        ))}
        <SortControl sort={sort} onSort={onSort} />
      </div>
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
            Clear filters
          </button>
        </div>
      )}
      <p className="rc-meta" role="status" aria-atomic="true">
        {count} of {total} {things}
      </p>
      {/* Not a task: nothing here is lost by a press outside, which closes it like any sheet. */}
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
            data-variant="quiet"
            type="button"
            disabled={!query && choices.length === 0}
            onClick={onClear}
          >
            Clear all
          </button>
          <button className="rc-button" data-variant="primary" type="button" onClick={() => setSheet(false)}>
            Show {count} {count === 1 ? "result" : "results"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
