// Theme before first paint, so the startup screen matches: same rule as applyTheme in App.tsx.
// A file, not inline, so the CSP in firebase.json can stay script-src 'self'.
(function () {
  var c = "system";
  try { c = localStorage.getItem("et.theme") || "system"; } catch (e) {}
  var dark = c === "dark" || (c !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').setAttribute("content", dark ? "#131312" : "#ffffff");
})();
