// Draws a pinned theme from the first paint (DL-097). The app's own script is a module, which
// runs after the page is first drawn, so a person who pinned Dark on a light phone saw a light
// page for a moment on every cold start. This file is read before anything is drawn.
// It is a file of the site's own, loaded like every other script, so the security policy
// (script-src 'self', in vercel.json) stays as it is: nothing inline, no hash, no exception.
// src/theme.ts owns the theme. This repeats what it stored, and a test holds the two together.
//
// It also marks Home before the body is drawn. index.html carries Home's first view as HTML (drawn at
// build time, dev/prerender.ts), and the server sends the same file for addresses without a page of
// their own, so the design system's base.css shows that view only on a page marked as Home.
(function () {
  if (location.pathname === "/") document.documentElement.setAttribute("data-home", "");
})();
// It marks, too, whether this device's draft held a checked card when it was last open: a flag the
// app keeps, with nothing of the card in it (src/describe/checked-hint.ts). Until the draft opens, a
// page that changes with the card, such as Funding, draws the room for each, and base.css shows the
// one the mark names, so the first paint holds the right room.
(function () {
  try {
    if (localStorage.getItem("weave-checked-card") === "1") document.documentElement.setAttribute("data-checked-card", "");
  } catch (error) {
    // No storage to read: the page holds the room for no checked card.
  }
})();
// It marks a visit the service worker does not control yet, a first visit, whose fonts are not stored.
// The reading face is not preloaded (DL-057), so the browser would ask for it when card summaries
// first need it and hold their text invisible for up to 100 ms before using the size-matched
// fallback for the rest of the visit. base.css uses that fallback from the start instead. The worker
// stores the faces, so later visits it controls read in Source Serif.
(function () {
  try {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) document.documentElement.setAttribute("data-first-visit", "");
  } catch (error) {
    // No way to tell: the page asks for the face as before.
  }
})();
// The first view is inert until the app replaces it. If the app's code never arrives, as on a first
// visit that loses its connection, the view would stay dead to clicks, taps and screen readers, so
// after a while its links work as plain links. The app takes the mark off as it starts.
(function () {
  setTimeout(function () {
    var root = document.getElementById("root");
    if (root && root.hasAttribute("data-first-view")) root.removeAttribute("inert");
  }, 8000);
})();
(function () {
  try {
    var theme = localStorage.getItem("rc-theme");
    if (theme !== "light" && theme !== "dark") return;
    document.documentElement.dataset.theme = theme;
    var scheme = document.querySelector('meta[name="color-scheme"]');
    if (scheme) scheme.setAttribute("content", theme);
    // The browser's bar and an installed app's status bar take the pinned theme's surface too.
    var colours = document.querySelectorAll('meta[name="theme-color"][data-scheme]');
    for (var index = 0; index < colours.length; index++) {
      colours[index].setAttribute("media", colours[index].getAttribute("data-scheme") === theme ? "all" : "not all");
    }
  } catch (error) {
    // No storage to read: the page follows the system, as it does with nothing pinned.
  }
})();
