import { useEffect, useId, useRef, type ReactNode } from "react";
import { connectPopover } from "@regen-commons/design-system/overlays";
import { CAPITALS } from "../capitals.ts";
import { STAGE_LABELS, WORK, type ListFilters } from "../listing.ts";
import { Icon } from "./Icon.tsx";

export function FilterMenu({ label, count, children }: { label: string; count: number; children: ReactNode }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (trigger.current && panel.current) return connectPopover(trigger.current, panel.current);
  }, []);
  return (
    <>
      <button
        className="rc-button"
        data-variant="secondary"
        data-active={count > 0}
        type="button"
        ref={trigger}
        popoverTarget={id}
      >
        {label}
        {count > 0 ? ` (${count})` : ""}
      </button>
      <div className="rc-menu" ref={panel} id={id} popover="auto">
        <fieldset className="rc-menu-group">
          <legend>{label}</legend>
          {children}
        </fieldset>
        <button type="button" className="rc-button" data-variant="quiet" data-close-popover>
          Done
        </button>
      </div>
    </>
  );
}
const toggle = (values: readonly string[], value: string) =>
  values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
export function FilterBar({
  filters,
  onChange,
  countries,
  count,
  total,
  noun,
  partners,
  personalized,
  funding,
}: {
  filters: ListFilters;
  onChange: (next: ListFilters) => void;
  countries: readonly string[];
  count: number;
  total: number;
  noun: string;
  partners: boolean;
  personalized: boolean;
  funding: boolean;
}) {
  const id = useId();
  type MultiKey = "work" | "country" | "stage" | "support";
  const groups: { key: MultiKey; label: string; options: readonly { value: string; label: string }[] }[] = [
    { key: "work", label: "Type of work", options: WORK.map((value) => ({ value, label: value })) },
    { key: "country", label: "Country", options: countries.map((value) => ({ value, label: value })) },
    ...(!funding
      ? [
          {
            key: "stage" as const,
            label: "Stage",
            options: Object.entries(STAGE_LABELS).map(([value, label]) => ({ value, label })),
          },
        ]
      : []),
    {
      key: "support",
      label: "Support",
      options: CAPITALS.map((value) => ({ value: value.key, label: `${value.title}: ${value.label}` })),
    },
  ];
  const update = (key: MultiKey, value: string) =>
    onChange({ ...filters, [key]: toggle(filters[key], value) });
  const chips = groups.flatMap((group) =>
    filters[group.key].map((value) => ({
      key: `${group.key}-${value}`,
      label: group.options.find((option) => option.value === value)?.label ?? value,
      remove: () => update(group.key, value),
    })),
  );
  if (filters.search.trim())
    chips.unshift({
      key: "search",
      label: `Search: ${filters.search}`,
      remove: () => onChange({ ...filters, search: "" }),
    });
  if (filters.supportIn !== "either")
    chips.push({
      key: "supportIn",
      label: `Support in ${filters.supportIn}`,
      remove: () => onChange({ ...filters, supportIn: "either" }),
    });
  if (filters.relation !== "any")
    chips.push({
      key: "relation",
      label: filters.relation === "offers-need" ? "Offers what you need" : "Needs what you offer",
      remove: () => onChange({ ...filters, relation: "any" }),
    });
  return (
    <div className="rc-filter-bar">
      <form className="rc-field" onSubmit={(event) => event.preventDefault()} role="search">
        <label htmlFor={`${id}-search`}>Search {noun}</label>
        <div className="rc-inline-field">
          <input
            className="rc-input"
            id={`${id}-search`}
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
          <button type="submit" className="rc-button" data-variant="secondary">
            Search
          </button>
        </div>
      </form>
      <div className="rc-filter-controls">
        {groups.map((group) => (
          <FilterMenu key={group.key} label={group.label} count={filters[group.key].length}>
            {group.key === "support" && !funding && (
              <div className="rc-field">
                <label htmlFor={`${id}-support-in`}>Look in</label>
                <select
                  className="rc-input"
                  id={`${id}-support-in`}
                  value={filters.supportIn}
                  onChange={(event) =>
                    onChange({ ...filters, supportIn: event.target.value as ListFilters["supportIn"] })
                  }
                >
                  <option value="either">Needs or offers</option>
                  <option value="needs">Needs</option>
                  <option value="offers">Offers</option>
                </select>
              </div>
            )}
            {group.options.map((option) => (
              <label className="rc-menu-option" key={option.value}>
                <input
                  type="checkbox"
                  className="rc-check"
                  checked={filters[group.key].includes(option.value)}
                  onChange={() => update(group.key, option.value)}
                />
                {option.label}
              </label>
            ))}
          </FilterMenu>
        ))}
        {partners && personalized && (
          <FilterMenu label="Your initiative" count={filters.relation === "any" ? 0 : 1}>
            {(
              [
                ["any", "Any connection"],
                ["offers-need", "Offers what you need"],
                ["needs-offer", "Needs what you offer"],
              ] as const
            ).map(([value, label]) => (
              <label className="rc-menu-option" key={value}>
                <input
                  className="rc-check"
                  type="radio"
                  name={`${id}-relation`}
                  checked={filters.relation === value}
                  onChange={() => onChange({ ...filters, relation: value })}
                />
                {label}
              </label>
            ))}
          </FilterMenu>
        )}
        <div className="rc-field">
          <label htmlFor={`${id}-sort`}>Sort</label>
          <select
            className="rc-input"
            id={`${id}-sort`}
            value={filters.sort}
            onChange={(event) => onChange({ ...filters, sort: event.target.value as ListFilters["sort"] })}
          >
            <option value="name">Name A to Z</option>
            <option value="recent">Recently confirmed</option>
            {personalized && <option value="fit">Best fit</option>}
            {funding && <option value="closing">Closing first</option>}
          </select>
        </div>
      </div>
      {chips.length > 0 && (
        <div className="rc-active-filters" aria-label="Chosen filters">
          {chips.map((chip) => (
            <button
              key={chip.key}
              className="rc-chip"
              type="button"
              onClick={chip.remove}
              aria-label={`Remove ${chip.label}`}
            >
              {chip.label}
              <Icon name="close" size="sm" />
            </button>
          ))}
        </div>
      )}
      <p className="rc-meta" role="status" aria-atomic="true">
        {count} of {total} {noun}
      </p>
    </div>
  );
}
