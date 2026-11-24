import "@regen-commons/design-system/css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { applyTheme, readTheme } from "./theme.ts";
import { App, preloadPage } from "./App.tsx";
import { connectReviewPage } from "./prototype.ts";
import { watchInstallOffer } from "./install/prompt.ts";
import { registerWorkerWhenIdle } from "./register-worker.ts";
import { currentRoute, routePath } from "./router.tsx";
import { retireFirstView } from "./first-view.ts";
import { keepRecordFirstView } from "./record-first-view.ts";
import { keepServedFirstPage } from "./partners/public-projects.ts";

applyTheme(readTheme());

const root = document.getElementById("root");
if (!root) throw new Error("index.html must contain an element with the id root.");

if (__WEAVE_PROTOTYPE__) connectReviewPage();
// The browser's offer to install comes once, early, and is kept for the install guide.
else watchInstallOffer();

// The first page's code arrives before the first draw, so the page is drawn whole at once. A fetch
// that fails still draws the app, whose page then waits for its code under a Suspense boundary.
await preloadPage(currentRoute()).catch(() => {});
// A record's page from a link arrives with its heading and summary drawn by the server. The record
// shows the same words while it loads, and the app's first draw takes the view's place. The words are
// kept first: retiring a view drawn for another address clears the root, the words with it.
keepRecordFirstView(root);
// The Initiatives page from the server arrives with its first cards drawn, and their page as JSON, which
// the list starts from, so its first draw has the same cards and asks for none.
keepServedFirstPage(document);
retireFirstView(root, routePath());
// The app has started, so the note for a page whose script never ran is not needed.
document.querySelector("[data-app-fallback]")?.remove();

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Offline support, once the page has loaded and the browser is idle. The prototype has no worker.
if (!__WEAVE_PROTOTYPE__) registerWorkerWhenIdle(window);
