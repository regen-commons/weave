// Moves tabs that are not on screen to a new version of the app when it takes over (DL-114).
//
// The service worker takes over as soon as it is installed, but a tab keeps running the version
// it loaded until it is loaded again. This file is read by the generated service worker
// (`importScripts` in vite.config.ts) and reloads only the tabs nobody is looking at:
// - A first install reloads nothing. There is no older version to leave.
// - A tab on screen is never reloaded. The person may be typing or talking, and it moves to the
//   new version the next time it is loaded. What it stores meanwhile is picked up by the new
//   version, which looks at the earlier storage again.
// - A hidden tab is reloaded after a short wait, and only if it is still hidden. The released
//   version stores the words in its box on every keystroke and on every result while dictating,
//   and the wait lets the last of those writes finish.
// Not protected in a hidden tab: a file still being read, and words in a field the released
// version keeps only on the page until they are added or sent.
(function () {
  /** Long enough for a tab's last write to device storage to finish. */
  var WAIT_MS = 2000;
  var updating = false;
  var windows = function () {
    return self.clients.matchAll({ type: "window", includeUncontrolled: true });
  };
  function reloadHiddenTabs() {
    return windows().then(function (before) {
      var hidden = before.filter(function (tab) { return tab.visibilityState === "hidden"; }).map(function (tab) { return tab.id; });
      if (!hidden.length) return;
      setTimeout(function () {
        windows().then(function (now) {
          now
            .filter(function (tab) { return hidden.indexOf(tab.id) !== -1 && tab.visibilityState === "hidden"; })
            // A tab that cannot be reloaded stays as it is, on the version it has.
            .forEach(function (tab) { tab.navigate(tab.url).catch(function () {}); });
        });
      }, WAIT_MS);
    });
  }
  self.addEventListener("install", function () {
    // A worker already in charge means this is an update, not a first visit.
    updating = !!self.registration.active;
  });
  self.addEventListener("activate", function () {
    // Never inside the event's `waitUntil`. A reload is a page load that this worker has to
    // answer, and it answers nothing until its activation has finished, so waiting here for the
    // reloads would be waiting for itself, and every page of the site would hang with it. The
    // price: if the browser stops the worker during the short wait, nothing is reloaded, and
    // the tabs stay on the version they have, which still works.
    if (updating) reloadHiddenTabs();
  });
})();
