import "@regen-commons/design-system/css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, readTheme } from "./theme.ts";
import { App } from "./App.tsx";
import { connectReviewPage } from "./prototype.ts";
import { watchInstallOffer } from "./install/prompt.ts";

applyTheme(readTheme());

const root = document.getElementById("root");
if (!root) throw new Error("index.html must contain an element with the id root.");

if (__WEAVE_PROTOTYPE__) connectReviewPage();
// The browser's offer to install comes once, early, and is kept for the install guide.
else watchInstallOffer();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
