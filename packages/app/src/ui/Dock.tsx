import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DockContext } from "./dock.ts";

/**
 * Dock organism (`rc-dock`): a focused step's way forward on a phone, drawn in the page shell where
 * the tab bar would be. A wide screen does not draw the dock, so the step also shows the same action
 * in its place on the page, marked `data-from="wide"`.
 */
export function Dock({ children }: { children: ReactNode }) {
  const dock = useContext(DockContext);
  return dock && createPortal(children, dock);
}
