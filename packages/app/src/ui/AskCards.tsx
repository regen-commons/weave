import { useEffect, useRef, useState } from "react";
import { bounceAtEdges } from "@regen-commons/design-system/carousel";
import { CAPITALS } from "../capitals.ts";
import type { SectionTag } from "./section-level.ts";
import { Tag } from "./Tag.tsx";

/** One read-only need or offer as a card shows it. */
export interface AskCardItem {
  readonly key: string;
  readonly title: string;
  readonly description?: string | undefined;
  /** One line of terms, such as where and on what terms, or when it was listed. */
  readonly terms: string;
  readonly capitals: readonly string[];
}

/**
 * Read-only needs or offers as the Ask list's paired layout draws them (DL-150): two to a row in a wide
 * column, the title and words first and the kinds of support at the foot, in room for two rows of tags;
 * one row that swipes sideways in a narrow one, which bounces at either end (DL-128). A row that scrolls
 * takes the keyboard's focus, so it can be moved along without a pointer.
 */
export function AskCards({ kind, items, label, Heading }: {
  kind: "need" | "offer";
  items: readonly AskCardItem[];
  /** The list's name for assistive technology, such as "What they need". */
  label: string;
  Heading: SectionTag;
}) {
  const list = useRef<HTMLUListElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const element = list.current;
    if (!element) return;
    const row = bounceAtEdges(element);
    const measure = () => setScrolls(element.scrollWidth > element.clientWidth + 1);
    measure();
    const observer = typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    return () => { row.dispose(); observer?.disconnect(); };
  }, [items.length]);
  return (
    <ul ref={list} className="rc-ask-list" data-layout="pair" aria-label={label} tabIndex={scrolls ? 0 : undefined}>
      {items.map((item) => (
        <li key={item.key}>
          <article className="rc-card rc-ask-card" data-kind={kind}>
            <Heading className="rc-ask-title">{item.title}</Heading>
            {item.description && <p>{item.description}</p>}
            <p className="rc-ask-terms">{item.terms}</p>
            <div className="rc-ask-foot">
              {item.capitals.length ? (
                <ul className="rc-tag-list" aria-label="Kinds of support">
                  {CAPITALS.filter((capital) => item.capitals.includes(capital.key)).map((capital) => (
                    <li key={capital.key}>
                      <Tag capital={capital} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rc-meta">No kind of support yet</p>
              )}
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}
