// Run from any directory with Node 22+ and a GPU-backed Chrome.
import { launch } from '../../test/cdp.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launch();
try {
  const page = await browser.open(new URL('../../index.html?scene=two-tank', import.meta.url).href);
  await page.evaluate(`state.paused = true; state.budget = 'Medium'; sim = SIM.build(state.scene, CONFIG.budgets.Medium, false); SIM.resetWater();`);
  const rows = [];
  for (let target = 0; target <= 180; target += 10) {
    let t = await page.evaluate('return sim.t');
    while (t < target) t = await page.evaluate('APP.tick(100); return sim.t');
    const row = await page.evaluate(`return (() => {
      const head = x => { let s=0; for(let k=0;k<5;k++) s += SIM.probe(x + (k-2)*0.15, 0.35).phead + 0.35; return s/5; };
      SIM.columns(true);
      return {t:sim.t, left:sim.t ? head(5) : null, right:sim.t ? head(27.5) : null,
        q1:SIM.lineFlux(17,0.45,17,0.65).Q, q2:SIM.lineFlux(17,0.89,17,1.09).Q,
        volume:APP.volume(), dx:sim.dx};
    })()`);
    rows.push(row); console.log(JSON.stringify(row));
  }
  writeFileSync(new URL('verification.json', import.meta.url), JSON.stringify(rows,null,2)+'\n');
  const first = rows[1], last = rows[4];
  const C = 2*(Math.sqrt(first.left-first.right)-Math.sqrt(last.left-last.right)) /
    ((1/9+1/6)*(last.t-first.t));
  assert.ok(Math.abs(C/0.036-1) < 0.05, 'early calibration changed');
  const held = rows[12], delta = Math.max(0, Math.sqrt(1.8)-0.005*held.t)**2;
  assert.ok(Math.abs(held.left-(3-0.4*(1.8-delta))) < 0.05, 'held-out left prediction');
  assert.ok(Math.abs(held.right-(1.2+0.6*(1.8-delta))) < 0.05, 'held-out right prediction');
  for (const row of rows.slice(1)) {
    assert.ok(row.q1 > 0 && row.q2 > 0, 'both branches flow downstream');
    assert.ok(Math.abs(row.q1-row.q2)/((row.q1+row.q2)/2) < 0.02, 'branch balance');
    assert.ok(Math.abs(row.volume/rows[0].volume-1) < 0.003, 'volume drift');
  }
  await page.evaluate(`APP.pickExercise('QS-2'); return EX.ready;`);
  const boot = await page.evaluate(`state.paused=true; SIM.resetWater();
    APP.placeGauge(5,0.35); APP.placeGauge(27.5,0.35);
    return {scene:state.scene.id, budget:state.budget, t:sim.t, rig:RIG.snapshot()};`);
  assert.equal(boot.scene, 'two-tank'); assert.equal(boot.budget, 'Medium'); assert.equal(boot.t,0);
  writeFileSync(new URL('hydraulician-rig-QS-2.json', import.meta.url), JSON.stringify(boot.rig,null,2)+'\n');
  const restored = await page.evaluate(`APP.switchScene('sandbox');
    RIG.apply(${JSON.stringify(boot.rig)}); state.paused=true;
    const C=SIM.columns(true), surface=x=>{const i=Math.floor(x/sim.dx)*4; return C[i]+C[i+1];};
    return {scene:state.scene.id, t:sim.t, left:surface(5), right:surface(27.5), gauges:state.gauges.length};`);
  assert.equal(restored.scene,'two-tank'); assert.equal(restored.t,0); assert.equal(restored.gauges,2);
  assert.ok(Math.abs(restored.left-3)<0.04 && Math.abs(restored.right-1.2)<0.04, 'reload initial water');
  await page.evaluate('APP.tick(1);');
  const screenshot = await page.send('Page.captureScreenshot', {format:'png'});
  writeFileSync(new URL('rig.png', import.meta.url), Buffer.from(screenshot.data,'base64'));
  if (page.errors.length) throw new Error(page.errors.join('\n'));
  console.log('PASS: calibration, held-out prediction, branch balance, conservation, exercise boot and rig reload.');
} finally { await browser.close(); }
