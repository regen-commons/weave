import type { ListingRecord } from "../listing.ts";
import { CAPITALS } from "../capitals.ts";
import { Tag } from "./Tag.tsx";
import { STAGE_LABELS } from "../listing.ts";
import { fullDate } from "../home.ts";
import { Link } from "../router.tsx";
import { recordPath } from "../routes.ts";
import { Card } from "./Card.tsx";
import { Fit } from "./Fit.tsx";
import { Icon } from "./Icon.tsx";
import { Media } from "./Media.tsx";
import { WorkTag } from "./WorkTag.tsx";

/**
 * Shared listing Card composition. Home uses h3 under its section headings. The whole card
 * opens its record, so it carries no button.
 */
export function ListingCard({
  record,
  personalized = false,
  level = 2,
}: {
  record: ListingRecord;
  personalized?: boolean;
  level?: 2 | 3;
}) {
  const Title = level === 3 ? "h3" : "h2";
  return (
    <Card>
      {record.kind === "initiative" && <Media />}
      {record.kind === "funding" && record.amount && (
        <p className="rc-eyebrow">
          <Icon name="funding" size="sm" />
          {record.amount}
        </p>
      )}
      <Title className="rc-card-title">
        <Link href={recordPath(record.kind, record.id)}>{record.title}</Link>
      </Title>
      {personalized && record.fit && (
        <Fit level={record.fit} explanation={record.reasons.join(" ")} />
      )}
      <p className="rc-card-meta">
        {record.place}
        {record.kind === "initiative" ? `, ${STAGE_LABELS[record.stage]}` : ""}
      </p>
      {record.closes && (
        <ul className="rc-tag-list" aria-label="Deadline">
          <li>
            <Tag icon="clock">
              Closes <time dateTime={record.closes}>{fullDate(record.closes, "medium")}</time>
            </Tag>
          </li>
        </ul>
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
      <p className="rc-time">
        <Icon name="clock" size="sm" />
        {level === 3 && record.sharedOn ? (
          <>
            Shared <time dateTime={record.sharedOn}>{fullDate(record.sharedOn)}</time>
          </>
        ) : (
          <>
            Confirmed <time dateTime={record.confirmed}>{fullDate(record.confirmed)}</time>
          </>
        )}
      </p>
    </Card>
  );
}
