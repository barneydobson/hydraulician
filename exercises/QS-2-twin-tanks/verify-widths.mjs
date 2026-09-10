// Student-width sweep and parameter persistence; Node 22+, GPU Chrome.
import { launch } from '../../test/cdp.mjs';
import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const browser = await launch();
try {
  const page = await browser.open(new URL('../../index.html?ex=QS-2', import.meta.url).href);
  await page.evaluate(readFileSync(new URL('rig.js', import.meta.url), 'utf8'));
  const results = [];
  for (let digit = 0; digit <= 9; digit++) {
    const initial = await page.evaluate(`return QS2.setup(${digit});`);
    const before = await page.evaluate(`return {widths:QS2.widths(), mode:state.mode,grade:state.grade,
      dryLeft:APP.probe(0.45 + 0.5*(9.5-SIM.params().values.tank_b1-0.45),0.35).f,
      dryRight:APP.probe(0.5*(24.5+SIM.params().values.tank_b2+31.5),0.35).f};`);
    assert.equal(before.widths.tank_b1, 6.75+0.25*digit);
    assert.equal(before.widths.tank_b2, 3.75+0.25*digit);
    assert.equal(before.mode,1); assert.equal(before.grade,true);
    assert.equal(before.dryLeft,0); assert.equal(before.dryRight,0);
    let t = 0;
    while(t < 120) t = await page.evaluate('APP.tick(300); return sim.t;');
    const measured = await page.evaluate('return QS2.sample();');
    const B1=before.widths.tank_b1, B2=before.widths.tank_b2;
    const delta=Math.max(0,Math.sqrt(1.8)-0.018*(1/B1+1/B2)*measured.t)**2;
    const predicted={left:3-B2/(B1+B2)*(1.8-delta),right:1.2+B1/(B1+B2)*(1.8-delta)};
    assert.ok(Math.abs(measured.left-predicted.left)<0.05,`digit ${digit}: left prediction`);
    assert.ok(Math.abs(measured.right-predicted.right)<0.05,`digit ${digit}: right prediction`);
    assert.ok(Math.abs(measured.massArea/initial.massArea-1)<0.001,`digit ${digit}: mass`);
    results.push({digit,B1,B2,predicted,measured});
    console.log(JSON.stringify(results.at(-1)));
  }
  const reset = await page.evaluate(`SIM.setParam('tank_b1',7.5); SIM.setParam('tank_b2',4.5);
    const saved=RIG.snapshot(); const t=sim.t;
    APP.switchScene('sandbox'); RIG.apply(saved);
    return {t, restoredT:sim.t, params:SIM.params().values,
      water:APP.probe(2.5,0.35).f, dry:APP.probe(1,0.35).f};`);
  assert.equal(reset.t,0); assert.equal(reset.restoredT,0);
  assert.deepEqual(reset.params,{tank_b1:7.5,tank_b2:4.5});
  assert.ok(reset.water>1); assert.equal(reset.dry,0);
  assert.deepEqual(page.errors,[]);
  writeFileSync(new URL('width-verification.json',import.meta.url),JSON.stringify(results,null,2)+'\n');
  console.log('PASS: all ten digits, width reset, dry exterior and saved-rig parameters.');
} finally { await browser.close(); }
