/**
 * Card skeletons: the shape of a list while it loads, in the grid the cards will fill, so the page
 * keeps its layout when they arrive. An initiative's holds room for its picture. They are drawn for
 * the eye only. A list with its own status line says it is loading there; one without passes
 * `label`, which assistive technology hears in the drawing's place. A preview's shapes take the
 * preview's own layout (`preview`), so on a phone they hold one row and not three (DL-090).
 */
export function CardGridSkeleton({ kind, count = 3, label, preview }: {
  kind: "funding" | "initiative" | "partner"; count?: number; label?: string; preview?: "row" | "rows";
}) {
  return (
    <>
      {label && (
        <p className="rc-visually-hidden" role="status">
          {label}
        </p>
      )}
      <ul className="rc-card-grid" data-preview={preview} aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <li key={index}>
            <div className="rc-card" data-layout="listing">
              {kind === "initiative" && <span className="rc-skeleton" data-shape="media" />}
              <span className="rc-skeleton" data-shape="title" />
              <span className="rc-skeleton" data-shape="short" />
              <span className="rc-skeleton" data-shape="line" />
              <span className="rc-skeleton" data-shape="line" />
              <span className="rc-skeleton" data-shape="short" />
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

/**
 * The shape of a few lines that are on their way, and of the panel under them where one follows.
 * The words are for assistive technology only; the eye gets the shape, so nothing jumps when the
 * text arrives.
 */
export function LinesSkeleton({ label, lines = 3, panel = false }: { label: string; lines?: number; panel?: boolean }) {
  return (
    <div className="rc-stack" aria-busy="true">
      <p className="rc-visually-hidden" role="status">
        {label}
      </p>
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="rc-skeleton" data-shape={index % 2 ? "short" : "line"} />
      ))}
      {panel && <span className="rc-skeleton" data-shape="panel" />}
    </div>
  );
}

/**
 * The shape of a page that is opening the draft kept on this device: a few lines and a panel, with
 * the words for assistive technology only. It holds the page open, so what follows does not jump.
 */
export function DraftSkeleton({ label = "Opening your device draft" }: { label?: string }) {
  return <LinesSkeleton label={label} lines={2} panel />;
}
