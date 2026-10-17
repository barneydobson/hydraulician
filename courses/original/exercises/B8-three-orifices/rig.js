// B8 — Three orifices, three coefficients: the three lip-type rig builders.
// Paste the block for YOUR assigned lip type into the dev console on
// ?scene=jet, right after the page loads (before/during the spin-up is
// fine — build once, then wait out the full ~55 s countdown).
//
// Geometry this relies on (see README §1 "Scene recon"):
//   orifice wall face (outer) x = 2.35, wall footprint x in [2.25, 2.35]
//   opening (the gap in the wall)         z in [1.30, 1.42]   (0.12 m)
//   tank interior is x < 2.25 (open water); jet falls freely for x > 2.35
//
// All three variants start from the SCENE DEFAULT (nothing pre-drawn) —
// each card below is a complete, independent recipe from a fresh load,
// not a diff against the previous card.

// ---------------------------------------------------------------- SHARP
// This is the scene default: do nothing. The orifice is a plain hole in a
// 0.10 m-thick plate — a "sharp edge" in the textbook sense.


// ------------------------------------------------------------ BELLMOUTH
// Chamfer BOTH upstream corners of the orifice plate away (erase, kind=0)
// rather than adding new material outside them — literally rounding the
// entry, not funnelling into it (funnelling was tried first and made C_c
// WORSE, not better: see README §4 "Iterations"). Each erase segment is a
// short 45-degree cut centred near its corner.
(function () {
  window.APP.SIM.addSeg(2.23, 1.32, 2.33, 1.22, 0.055, 0);  // lower corner bevel
  window.APP.SIM.addSeg(2.23, 1.40, 2.33, 1.50, 0.055, 0);  // upper corner bevel
  console.log("B8 rig: bellmouth (corner-bevel) orifice built.");
})();


// ---------------------------------------------------------------- BORDA
// A short tube projecting INTO the tank (upstream) from the orifice edges:
// two parallel strokes at the opening's own height. Centrelines are offset
// OUTWARD by half the stroke thickness so the tube's INNER faces land
// exactly on z=1.30/1.42 (preserving the 0.12 m bore) — centring the
// strokes on the original edges pinches the bore instead, the first
// mistake made building this rig (see README §4).
(function () {
  window.APP.SIM.addSeg(2.17, 1.285, 2.28, 1.285, 0.03, 255);  // lower tube wall
  window.APP.SIM.addSeg(2.17, 1.435, 2.28, 1.435, 0.03, 255);  // upper tube wall
  console.log("B8 rig: Borda re-entrant tube built (0.11 m protrusion).");
})();

// --- Drawing it by hand instead of pasting ------------------------------
// Wall tool, 45deg-ish short strokes at the two orifice corners (bellmouth)
// or two short parallel strokes just inside the tank from the opening
// edges (Borda) — both are well within one "drag" of the wall/erase tool
// at Medium resolution; snap isn't needed, the stroke tool already steps
// in fractions of a cell.
