import type { ReactNode } from "react";

/** The exact room of words on their way: about as many, unseen, in the type of the part they sit in. */
function Hold({ children }: { children: ReactNode }) {
  return (
    <span className="rc-skeleton" data-shape="hold">
      {children}
    </span>
  );
}

type SkeletonKind = "funding" | "initiative" | "project" | "partner";

/**
 * One card's shape, built from the parts the loaded card has, in their own classes and with the
 * same fixed rows, so each part keeps exactly the room the loaded card's part keeps and the two are
 * one height by construction (DL-104, DL-108). The words only draw the shape; they set no height,
 * and nobody reads or hears them.
 */
function SkeletonCard({ kind }: { kind: SkeletonKind }) {
  if (kind === "funding")
    return (
      <div className="rc-card" data-layout="listing" data-kind="funding" data-rows="fixed">
        <p className="rc-eyebrow">
          <Hold>Grant, USD 00,000</Hold>
        </p>
        <p className="rc-card-title">
          <Hold>Funding program name that runs to a second line</Hold>
        </p>
        <p className="rc-card-meta">
          <Hold>Funder name</Hold>
        </p>
        <div className="rc-tag-list">
          <span className="rc-tag">
            <Hold>Open call</Hold>
          </span>
          <span className="rc-tag" data-emphasis="strong">
            <Hold>Closes 00 Nov 0000</Hold>
          </span>
        </div>
        <p className="rc-card-summary">
          <Hold>What the program supports, in a few words that run to a second line</Hold>
        </p>
        <p className="rc-time">
          <Hold>Sources checked 00 November 0000</Hold>
        </p>
      </div>
    );
  if (kind === "project")
    return (
      <div className="rc-card" data-layout="listing" data-kind="initiative" data-rows="fixed">
        <p className="rc-card-title">
          <Hold>Project name</Hold>
        </p>
        <p className="rc-card-summary">
          <Hold>
            The project in its own words, which usually run long enough to fill the three lines a card gives a
            summary before it is cut short, so the shape keeps all three of them
          </Hold>
        </p>
        <p className="rc-meta">
          <Hold>Source: Certified, checked on 00 November 0000.</Hold>
        </p>
        <p className="rc-time">
          <Hold>Shared 00 November 0000</Hold>
        </p>
      </div>
    );
  return (
    <div className="rc-card" data-layout="listing">
      {kind === "initiative" && <span className="rc-skeleton" data-shape="media" />}
      <span className="rc-skeleton" data-shape="title" />
      <span className="rc-skeleton" data-shape="short" />
      <span className="rc-skeleton" data-shape="line" />
      <span className="rc-skeleton" data-shape="line" />
      <span className="rc-skeleton" data-shape="short" />
    </div>
  );
}

/**
 * Card skeletons: the shape of a list while it loads, in the grid the cards will fill, so the page
 * keeps its layout when they arrive. A funding card's and a public project's are built from the
 * loaded card's own parts; an example initiative's holds room for its picture. They are drawn for
 * the eye only. A list with its own status line says it is loading there; one without passes
 * `label`, which assistive technology hears in the drawing's place. A preview's shapes take the
 * preview's own layout (`preview`), so on a phone they hold one row and not three (DL-090).
 */
export function CardGridSkeleton({ kind, count = 3, label, preview }: {
  kind: SkeletonKind; count?: number; label?: string; preview?: "row" | "rows";
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
            <SkeletonCard kind={kind} />
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
