import { Link } from "../router.tsx";

/** A short sequence. Only a step that can be started has a link. */
export function NumberedList({
  items,
}: {
  items: readonly { title: string; note: string; href?: string }[];
}) {
  return (
    <ol className="rc-numbered-list">
      {items.map((item, index) => (
        <li className="rc-numbered-item" key={item.title}>
          <span className="rc-numbered-number" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="rc-numbered-title">
            {item.href ? <Link href={item.href}>{item.title}</Link> : item.title}
          </h3>
          <p className="rc-meta">{item.note}</p>
        </li>
      ))}
    </ol>
  );
}
