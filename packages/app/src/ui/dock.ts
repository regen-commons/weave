import { createContext } from "react";
import { flushSync } from "react-dom";

/** The page shell's dock, where a focused step shows its way forward on a phone. Null where the shell draws none. */
export const DockContext = createContext<HTMLElement | null>(null);

/**
 * Shows a step's problem where the person is. A phone docks the step's way forward, so the problem a
 * press raises may be a screen away from it: this draws the problem now and brings it into view.
 */
export function revealProblem(id: string, show: () => void): void {
  flushSync(show);
  document.getElementById(id)?.scrollIntoView({ block: "nearest" });
}
