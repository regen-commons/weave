import { SocialAction } from "../social/Action.tsx";
import { useSocialFixture } from "../social/context.tsx";
import { partnerAccessOf } from "../social/fixture.ts";
import { useCardStatus } from "../initiative/use-card-status.ts";
import { useEffect, useMemo, useState } from "react";
import { ACCESS, effectiveAccess } from "../../../../dist/domain.mjs";
import { fundingSourceUrl } from "../funding/source.ts";
import { programFund } from "../../../../dist/matching.mjs";
import { FundSchema } from "../funding/contracts.ts";
import { catalogEntries, findEntry, researchSnapshotDate } from "../funding/catalog.ts";
import { readBrowsing } from "../funding/select.ts";
import { deadlineSentence } from "../funding/deadline.ts";
import { useCatalog } from "../funding/use-catalog.ts";
import { fundingFixture, teamFixture, type FixtureContext } from "../fixtures.ts";
import { useDraft } from "../describe/use-draft.ts";
import { useSetAside } from "../account/set-aside.ts";
import { revise } from "../describe/contracts.ts";
import { fullDate } from "../home.ts";
import { pathTo } from "../routes.ts";
import { ButtonLink } from "../ui/ButtonLink.tsx";
import { DetailSheet, RecordLead, RecordSkeleton, recordSectionLevel, type Presentation, type SheetState } from "../ui/DetailSheet.tsx";
import { sectionTag } from "../ui/section-level.ts";
import { ShareMenu } from "../ui/ShareMenu.tsx";
import { fundShare } from "../record-share.ts";
import { TeamSlots } from "../ui/TeamSlots.tsx";
import { FitLine } from "../ui/Fit.tsx";
import { LinesSkeleton } from "../ui/CardSkeleton.tsx";
import { DescribeDoor } from "../ui/DescribePrompt.tsx";
import { recordFirstView } from "../record-first-view.ts";

/**
 * One funding opportunity, opened over the page the person was on. `search` is the query it was
 * opened with, kept so the sheet shows the same program while it leaves.
 */
export function Opportunity({
  fundId,
  search,
  fixture,
  sheet,
  presentation = "sheet",
}: {
  fundId: string;
  search: string;
  fixture?: FixtureContext;
  sheet: SheetState;
  /** Over the page it was opened from, or a page of its own when opened from a link. */
  presentation?: Presentation;
}) {
  const social = useSocialFixture();
  // A share the card has moved on from is out of matching, so it opens no other team's slots.
  const shareCurrent = useCardStatus().sharing?.state !== "changed";
  const example = useMemo(
    () => (import.meta.env.DEV && fixture ? fundingFixture(fixture) : undefined),
    [fixture?.state, fixture?.scenario],
  );
  // Opened from Funding with No initiative chosen, the fund is not compared either (DL-129).
  const browsing = readBrowsing(search);
  const catalog = useCatalog(example, undefined, { compare: !browsing }),
    device = useDraft(),
    // Another account's card keeps its answers to itself (DL-055).
    setAside = useSetAside();
  const [retried, setRetried] = useState(false);
  // Continue the card in progress, or start one: this page never reopens a card under a "describe" label.
  const query = new URLSearchParams(search);
  const programId = query.get("program"),
    team = query.get("team");
  const entry = catalog.bundle ? findEntry(catalogEntries(catalog.bundle), fundId, programId) : undefined;
  // Opened from a link, the page came with the fund's heading and summary, which stay while it loads.
  const firstView = presentation === "page" ? recordFirstView(`/funding/${fundId}`, programId) : undefined;
  const title = catalog.loading
    ? (firstView?.title ?? "Opening Opportunity")
    : (entry?.program?.name ?? entry?.fund.displayName ?? "Opportunity Not Available");
  useEffect(() => {
    if (sheet.open || presentation === "page") document.title = `${title} | Weave`;
  }, [title, sheet.open, presentation]);
  // Under a page's own heading the sections are the next level down; in a sheet, under its title.
  const Section = sectionTag(recordSectionLevel(presentation)),
    Subsection = sectionTag(recordSectionLevel(presentation), 1);
  if (catalog.loading || !entry)
    return (
      <DetailSheet title={title} state={sheet} presentation={presentation}>
        {catalog.loading ? (
          <>
            {firstView && <RecordLead summary={firstView.summary} />}
            <RecordSkeleton label="Opening the catalog copy" />
          </>
        ) : (
          <>
            <p>
              {catalog.error ||
                "This fund or exact program is not in this catalog copy. No other call has been substituted."}
            </p>
            <div className="rc-action-bar">
              <button className="rc-button" data-variant="secondary" type="button" onClick={catalog.retry}>
                Try Again
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
  const researchDate = researchSnapshotDate(catalog.bundle!.catalog);
  const asks = import.meta.env.DEV && example ? teamFixture(team) : null;
  // The next step depends on the person: describe the work first, then go to the funder.
  const described = catalog.personalized;
  return (
    <DetailSheet title={title} state={sheet} presentation={presentation}>
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
              Try Again
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
          {deadlineSentence(fund.deadlineDate, fund.deadlineInstant)}{" "}
          {access === "closed" ? "This cycle is closed." : ""}
        </p>
      )}
      <div className="rc-action-bar">
        {!described && <DescribeDoor variant="primary" />}
        {url && (
          <ButtonLink href={url} variant={described ? "primary" : "secondary"}>
            Open The Funder's Page
          </ButtonLink>
        )}
        {import.meta.env.DEV && example && (
          <SocialAction intent={{ kind: "remind", id: entry.program?.id ?? fundId, name: title }} />
        )}
      </div>
      {!url && <p className="rc-meta">The source link needs checking, so no link is offered.</p>}
      <ShareMenu
        share={fundShare({ id: entry.fund.id, name: entry.fund.displayName }, program ? { id: program.id, name: program.name } : null)}
      />
      <section className="rc-stack">
        <Section className="rc-heading" data-size="section">
          Why It Fits
        </Section>
        {catalog.ranking ? (
          <LinesSkeleton label="Comparing your card on this device" lines={2} />
        ) : result ? (
          <>
            <FitLine result={result} />
            <p>{result.readiness.label}</p>
            <p className="rc-meta">
              Compared on this device from what your card and this program each describe. No model has downloaded.
            </p>
            {result.thematicFit.evidenceTerms.length > 0 && (
              <p>In common: {result.thematicFit.evidenceTerms.join(", ")}</p>
            )}
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
            {described && browsing
              ? "No initiative chosen on Funding, so fit is not shown."
              : described
                ? "This record has not been compared with your card yet."
                : "Describe your initiative to see how well this fits your work."}
          </p>
        )}
      </section>
      <section className="rc-stack">
        <Section className="rc-heading" data-size="section">
          Before You Apply
        </Section>
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
            <Subsection className="rc-card-title">What Still Needs Checking</Subsection>
            <ul className="rc-reasons">
              {program.unknowns.map((unknown, index) => (
                <li key={index}>{unknown}</li>
              ))}
            </ul>
          </>
        ) : null}
        <p className="rc-meta">
          {fund.verifiedOn ? `Sources checked ${fullDate(fund.verifiedOn)}` : "Source date not verified"}.
          {researchDate ? ` Latest catalog check ${fullDate(researchDate)}.` : " Latest catalog check date unknown."}
        </p>
      </section>
      {fixture?.state === "loading" && !retried ? (
        <section className="rc-stack">
          <LinesSkeleton label="Opening team slots" lines={2} />
          <button className="rc-button" data-variant="secondary" type="button" onClick={() => setRetried(true)}>
            Show Team Slots
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
