import { CAPITALS } from "../capitals.ts";
import type { Initiative } from "../describe/contracts.ts";
import type { AskFields } from "../intake/contracts.ts";
import { askTerms } from "../intake/presentation.ts";
import { RecordPreview } from "../ui/RecordPreview.tsx";
import { Tag } from "../ui/Tag.tsx";

/** The same checked card on device and in a team workspace. Its surrounding page owns the available actions. */
export function InitiativeRecord({ fields, needs, offers, team = false }: {
  fields: Initiative; needs: readonly AskFields[]; offers: readonly AskFields[]; team?: boolean;
}) {
  return <RecordPreview fields={fields} confirmed team={team}>
    {(["needs", "offers"] as const).map(kind => {
      const entries = kind === "needs" ? needs : offers;
      return <section className="rc-stack" key={kind} aria-label={kind === "needs" ? "Needs" : "Offers"}>
        <h3 className="rc-heading" data-size="section">{kind === "needs" ? "Needs" : "Offers"}, {entries.length}</h3>
        {entries.length ? <ul className="rc-ask-summary">{entries.map((entry, index) => <li key={index}>
          <strong>{entry.title}</strong>
          {entry.capitalForms.length ? <ul className="rc-tag-list" aria-label="Kinds of support">
            {CAPITALS.filter(capital => entry.capitalForms.includes(capital.key)).map(capital => <li key={capital.key}><Tag capital={capital} /></li>)}
          </ul> : <p className="rc-meta">No kind of support yet</p>}
          <p className="rc-meta">{askTerms(entry, kind)}</p>
        </li>)}</ul> : <p className="rc-meta">None added.</p>}
      </section>;
    })}
  </RecordPreview>;
}
