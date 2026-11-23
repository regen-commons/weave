import "@regen-commons/design-system/css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, readTheme } from "./theme.ts";
import { App } from "./App.tsx";
import { connectReviewPage } from "./prototype.ts";
import { watchInstallOffer } from "./install/prompt.ts";
import { routePath } from "./router.tsx";
import { retireFirstView } from "./first-view.ts";
import { keepRecordFirstView } from "./record-first-view.ts";

applyTheme(readTheme());

const root = document.getElementById("root");
if (!root) throw new Error("index.html must contain an element with the id root.");

if (__WEAVE_PROTOTYPE__) connectReviewPage();
// The browser's offer to install comes once, early, and is kept for the install guide.
else watchInstallOffer();

// A record's page from a link arrives with its heading and summary drawn by the server. The record
// shows the same words while it loads, and the app's first draw takes the view's place. The words are
// kept first: retiring a view drawn for another address clears the root, the words with it.
keepRecordFirstView(root);
retireFirstView(root, routePath());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
