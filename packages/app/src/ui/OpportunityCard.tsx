import { effectiveAccess } from "../../../../dist/domain.mjs";
import { FundSchema, type Entry, type Evaluation } from "../funding/contracts.ts";
import { programFund } from "../../../../dist/matching.mjs";
import { accessSign, fundingEyebrow, opportunityHref } from "../funding/catalog.ts";
import { closingDay, deadlineSign } from "../funding/deadline.ts";
import { fullDate } from "../home.ts";
import { Link, routeSearch } from "../router.tsx";
import { FundShortlistButton, type ShortlistChange } from "../shortlist/ShortlistButton.tsx";
import { Card } from "./Card.tsx";
import { FitLine } from "./Fit.tsx";
import { Icon } from "./Icon.tsx";
import { Tag } from "./Tag.tsx";

/**
 * One funding opportunity in a list. The whole card opens it, so its one button is the shortlist
 * toggle in its corner, above the card's link (DL-152).
 */
export function OpportunityCard({
  entry,
  search,
  result,
  teamLine,
  level = 2,
  onShortlist,
}: {
  entry: Entry;
  /**
   * The list's address for the choices in force, which the card's link keeps for the way back. A list
   * passes its own, since the window's address is written only after the list draws.
   */
  search?: string;
  result?: Evaluation;
  /** What is known about the partners this call asks for. Left out when nothing is. */
  teamLine?: string;
  level?: 2 | 3;
  /** Hears each press of the card's shortlist toggle. */
  onShortlist?(change: ShortlistChange): void;
}) {
  const Title = level === 3 ? "h3" : "h2";
  const fund = FundSchema.parse(programFund(entry.fund, entry.program));
  const access = effectiveAccess(fund);
  const sign = accessSign(access);
  const name = entry.program?.name ?? fund.displayName;
  const funder = entry.program && entry.program.name !== fund.displayName ? fund.displayName : "";
  const deadline = fund.deadlineDate
    ? deadlineSign(closingDay(fund.deadlineDate, fund.deadlineInstant), access === "closed", new Date())
    : null;
  return (
    <Card kind="funding" rows="fixed">
      <p className="rc-eyebrow">
        <Icon name="funding" size="sm" />
        {fundingEyebrow(entry.program)}
      </p>
      <Title className="rc-card-title">
        <Link href={opportunityHref(entry, search ?? routeSearch())}>{name}</Link>
      </Title>
      <FundShortlistButton entry={entry} name={name} place="card" onChange={onShortlist} />
      {/* The funder's line keeps its room on every card, so cards are one height (DL-108). It is
          empty where the name above is already the funder's, and a long name is cut with its whole
          self one hover away. */}
      <p className="rc-card-meta" title={funder || undefined}>
        {funder}
      </p>
      {result && <FitLine result={result} />}
      <ul className="rc-tag-list" aria-label="How to apply">
        <li>
          <Tag icon={sign.icon} tone={sign.tone}>
            {sign.label}
          </Tag>
        </li>
        {deadline && fund.deadlineDate && (
          <li>
            {/* The one clock on the card. Close to its end the tag counts the days and is toned; the
                words say so on their own, and the date stays one hover away (DL-103). */}
            <Tag icon="clock" tone={deadline.soon ? "warning" : undefined} strong>
              {deadline.dated ? (
                <>
                  {deadline.label} <time dateTime={fund.deadlineDate}>{fullDate(fund.deadlineDate, "medium")}</time>
                </>
              ) : (
                <time dateTime={fund.deadlineDate} title={fullDate(fund.deadlineDate)}>
                  {deadline.label}
                </time>
              )}
            </Tag>
          </li>
        )}
      </ul>
      <p className="rc-card-summary">{entry.program?.focus.join(", ") || fund.description}</p>
      {result && <p className="rc-meta">{result.readiness.label}</p>}
      {teamLine && <p className="rc-team-line">{teamLine}</p>}
      <p className="rc-time">
        {fund.verifiedOn ? `Sources checked ${fullDate(fund.verifiedOn)}` : "Source date unverified"}
      </p>
    </Card>
  );
}
