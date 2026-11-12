import { SocialAction } from "../social/Action.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { partnerAccessOf } from "../social/fixture.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { useEffect, useMemo, useState } from "react";
import { ACCESS, effectiveAccess } from "../../../../dist/domain.mjs";
import { fundingSourceUrl } from "../funding/source.ts";
import { programFund } from "../../../../dist/matching.mjs";
import { FundSchema } from "../funding/contracts.ts";
import { catalogEntries, findEntry } from "../funding/catalog.ts";
import { useCatalog } from "../funding/use-catalog.ts";
import { fitLevel } from "../funding/select.ts";
import { fundingFixture, teamFixture, type FixtureContext } from "../fixtures.ts";
import { useDraft } from "../describe/use-draft.ts";
import { useSetAside } from "../account/set-aside.ts";
import { revise } from "../describe/contracts.ts";
import { fullDate } from "../home.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { DetailSheet, type SheetState } from "../ui/DetailSheet.tsx";
import { TeamSlots } from "../ui/TeamSlots.tsx";
import { Fit } from "../ui/Fit.tsx";

/**
 * One funding opportunity, opened over the page the person was on. `search` is the query it was
 * opened with, kept so the sheet shows the same program while it leaves.
 */
export function Opportunity({
  fundId,
  search,
  fixture,
  sheet,
}: {
  fundId: string;
  search: string;
  fixture?: FixtureContext;
  sheet: SheetState;
}) {
  const social = useSocialFixture();
  // A share the card has moved on from is out of matching, so it opens no other team's slots.
  const shareCurrent = useCardStatus().sharing?.state !== "changed";
  const example = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  const catalog = useCatalog(example),
    device = useDraft(),
    // Another account's card keeps its answers to itself (DL-055).
    setAside = useSetAside();
  const [retried, setRetried] = useState(false);
  const query = new URLSearchParams(search);
  const programId = query.get("program"),
    team = query.get("team");
  const entry = catalog.bundle ? findEntry(catalogEntries(catalog.bundle), fundId, programId) : undefined;
  const title = catalog.loading
    ? "Opening opportunity"
    : (entry?.program?.name ?? entry?.fund.displayName ?? "Opportunity not available");
  useEffect(() => {
    if (sheet.open) document.title = `${title} | Weave`;
  }, [title, sheet.open]);
  if (catalog.loading || !entry)
    return (
      <DetailSheet title={title} state={sheet}>
        {catalog.loading ? (
          <p role="status">Opening the catalog copy</p>
        ) : (
          <>
            <p>
              {catalog.error ||
                "This fund or exact program is not in this catalog copy. No other call has been substituted."}
            </p>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="secondary" type="button" onClick={catalog.retry}>
                Try again
              </button>
            </div>
          </>
        )}
      </DetailSheet>
    );
  const fund = FundSchema.parse(programFund(entry.fund, entry.program)),
    program = entry.program,
    result = catalog.results?.find((value) => value.documentId === entry.id);
  const access = effectiveAccess(fund);
  // One way out to the funder: the program's own page where one was checked, otherwise the fund's.
  const url =
    program?.evidence.map((evidence) => fundingSourceUrl(fund, evidence.url)).find(Boolean) ||
    fundingSourceUrl(fund, fund.evidenceUrl);
  const conditions =
    catalog.bundle!.conditions?.filter(
      (condition) => condition.fundId === fund.id && condition.programId === program?.id,
    ) ?? [];
  const asks = import.meta.env.DEV && example ? teamFixture(team) : null;
  // The next step depends on the person: describe the work first, then go to the funder.
  const described = catalog.personalized;
  return (
    <DetailSheet title={title} state={sheet}>
      {(fixture?.state === "offline" || !navigator.onLine) && (
        <p className="rc-notice" data-tone="info">
          Showing the bundled catalog copy. The funder's page needs a connection.
        </p>
      )}
      {(catalog.error || (fixture?.state === "error" && !retried)) && (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p>{catalog.error || "The update failed. The catalog copy remains below."}</p>
            <button
              className="rc-button"
              data-variant="secondary"
              type="button"
              onClick={() => {
                setRetried(true);
                catalog.retry();
              }}
            >
              Try again
            </button>
          </div>
        </section>
      )}
      <p className="rc-card-meta">
        {fund.displayName}
        {program ? `, ${ACCESS[access]?.label ?? "Route unverified"}` : ""}
      </p>
      <p className="rc-prose">{fund.description}</p>
      <p>{fund.amount}</p>
      {fund.deadlineDate && (
        <p>
          Source deadline {fullDate(fund.deadlineDate)}
          {fund.deadlineInstant ? `, ${fund.deadlineInstant}` : ", exact time unverified"}.{" "}
          {access === "closed" ? "This cycle is closed." : ""}
        </p>
      )}
      <div className="rc-action-bar">
        {!described && (
          <ButtonLink href={pathTo("initiative")} variant="primary">
            Describe your initiative
          </ButtonLink>
        )}
        {url && (
          <a
            className="rc-button"
            data-variant={described ? "primary" : "secondary"}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the funder's page
          </a>
        )}
        {import.meta.env.DEV && example && (
          <SocialAction intent={{ kind: "remind", id: entry.program?.id ?? fundId, name: title }} />
        )}
      </div>
      {!url && <p className="rc-meta">The source link needs checking, so no link is offered.</p>}
      <section className="rc-stack">
        <h3 className="rc-heading" data-size="section">
          Why it fits
        </h3>
        {catalog.ranking ? (
          <p role="status">Comparing your card on this device</p>
        ) : result ? (
          <>
            {result.thematicFit.score === null ? (
              <p>Fit not assessed</p>
            ) : (
              <Fit
                level={fitLevel(result)}
                label={result.thematicFit.label}
                explanation={`Shared topics: ${result.shared.join(", ") || "none"}. Keyword rubric, not eligibility.`}
              />
            )}
            <p>{result.readiness.label}</p>
            <p className="rc-meta">
              Keyword matching with the existing Funding Commons rubric. No model has downloaded.
            </p>
            {result.shared.length > 0 && <p>Shared topics: {result.shared.join(", ")}</p>}
            <ul className="rc-reasons">
              {result.activeLimits.map((limit, index) => (
                <li key={index}>{limit.reason}</li>
              ))}
            </ul>
            <p>
              {device.draft.funding.form.goalMin || device.draft.funding.form.goalMax
                ? result.award
                : "No funding goal provided. Award fit has not been assessed."}
            </p>
          </>
        ) : (
          <p>
            {described
              ? "This record has not been compared with your card yet."
              : "Describe your initiative to see how well this fits your work."}
          </p>
        )}
      </section>
      <section className="rc-stack">
        <h3 className="rc-heading" data-size="section">
          Before you apply
        </h3>
        <dl className="rc-facts">
          <div>
            <dt>Who can apply</dt>
            <dd>
              {program
                ? [...program.applicants.requirements, ...program.applicants.exclusions].join(" ") ||
                  "Requirements not verified"
                : "Funding offer has no researched program terms."}
            </dd>
          </div>
          <div>
            <dt>Where</dt>
            <dd>{program?.geography.scope || fund.regions.join(", ") || "Scope unverified"}</dd>
          </div>
          <div>
            <dt>Application route</dt>
            <dd>{program?.application.note || fund.timing}</dd>
          </div>
          <div>
            <dt>Award</dt>
            <dd>{fund.amount}</dd>
          </div>
        </dl>
        <p className="rc-meta">
          Fit is not eligibility. Unknown facts stay unknown. Check the official requirements before
          applying.
        </p>
        {conditions.map((condition) => {
          const key = `${fund.id}::${program!.id}::${condition.id}`,
            answer = device.draft.funding.programAnswers[key];
          return (
            <div className="rc-field" key={condition.id}>
              <label htmlFor={`condition-${condition.id}`}>{condition.requirement}</label>
              <p className="rc-hint">
                {condition.kind === "priority" ? "Priority criterion" : "Prerequisite"}, checked{" "}
                {fullDate(condition.checkedOn)}. Your answer is self-reported, not eligibility approval.
              </p>
              {device.draft.confirmed && !setAside ? (
                <select
                  className="rc-input"
                  id={`condition-${condition.id}`}
                  value={answer?.sourceCheckedOn === condition.checkedOn ? answer.answer : ""}
                  onChange={(event) => {
                    const value = event.target.value;
                    device.controller.change((current) => {
                      const answers = { ...current.funding.programAnswers };
                      if (value)
                        answers[key] = {
                          answer: value as "yes" | "no",
                          sourceCheckedOn: condition.checkedOn,
                        };
                      else delete answers[key];
                      return revise(current, { funding: { ...current.funding, programAnswers: answers } });
                    });
                  }}
                >
                  <option value="">Not answered</option>
                  <option value="yes">Yes, according to our records</option>
                  <option value="no">No</option>
                </select>
              ) : (
                <p>Check your initiative before answering.</p>
              )}
            </div>
          );
        })}
        {program?.unknowns.length ? (
          <>
            <h4 className="rc-card-title">What still needs checking</h4>
            <ul className="rc-reasons">
              {program.unknowns.map((unknown, index) => (
                <li key={index}>{unknown}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="rc-meta">
          {fund.verifiedOn ? `Sources checked ${fullDate(fund.verifiedOn)}` : "Source date not verified"}.
          Catalog snapshot {fullDate(catalog.bundle!.catalog.researchCheckedOn)}.
        </p>
      </section>
      {fixture?.state === "loading" && !retried ? (
        <section className="rc-stack">
          <p role="status">Opening team slots</p>
          <div className="rc-skeleton" />
          <button className="rc-button" data-variant="secondary" type="button" onClick={() => setRetried(true)}>
            Show team slots
          </button>
        </section>
      ) : (
        <TeamSlots
          asks={asks}
          shared={
            !!example && !!social && partnerAccessOf(social.state, shareCurrent) === "network" && team !== "private"
          }
        />
      )}
      {!(import.meta.env.DEV && example) && (
        <p className="rc-meta">Email reminders and introductions are not connected yet.</p>
      )}
    </DetailSheet>
  );
}
