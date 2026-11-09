import { useId } from "react";
import { FilterMenu } from "./FilterBar.tsx";
import { ACCESS } from "../../../../dist/domain.mjs";
import { MATCH_GROUPS } from "../../../../dist/matching.mjs";
import { type FundingFilters as Filters, emptyFundingFilters } from "../funding/select.ts";
export function FundingFilters({
  filters,
  onChange,
  total,
  count,
  personalized,
}: {
  filters: Filters;
  onChange(value: Filters): void;
  total: number;
  count: number;
  personalized: boolean;
}) {
  const id = useId();
  const options = [
    {
      key: "closing" as const,
      label: "Closing",
      items: [
        ["", "Any date"],
        ["30", "Within 30 days"],
        ["90", "Within 90 days"],
      ],
    },
    {
      key: "access" as const,
      label: "Application route",
      items: [["", "Any route"], ...Object.entries(ACCESS).map(([key, value]) => [key, value.label])],
    },
    ...(personalized
      ? [
          {
            key: "group" as const,
            label: "Priority group",
            items: [["", "Every group"], ...Object.entries(MATCH_GROUPS)],
          },
        ]
      : []),
    {
      key: "sort" as const,
      label: "Sort",
      items: [
        ["closing", "Closing soon"],
        ["name", "Name"],
        ["recent", "Sources checked recently"],
        ...(personalized ? [["fit", "Research priority"]] : []),
      ],
    },
  ];
  return (
    <section className="rc-filter-bar" aria-label="Filter funding">
      <form
        className="rc-field"
        onSubmit={(event) => {
          event.preventDefault();
          onChange({ ...filters });
        }}
      >
        <label htmlFor={`${id}-search`}>Search funding</label>
        <div className="rc-search rc-inline-field">
          <input
            id={`${id}-search`}
            className="rc-input"
            type="search"
            value={filters.search}
            onChange={(event) => onChange({ ...filters, search: event.target.value })}
          />
          <button className="rc-button" data-variant="secondary" type="submit">
            Search
          </button>
        </div>
      </form>
      <div className="rc-filter-controls">
        {options.map((option) =>
          option.key === "sort" ? (
            <div className="rc-field" data-layout="inline" key={option.key}>
              <label htmlFor={`${id}-${option.key}`}>{option.label}</label>
              <select
                className="rc-input"
                id={`${id}-${option.key}`}
                value={filters[option.key]}
                onChange={(event) => onChange({ ...filters, [option.key]: event.target.value })}
              >
                {option.items.map(([key, value]) => (
                  <option key={key} value={key}>
                    {value}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <FilterMenu key={option.key} label={option.label} count={filters[option.key] ? 1 : 0}>
              {option.items.map(([key, value]) => (
                <label className="rc-menu-option" key={key}>
                  <input
                    className="rc-check"
                    type="radio"
                    name={`${id}-${option.key}`}
                    checked={filters[option.key] === key}
                    onChange={() => onChange({ ...filters, [option.key]: key ?? "" })}
                  />
                  {value}
                </label>
              ))}
            </FilterMenu>
          ),
        )}
      </div>
      <p className="rc-meta" role="status">
        {count} of {total} programs and overview records
      </p>
      <ul className="rc-active-filters" aria-label="Active filters">
        {(["search", "closing", "access", "group"] as const)
          .filter((key) => filters[key])
          .map((key) => (
            <li key={key}>
              <button className="rc-chip" type="button" onClick={() => onChange({ ...filters, [key]: "" })}>
                Remove{" "}
                {key === "search"
                  ? filters[key]
                  : options
                      .find((option) => option.key === key)
                      ?.items.find(([value]) => value === filters[key])?.[1]}
              </button>
            </li>
          ))}
      </ul>
      {Object.entries(filters).some(([key, value]) => key !== "sort" && value) && (
        <button
          className="rc-button"
          data-variant="quiet"
          type="button"
          onClick={() => onChange({ ...emptyFundingFilters, sort: filters.sort })}
        >
          Clear filters
        </button>
      )}
    </section>
  );
}
