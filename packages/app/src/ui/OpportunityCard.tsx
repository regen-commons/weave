import { ACCESS, effectiveAccess } from "../../../../dist/domain.mjs";
import { FundSchema, type Entry, type Evaluation } from "../funding/contracts.ts";
import { programFund } from "../../../../dist/matching.mjs";
import { fitLevel } from "../funding/select.ts";
import { awardLabel, opportunityHref } from "../funding/catalog.ts";
import { fullDate } from "../home.ts";
import { Link } from "../router.tsx";
import { Card } from "./Card.tsx";
import { Fit } from "./Fit.tsx";
import { ButtonLink } from "./ButtonLink.tsx";
export function OpportunityCard({
  entry,
  result,
  teamLine,
  level = 2,
}: {
  entry: Entry;
  result?: Evaluation;
  teamLine?: string;
  level?: 2 | 3;
}) {
  const Title = level === 3 ? "h3" : "h2";
  const fund = FundSchema.parse(programFund(entry.fund, entry.program));
  const access = effectiveAccess(fund);
  return (
    <Card>
      <p className="rc-meta" data-slot="comparison">
        {awardLabel(entry.program?.award)}
        {fund.deadlineDate && (
          <>
            {access === "closed" ? ", ended " : ", closes "}
            <time dateTime={fund.deadlineDate}>{fullDate(fund.deadlineDate, "medium")}</time>
          </>
        )}
      </p>
      <Title className="rc-card-title">
        <Link href={opportunityHref(entry, location.search)}>{entry.program?.name ?? fund.displayName}</Link>
      </Title>
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
      {entry.program && <p className="rc-card-meta">{fund.displayName}</p>}
      <p className="rc-meta">{fund.amount}</p>
      <p className="rc-card-meta">
        {ACCESS[access]?.label ?? "Application route needs checking"}
        {fund.deadlineDate
          ? `, ${access === "closed" ? "cycle ended" : "source deadline"} ${fullDate(fund.deadlineDate)}`
          : ""}
      </p>
      {result && <p className="rc-meta">{result.readiness.label}</p>}
      <p className="rc-card-summary">{entry.program?.focus.join(", ") || fund.description}</p>
      <p className="rc-team-line">
        {teamLine ?? "Partner requirements have not been structured or checked."}
      </p>
      <p className="rc-meta">
        {fund.verifiedOn ? `Sources checked ${fullDate(fund.verifiedOn)}` : "Source date unverified"}
      </p>
      <div className="rc-action-bar">
        <ButtonLink href={opportunityHref(entry, location.search)} variant="secondary">
          Read opportunity
        </ButtonLink>
      </div>
    </Card>
  );
}
