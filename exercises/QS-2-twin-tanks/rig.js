/* Paste into the app console, then await QS2.demo(). No geometry is drawn:
 * the two-tank scene owns the initial water and its three polygon solids.
 * Uses the same exercise picker, reset, gauges and probes as the worksheet.
 * QS2.sample() is also the headless verifier's measurement function.
 */
window.QS2 = {
  widths(d) {
    if (d === undefined) return APP.SIM.params().values;
    if (!Number.isInteger(d) || d < 0 || d > 9) throw new Error("digit must be 0–9");
    return { tank_b1: 6.75 + 0.25 * d, tank_b2: 3.75 + 0.25 * d };
  },
  async setup(d = 9) {
    const widths = this.widths(d);
    APP.pickExercise("QS-2", d);
    await APP.EX.ready;
    APP.state.paused = true;
    // A digit prints the rule; the student still sets both widths by hand.
    APP.SIM.setParam("tank_b1", widths.tank_b1);
    APP.SIM.setParam("tank_b2", widths.tank_b2);
    APP.SIM.resetWater();
    APP.placeGauge(5, 0.35); APP.placeGauge(26.5, 0.35);
    return this.sample();
  },
  prediction(t, widths = this.widths()) {
    const B1 = widths.tank_b1, B2 = widths.tank_b2;
    const delta = Math.max(0, Math.sqrt(1.8) - 0.018 * (1/B1 + 1/B2) * t) ** 2;
    return { delta, left: 3 - B2/(B1+B2)*(1.8-delta), right: 1.2 + B1/(B1+B2)*(1.8-delta) };
  },
  sample() {
    const S = APP.sim;
    const head = x => {
      let sum = 0;
      for (let k = 0; k < 5; k++) sum += APP.probe(x + (k - 2) * 0.15, 0.35).phead + 0.35;
      return sum / 5;
    };
    APP.SIM.columns(true);
    return { t: S.t, left: S.t ? head(5) : null, right: S.t ? head(26.5) : null,
      q1: APP.SIM.lineFlux(17, 0.45, 17, 0.65).Q,
      q2: APP.SIM.lineFlux(17, 0.89, 17, 1.09).Q,
      // boxForce.mass already includes ρ Δx² (kg per metre width).
      // Divide by water density for Σf Δx², including BOTH ducts.
      massArea: APP.boxForce(0, 0, S.scene.W, S.scene.H).mass / 1000,
      volume: APP.volume(), dx: S.dx };
  },
  async advanceTo(t) {
    APP.state.paused = true;
    while (APP.sim.t < t) {
      APP.tick(100);
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  },
  async demo(d = 9) {
    const rows = [await this.setup(d)];
    const {tank_b1:B1, tank_b2:B2} = this.widths();
    for (let t = 10; t <= 180; t += 10) {
      await this.advanceTo(t); rows.push(this.sample());
    }
    const a = rows[1], b = rows[4];
    const C = 2 * (Math.sqrt(a.left - a.right) - Math.sqrt(b.left - b.right)) /
      ((1 / B1 + 1 / B2) * (b.t - a.t));
    console.table(rows);
    console.log("10–40 s calibration C:", C, "120 s prediction:", this.prediction(120));
    return { rows, C, prediction: this.prediction(120),
      maxMassDrift: Math.max(...rows.map(r => Math.abs(r.massArea / rows[0].massArea - 1))) };
  },
};
