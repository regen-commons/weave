import { Icon } from "./Icon.tsx";
import type { IconName } from "./icons.ts";

/**
 * A short sequence that explains how something goes. Its steps are not links: the page's own action
 * starts it. A step can show the sign a person has to find on their own screen, beside its words.
 */
export function NumberedList({
  items,
  level = 3,
}: {
  items: readonly { title: string; note: string; icon?: IconName }[];
  /** The heading level of a step, one below the heading the list sits under. */
  level?: 3 | 4;
}) {
  const Title = `h${level}` as const;
  return (
    <ol className="rc-numbered-list">
      {items.map((item, index) => (
        <li className="rc-numbered-item" key={item.title}>
          <span className="rc-numbered-number" aria-hidden="true">
            {index + 1}
          </span>
          <Title className="rc-numbered-title">
            {item.icon && <Icon name={item.icon} />}
            {item.title}
          </Title>
          <p className="rc-meta">{item.note}</p>
        </li>
      ))}
    </ol>
  );
}
