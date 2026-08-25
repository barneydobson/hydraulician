// Math rendering for the Pages build. github.com renders ```math fences
// natively and strips <script> tags from markdown, so this file never runs
// there. Under Jekyll (kramdown, jekyll-theme-primer) the same fences arrive
// as plain code blocks tagged language-math; rewrite them to TeX display
// math and hand the page to MathJax. Loaded by a <script> tag at the foot of
// README.md and docs/numerics.md.
(function () {
  var blocks = document.querySelectorAll(
    "div.language-math, pre > code.language-math");
  if (!blocks.length) return;
  blocks.forEach(function (b) {
    var host = b.closest("div.language-math") || b.closest("pre") || b;
    if (!host.parentNode) return;               // wrapper already rewritten
    var d = document.createElement("div");
    d.textContent = "\\[" + b.textContent + "\\]";
    host.replaceWith(d);
  });
  var s = document.createElement("script");
  s.src = "https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js";
  s.async = true;
  document.head.appendChild(s);
})();
