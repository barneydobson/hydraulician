// Run from any directory with Node 22+ and a GPU-backed Chrome.
import { launch } from '../../test/cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launch();
try {
  const page = await browser.open(new URL('../../index.html?scene=two-tank', import.meta.url).href);
  await page.evaluate(readFileSync(new URL('rig.js', import.meta.url), 'utf8'));
  await page.evaluate('return QS2.setup();');
  const geometry = await page.evaluate(`return (() => {
    const i=Math.floor(17/sim.dx), count=(lo,hi)=>{
      let n=0; for(let j=0;j<sim.ny;j++) {
        const z=(j+0.5)*sim.dx;
        if(z>lo && z<hi && sim.mask[j*sim.nx+i]===0) n++;
      } return n;
    };
    return {solids:sim.scene.solids().length, lower:count(0.5,0.6), upper:count(0.94,1.04)};
  })()`);
  assert.deepEqual(geometry,{solids:3,lower:2,upper:2});
  const rows = [];
  for (let target = 0; target <= 180; target += 10) {
    let t = await page.evaluate('return sim.t');
    while (t < target) t = await page.evaluate('APP.tick(100); return sim.t');
    const row = await page.evaluate('return QS2.sample();');
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
    assert.ok(Math.abs(row.massArea/rows[0].massArea-1) < 0.001, 'whole-domain mass drift');
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
  await page.evaluate('APP.tick(1); return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));');
  const screenshot = await page.send('Page.captureScreenshot', {format:'png'});
  writeFileSync(new URL('rig.png', import.meta.url), Buffer.from(screenshot.data,'base64'));
  const clip = await page.evaluate(`const r=document.getElementById('view').getBoundingClientRect();
    const h=r.width*289/480; return {x:r.x,y:r.y+(r.height-h)/2,width:r.width,height:h,scale:480/r.width};`);
  const thumb = await page.send('Page.captureScreenshot', {format:'jpeg',quality:85,clip});
  writeFileSync(new URL('../../docs/thumbs/QS-2.jpg', import.meta.url), Buffer.from(thumb.data,'base64'));
  console.log('Maximum whole-domain mass drift:', Math.max(...rows.map(r=>Math.abs(r.massArea/rows[0].massArea-1))));
  if (page.errors.length) throw new Error(page.errors.join('\n'));
  console.log('PASS: calibration, held-out prediction, branch balance, conservation, exercise boot and rig reload.');
} finally { await browser.close(); }
