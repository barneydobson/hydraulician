// B7 — Venturi meter rating: gauge placement rig.
// Paste into the dev console on ?scene=venturi (or run headless via the
// runner) AFTER the scene has loaded, to reproduce the two-gauge instrument
// set-up this demo reads.
//
// Geometry this relies on (see README §2 "Scene recon"):
//   invert (flat, whole domain)  z = 0.72
//   barrel bore   x in [1.5, 3.4]   0.72 -> 1.41   (height 0.6995 m, measured)
//   throat bore   x in [4.5, 5.5]   0.72 -> 1.11   (height 0.3975 m, measured)
// Both gauges sit at the SAME elevation z = 0.85 m (comfortably inside both
// bores, >6 cells from every wall at Medium resolution: barrel margin ~56
// cells from the reservoir wall / ~63 from the contraction start; throat
// margin ~39 cells from either end). Because both taps share one z, the
// Gauge tool's stored z + p/rho.g agrees with a plain pressure-only
// hover/probe reading at the same points — either method gives the same
// dHead, so students do not need to know the head-convention distinction.
(function () {
  window.APP.state.gauges.length = 0;
  window.APP.state.gauges.push({ x: 2.4, z: 0.85, hist: [], colour: "#7fd4ff" }); // 1: barrel
  window.APP.state.gauges.push({ x: 5.0, z: 0.85, hist: [], colour: "#ffb648" }); // 2: throat
  const gf = window.CONTROLS.find((c) => c.id === "gaugeField");
  if (gf) gf.set("h"); // gauge charts plot piezometric head (already the default)
  window.syncPanel();
  console.log("B7 rig: gauges placed at (2.4, 0.85) barrel and (5.0, 0.85) throat.");
})();

// --- Personalised reservoir level (set this to your own value) ---------
//   level = 1.70 + 0.06 * d      (d = last digit of your student number)
// Example for d = 6 (level = 2.06):
//
// CONTROLS.find(c => c.id === "inLevel").set(2.06); syncPanel();
