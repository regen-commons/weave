import { effectiveAccess } from "../../../../dist/domain.mjs";
import { FundSchema, type Entry, type Evaluation } from "../funding/contracts.ts";
import { programFund } from "../../../../dist/matching.mjs";
import { fitLevel } from "../funding/select.ts";
import { accessSign, fundingEyebrow, opportunityHref } from "../funding/catalog.ts";
import { fullDate } from "../home.ts";
import { Link, routeSearch } from "../router.tsx";
import { Card } from "./Card.tsx";
import { Fit } from "./Fit.tsx";
import { Icon } from "./Icon.tsx";
import { Tag } from "./Tag.tsx";

/** One funding opportunity in a list. The whole card opens it, so it carries no button. */
export function OpportunityCard({
  entry,
  result,
  teamLine,
  level = 2,
}: {
  entry: Entry;
  result?: Evaluation;
  /** What is known about the partners this call asks for. Left out when nothing is. */
  teamLine?: string;
  level?: 2 | 3;
}) {
  const Title = level === 3 ? "h3" : "h2";
  const fund = FundSchema.parse(programFund(entry.fund, entry.program));
  const access = effectiveAccess(fund);
  const sign = accessSign(access);
  return (
    <Card>
      <p className="rc-eyebrow">
        <Icon name="funding" size="sm" />
        {fundingEyebrow(entry.program)}
      </p>
      <Title className="rc-card-title">
        <Link href={opportunityHref(entry, routeSearch())}>{entry.program?.name ?? fund.displayName}</Link>
      </Title>
      {entry.program && entry.program.name !== fund.displayName && (
        <p className="rc-card-meta">{fund.displayName}</p>
      )}
      {result &&
        (result.thematicFit.score === null ? (
          <p className="rc-meta">Fit not assessed</p>
        ) : (
          <Fit
            level={fitLevel(result)}
            label={result.thematicFit.label}
            explanation={`Keyword topics: ${result.shared.join(", ") || "none"}. Fit is not eligibility.`}
          />
        ))}
      <ul className="rc-tag-list" aria-label="How to apply">
        <li>
          <Tag icon={sign.icon} tone={sign.tone}>
            {sign.label}
          </Tag>
        </li>
        {fund.deadlineDate && (
          <li>
            <Tag icon="clock">
              {access === "closed" ? "Ended " : "Closes "}
              <time dateTime={fund.deadlineDate}>{fullDate(fund.deadlineDate, "medium")}</time>
            </Tag>
          </li>
        )}
      </ul>
      <p className="rc-card-summary">{entry.program?.focus.join(", ") || fund.description}</p>
      {result && <p className="rc-meta">{result.readiness.label}</p>}
      {teamLine && <p className="rc-team-line">{teamLine}</p>}
      <p className="rc-time">
        <Icon name="clock" size="sm" />
        {fund.verifiedOn ? `Sources checked ${fullDate(fund.verifiedOn)}` : "Source date unverified"}
      </p>
    </Card>
  );
}
