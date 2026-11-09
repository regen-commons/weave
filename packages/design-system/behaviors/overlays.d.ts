/** Connect a tooltip with native interest/hint support and a local fallback. Dispose on unmount. */
export function connectTooltip(trigger: HTMLButtonElement, panel: HTMLElement): () => void;
/** Enhance a popovertarget button and native-control panel; dispose on unmount. */
export function connectPopover(trigger: HTMLButtonElement, panel: HTMLElement): () => void;
