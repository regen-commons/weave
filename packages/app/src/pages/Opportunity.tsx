import { SocialAction } from "../social/Action.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { useEffect, useMemo, useState } from "react";
import { ACCESS, effectiveAccess } from "../../../../dist/domain.mjs";
import { fundingSourceUrl } from "../funding/source.ts";
import { programFund } from "../../../../dist/matching.mjs";
import { FundSchema } from "../funding/contracts.ts";
import { catalogEntries, findEntry, fundingBackHref } from "../funding/catalog.ts";
import { useCatalog } from "../funding/use-catalog.ts";
import { fitLevel } from "../funding/select.ts";
import { fundingFixture, teamFixture, type FixtureContext } from "../fixtures.ts";
import { useDraft } from "../describe/use-draft.ts";
import { revise } from "../describe/contracts.ts";
import { fullDate } from "../home.ts";
import { Heading } from "../ui/Heading.tsx";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { Stack, StepLayout } from "../ui/layouts.tsx";
import { TeamSlots } from "../ui/TeamSlots.tsx";
import { Fit } from "../ui/Fit.tsx";
import { FundingProfile } from "../ui/FundingProfile.tsx";
export function Opportunity({ fundId, fixture }: { fundId: string; fixture?: FixtureContext }) {
  const social = useSocialFixture();
  const example = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  const catalog = useCatalog(example),
    device = useDraft();
  const [retried, setRetried] = useState(false);
  const programId = new URLSearchParams(location.search).get("program"),
    team = new URLSearchParams(location.search).get("team");
  const entry = catalog.bundle ? findEntry(catalogEntries(catalog.bundle), fundId, programId) : undefined;
  const title = entry?.program?.name ?? entry?.fund.displayName ?? "Opportunity not available";
  useEffect(() => {
    document.title = `${title} | Weave`;
    document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  }, [title]);
  if (catalog.loading)
    return (
      <Stack>
        <Heading level={1} size="page">
          Opening opportunity
        </Heading>
        <p role="status">Opening the catalog copy</p>
      </Stack>
    );
  if (!entry)
    return (
      <Stack>
        <Heading level={1} size="page">
          Opportunity not available
        </Heading>
        <p>
          {catalog.error ||
            "This fund or exact program is not in this catalog copy. No other call has been substituted."}
        </p>
        <ButtonLink href={fundingBackHref(location.search)} variant="secondary">
          Back to Funding
        </ButtonLink>
        <button className="rc-button" data-variant="secondary" onClick={catalog.retry}>
          Try again
        </button>
      </Stack>
    );
  const fund = FundSchema.parse(programFund(entry.fund, entry.program)),
    program = entry.program,
    result = catalog.results?.find((value) => value.documentId === entry.id);
  const url = fundingSourceUrl(fund, fund.evidenceUrl),
    access = effectiveAccess(fund);
  const conditions =
    catalog.bundle!.conditions?.filter(
      (condition) => condition.fundId === fund.id && condition.programId === program?.id,
    ) ?? [];
  const asks = import.meta.env.DEV && example ? teamFixture(team) : null;
  return (
    <Stack>
      <div className="rc-action-bar">
        <ButtonLink href={fundingBackHref(location.search)} variant="quiet">
          Back to Funding
        </ButtonLink>
      </div>
      <Heading level={1} size="page">
        {title}
      </Heading>
      {import.meta.env.DEV && example && (
        <p className="rc-notice" data-tone="info">
          Fictional opportunity example. Nothing is sent, saved to an account or shared.
        </p>
      )}
      {(fixture?.state === "offline" || !navigator.onLine) && (
        <p className="rc-notice" data-tone="info">
          Showing the bundled catalog copy. The funder's page needs a connection.
        </p>
      )}
      {(catalog.error || (fixture?.state === "error" && !retried)) && (
        <section className="rc-notice" data-tone="warning">
          <div className="rc-notice-body">
            <p>{catalog.error || "The example update failed. The catalog copy remains below."}</p>
            <button
              className="rc-button"
              data-variant="secondary"
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
      <StepLayout
        aside={
          fixture?.state === "loading" && !retried ? (
            <section>
              <p role="status">Opening example team slots</p>
              <div className="rc-skeleton" />
              <button className="rc-button" data-variant="secondary" onClick={() => setRetried(true)}>
                Show example slots
              </button>
            </section>
          ) : (
            <TeamSlots
              asks={asks}
              shared={
                !!example &&
                (social ? social.state.visibility === "public" : fixture?.scenario === "shared") &&
                team !== "private"
              }
            />
          )
        }
      >
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
        <section className="rc-stack">
          <h2 className="rc-heading" data-size="section">
            Why it fits
          </h2>
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
            <>
              <p>
                Describe and check your initiative to see thematic fit and readiness. This catalog record is
                unranked.
              </p>
              <ButtonLink href="/start/initiative" variant="secondary">
                Describe your initiative
              </ButtonLink>
            </>
          )}
        </section>
        <section className="rc-stack">
          <h2 className="rc-heading" data-size="section">
            Before you apply
          </h2>
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
                {device.draft.confirmed ? (
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
              <h3 className="rc-heading" data-size="section">
                What still needs checking
              </h3>
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
          {!!program?.evidence.length && (
            <ul className="rc-reasons">
              {program.evidence.map((evidence, index) => {
                const source = fundingSourceUrl(fund, evidence.url);
                return (
                  <li key={index}>
                    <p className="rc-meta">Program source checked {fullDate(evidence.checkedOn)}</p>
                    {source ? (
                      <a
                        className="rc-button"
                        data-variant="quiet"
                        href={source}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Read program source
                      </a>
                    ) : (
                      <p className="rc-meta">This source link needs checking.</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {url ? (
            <a
              className="rc-button"
              data-variant="secondary"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open the funder's page
            </a>
          ) : (
            <p className="rc-meta">The source link needs checking; no unsafe or warned link is opened.</p>
          )}
          {import.meta.env.DEV && example && (
            <SocialAction intent={{ kind: "remind", id: entry.program?.id ?? fundId, name: title }} />
          )}
          <p className="rc-meta">Email reminders and live introductions are not connected yet.</p>
        </section>
        <FundingProfile />
      </StepLayout>
    </Stack>
  );
}
