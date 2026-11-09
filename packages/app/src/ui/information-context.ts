import { createContext, useContext } from "react";
import type { Information } from "./InformationDialog.tsx";
export const InformationContext = createContext<((information: Information) => void) | null>(null);
export function useInformation() {
  const open = useContext(InformationContext);
  if (!open) throw new Error("Page information context is required");
  return open;
}
