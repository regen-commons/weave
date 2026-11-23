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
