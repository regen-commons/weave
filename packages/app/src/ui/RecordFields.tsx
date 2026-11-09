import { useId } from "react";
import type { RecordForm } from "../describe/contracts.ts";
/** The four public fields, shared by direct entry and review. Raw incomplete text stays editable. */
export function RecordFields({ value, onChange }: { value: RecordForm; onChange(value: RecordForm): void }) {
  const id = useId();
  return (
    <div className="rc-form">
      <div className="rc-field">
        <label htmlFor={`${id}-name`}>Name</label>
        <input
          className="rc-input"
          id={`${id}-name`}
          value={value.name}
          maxLength={200}
          required
          onChange={(event) => onChange({ ...value, name: event.target.value })}
        />
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-where`}>Where you work</label>
        <p className="rc-hint" id={`${id}-where-hint`}>
          Separate places with semicolons. Global is fine too.
        </p>
        <input
          className="rc-input"
          id={`${id}-where`}
          aria-describedby={`${id}-where-hint`}
          value={value.where}
          maxLength={2000}
          onChange={(event) => onChange({ ...value, where: event.target.value })}
        />
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-about`}>About it</label>
        <p className="rc-hint" id={`${id}-about-hint`}>
          Two to four sentences, up to 800 characters.
        </p>
        <textarea
          className="rc-input"
          id={`${id}-about`}
          aria-describedby={`${id}-about-hint`}
          value={value.about}
          rows={5}
          maxLength={800}
          onChange={(event) => onChange({ ...value, about: event.target.value })}
        />
      </div>
      <div className="rc-field">
        <label htmlFor={`${id}-links`}>Links</label>
        <p className="rc-hint" id={`${id}-links-hint`}>
          Optional, one complete http or https link per line, up to six.
        </p>
        <textarea
          className="rc-input"
          id={`${id}-links`}
          aria-describedby={`${id}-links-hint`}
          value={value.links}
          rows={2}
          maxLength={14000}
          onChange={(event) => onChange({ ...value, links: event.target.value })}
        />
      </div>
    </div>
  );
}
