/** A short sequence that explains how something goes. Its steps are not links: the page's own action starts it. */
export function NumberedList({ items }: { items: readonly { title: string; note: string }[] }) {
  return (
    <ol className="rc-numbered-list">
      {items.map((item, index) => (
        <li className="rc-numbered-item" key={item.title}>
          <span className="rc-numbered-number" aria-hidden="true">
            {index + 1}
          </span>
          <h3 className="rc-numbered-title">{item.title}</h3>
          <p className="rc-meta">{item.note}</p>
        </li>
      ))}
    </ol>
  );
}
