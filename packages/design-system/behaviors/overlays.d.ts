/** Connect a tooltip with native interest/hint support and a local fallback. Dispose on unmount. */
export function connectTooltip(trigger: HTMLButtonElement, panel: HTMLElement): () => void;
/** Enhance a popovertarget button and native-control panel; dispose on unmount. */
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
