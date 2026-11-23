import { useId, type ReactNode } from "react";

/**
 * Settings group (`rc-settings-group`): one card for one subject. Its name, and a line that says
 * what it holds, sit beside its controls on a wide screen and above them on a phone.
 */
export function SettingsSection({
  title,
  note,
  level = 2,
  children,
}: {
  title: string;
  /** One line under the name that says what the group is for. */
  note?: string;
  /** The heading's level: 3 where the group sits under a section's own heading, as on a phone's You tab. */
  level?: 2 | 3;
  children: ReactNode;
}) {
  const id = useId();
  const Name = level === 3 ? "h3" : "h2";
  return (
    <section className="rc-card rc-settings-group" aria-labelledby={id}>
      <div className="rc-settings-head">
        <Name className="rc-heading" data-size="section" id={id}>
          {title}
        </Name>
        {note && <p className="rc-meta">{note}</p>}
      </div>
      <div className="rc-settings-body">{children}</div>
    </section>
  );
}
