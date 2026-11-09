import { createContext } from "react";
import type { DraftController } from "./controller.ts";
export const DraftContext = createContext<{ controller: DraftController; fixture: boolean } | null>(null);
