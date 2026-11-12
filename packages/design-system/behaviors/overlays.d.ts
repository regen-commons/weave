/** Connect a tooltip with native interest/hint support and a local fallback. Dispose on unmount. */
export function connectTooltip(trigger: HTMLButtonElement, panel: HTMLElement): () => void;
/**
 * Enhance a popovertarget button and its panel of native controls or links; dispose on unmount.
 * A panel marked `data-align="end"` ends at its trigger's end edge. Anything in it marked
 * `data-close-popover` closes it when pressed.
 */
export function connectPopover(trigger: HTMLButtonElement, panel: HTMLElement): () => void;

/**
 * Where a panel opens against its trigger and how tall it may grow, in CSS pixels: under the
 * trigger when it fits, over it when it fits only there, and otherwise beside it, scrolling inside.
 */
export function blockPlacement(input: {
  triggerTop: number;
  triggerBottom: number;
  panelHeight: number;
  windowHeight: number;
  gap: number;
}): { top: number; maxBlock: number };

/** Where a panel sits across the window against its trigger, in CSS pixels, kept inside the window. */
export function inlinePlacement(input: {
  triggerLeft: number;
  triggerRight: number;
  panelWidth: number;
  windowWidth: number;
  gap: number;
  align?: string | undefined;
}): number;
