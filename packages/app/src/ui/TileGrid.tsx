import type { Capital } from "../capitals.ts";
import { Tooltip } from "./Tooltip.tsx";

/** Tile grid organism, made of Tile cards with one explanation each. */
export function TileGrid({ capitals }: { capitals: readonly Capital[] }) {
  return (
    <ul className="rc-tile-grid">
      {capitals.map((capital) => (
        <li data-capital={capital.key} key={capital.key}>
          <Tooltip text={capital.description}>
            <span className="rc-tile-card">
              <span className="rc-tile" aria-hidden="true">
                {capital.glyph}
              </span>
              <span className="rc-tile-card-title">{capital.title}</span>
              <span className="rc-tile-card-meaning">{capital.label}</span>
            </span>
          </Tooltip>
        </li>
      ))}
    </ul>
  );
}
