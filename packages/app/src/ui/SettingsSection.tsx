import { useId, type ReactNode } from "react";

/**
 * Settings group (`rc-settings-group`): one card for one subject. Its name, and a line that says
 * what it holds, sit beside its controls on a wide screen and above them on a phone.
 */
export function SettingsSection({
  title,
  note,
  children,
}: {
  title: string;
  /** One line under the name that says what the group is for. */
  note?: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="rc-card rc-settings-group" aria-labelledby={id}>
      <div className="rc-settings-head">
        <h2 className="rc-heading" data-size="section" id={id}>
          {title}
        </h2>
        {note && <p className="rc-meta">{note}</p>}
      </div>
      <div className="rc-settings-body">{children}</div>
    </section>
  );
}
