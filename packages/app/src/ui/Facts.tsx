/** Facts molecule (`rc-facts`): a short list of labelled values, such as the details a review shows. */
export function Facts({ items }: { items: readonly { term: string; value: string }[] }) {
  return (
    <dl className="rc-facts">
      {items.map((item) => (
        <div key={item.term}>
          <dt>{item.term}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
