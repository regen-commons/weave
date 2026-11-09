import { useId, type ReactNode } from "react";
/** Settings groups stay in place; Leave is set apart at the bottom. */
export function SettingsSection({
  title,
  leave,
  children,
}: {
  title: string;
  leave?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className={leave ? "rc-settings-leave" : "rc-stack"} aria-labelledby={id}>
      <h2 className="rc-heading" data-size="section" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}
