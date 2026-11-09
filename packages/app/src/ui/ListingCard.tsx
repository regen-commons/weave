import type { ReactNode } from "react";
import type { ListingRecord } from "../listing.ts";
import { CAPITALS } from "../capitals.ts";
import { Tag } from "./Tag.tsx";
import { STAGE_LABELS } from "../listing.ts";
import { fullDate } from "../home.ts";
import { Link } from "../router.tsx";
import { recordPath } from "../routes.ts";
import { ButtonLink } from "./ButtonLink.tsx";
import { Card } from "./Card.tsx";
import { Fit } from "./Fit.tsx";
import { Media } from "./Media.tsx";
import { WorkTag } from "./WorkTag.tsx";

/** Shared listing Card composition. Home uses h3 under its section headings. */
export function ListingCard({
  record,
  personalized = false,
  level = 2,
  days,
  actions,
}: {
  record: ListingRecord;
  personalized?: boolean;
  level?: 2 | 3;
  days?: number;
  actions?: ReactNode;
}) {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <Card>
      {record.kind === "initiative" && <Media />}
      {(record.amount || record.closes || days !== undefined) && (
        <p className="rc-meta">
          {[
            record.amount,
            days !== undefined
              ? `${days} ${days === 1 ? "day" : "days"} left`
              : record.closes
                ? `Closes ${fullDate(record.closes)}`
                : undefined,
          ]
            .filter(Boolean)
            .join(", ")}
        </p>
      )}
      <Title className="rc-card-title">
        <Link href={recordPath(record.kind, record.id)}>{record.title}</Link>
      </Title>
      {personalized && record.fit && (
        <Fit level={record.fit} explanation={`${record.reasons.join(" ")} Fictional example fit.`} />
      )}
      <p className="rc-card-meta">
        {record.place}
        {record.kind === "initiative" ? `, ${STAGE_LABELS[record.stage]}` : ""}
      </p>
      {days !== undefined && record.closes && (
        <p className="rc-meta">
          Closes <time dateTime={record.closes}>{fullDate(record.closes)}</time>
        </p>
      )}
      <ul className="rc-tag-list" aria-label="Type of work">
        {record.work.map((work) => (
          <li key={work}>
            <WorkTag work={work} />
          </li>
        ))}
      </ul>
      <p className="rc-card-summary">{record.description}</p>
      {personalized ? (
        <ul className="rc-reasons">
          {record.reasons.map((reason) => (
            <li className="rc-reason" key={reason}>
              {reason}
            </li>
          ))}
        </ul>
      ) : (
        record.kind === "initiative" &&
        level === 2 && (
          <dl className="rc-facts">
            {(["needs", "offers"] as const).map((kind) => (
              <div key={kind}>
                <dt>{kind === "needs" ? "Needs" : "Offers"}</dt>
                <dd>
                  <ul
                    className="rc-tag-list"
                    aria-label={kind === "needs" ? "Kinds needed" : "Kinds offered"}
                  >
                    {CAPITALS.filter((capital) => record[kind].includes(capital.key)).map((capital) => (
                      <li key={capital.key}>
                        <Tag capital={capital} />
                      </li>
                    ))}
                  </ul>
                  {!record[kind].length && "Nothing listed"}
                </dd>
              </div>
            ))}
          </dl>
        )
      )}
      <p className="rc-meta">
        {level === 3 && record.sharedOn ? (
          <>
            Example shared <time dateTime={record.sharedOn}>{fullDate(record.sharedOn)}</time>
          </>
        ) : (
          <>Example confirmed {fullDate(record.confirmed)}</>
        )}
      </p>
      <div className="rc-action-bar">
        <ButtonLink href={recordPath(record.kind, record.id)} variant="secondary">
          Read the example
        </ButtonLink>
      </div>
      {actions && <div className="rc-action-bar">{actions}</div>}
    </Card>
  );
}
