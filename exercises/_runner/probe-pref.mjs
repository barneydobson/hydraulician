// probe-pref.mjs — which elevation does the stored pressure U.b belong to?
// A still, sealed tank (inflow/tailwater/spout off, reset, settled): read U.b
// down every clean column of WET, fully submerged cells and compare
// p/g + z_ref(j) with the known level eta, for z_ref = j*dx (lower face) and
// (j+0.5)*dx (cell centre). eta is NOT fitted (a fitted eta would absorb the
// half-cell offset and the two conventions would tie): it is the column's own
// water content, (solid cells below + sum of f) * dx. Only columns whose solid
// cells are all below the water are used (no roof, no duct).
//   node exercises/_runner/probe-pref.mjs [scene=venturi] [settleSeconds=20]
import { launch } from "../../test/cdp.mjs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

const scene = process.argv[2] || "venturi";
const T = +(process.argv[3] || 20);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const url = pathToFileURL(resolve(root, "index.html")).href + "?scene=" + scene;

const browser = await launch();
try {
  const tab = await browser.open(url);
  const r = await tab.evaluate(`
    const c = CONTROLS.find((x) => x.id === "budget"); if (c) c.set("Low");
    const S = APP.sim, SIM = APP.SIM;
    S.p.inflow.on = 0; S.p.tailwater.on = 0; S.p.source.on = 0;
    SIM.resetWater();
    const t0 = Date.now();
    while (S.t < ${T} && Date.now() - t0 < 120000) APP.tick(200);
    const dx = S.dx, nx = S.nx, ny = S.ny;
    let maxU = 0, maxW = 0;
    const cols = [];
    for (let i = 4; i < nx - 4; i += 4) {
      let solidBelow = 0, sumF = 0, jtop = -1, clean = true;
      const pr = [];
      for (let j = 0; j < ny; j++) pr.push(APP.probe((i + 0.5) * dx, (j + 0.5) * dx));
      for (let j = 0; j < ny; j++) {
        const q = pr[j];
        if (q.solid >= 192) { if (sumF === 0) solidBelow++; continue; }
        sumF += Math.min(q.f, 1.0);
        if (q.f > 0.5) { jtop = j; maxU = Math.max(maxU, Math.abs(q.u)); maxW = Math.max(maxW, Math.abs(q.w)); }
      }
      for (let j = solidBelow; j < jtop; j++) if (pr[j].solid >= 192) clean = false;
      if (!clean || jtop < 0) continue;
      const eta = (solidBelow + sumF) * dx;
      const rows = [];
      for (let j = solidBelow + 2; j < jtop - 2; j++) if (pr[j].f >= 0.99) rows.push({ j, ph: pr[j].phead });
      if (rows.length < 8) continue;
      const stat = (off) => { const e = rows.map((r) => r.ph + (r.j + off) * dx - eta);
        const m = e.reduce((a, b) => a + b, 0) / e.length;
        return { bias: m, rms: Math.sqrt(e.reduce((a, b) => a + b * b, 0) / e.length) }; };
      cols.push({ i, eta, solidBelow, jtop, n: rows.length, lower: stat(0), centre: stat(0.5),
                  values: rows.map((r) => +r.ph.toFixed(4)) });
    }
    return { t: S.t, dx, maxU, maxW, cols };`);
  r.cols.forEach((c, k) => { if (k) delete c.values; });
  console.log(JSON.stringify(r));
} finally { await browser.close(); }
