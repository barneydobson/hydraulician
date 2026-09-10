/* Paste into the app console, then await QS2.demo(). No geometry is drawn:
 * the two-tank scene owns the initial water and its three polygon solids.
 * Uses the same exercise picker, reset, gauges and probes as the worksheet.
 * QS2.sample() is also the headless verifier's measurement function.
 */
window.QS2 = {
  async setup() {
    APP.pickExercise("QS-2");
    await APP.EX.ready;
    APP.state.paused = true;
    APP.SIM.resetWater();
    APP.placeGauge(5, 0.35); APP.placeGauge(27.5, 0.35);
    return this.sample();
  },
  prediction(t) {
    const delta = Math.max(0, Math.sqrt(1.8) - 0.005 * t) ** 2;
    return { delta, left: 3 - 0.4 * (1.8 - delta), right: 1.2 + 0.6 * (1.8 - delta) };
  },
  sample() {
    const S = APP.sim;
    const head = x => {
      let sum = 0;
      for (let k = 0; k < 5; k++) sum += APP.probe(x + (k - 2) * 0.15, 0.35).phead + 0.35;
      return sum / 5;
    };
    APP.SIM.columns(true);
    return { t: S.t, left: S.t ? head(5) : null, right: S.t ? head(27.5) : null,
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
  async demo() {
    const rows = [await this.setup()];
    for (let t = 10; t <= 180; t += 10) {
      await this.advanceTo(t); rows.push(this.sample());
    }
    const a = rows[1], b = rows[4];
    const C = 2 * (Math.sqrt(a.left - a.right) - Math.sqrt(b.left - b.right)) /
      ((1 / 9 + 1 / 6) * (b.t - a.t));
    console.table(rows);
    console.log("10–40 s calibration C:", C, "120 s prediction:", this.prediction(120));
    return { rows, C, prediction: this.prediction(120),
      maxMassDrift: Math.max(...rows.map(r => Math.abs(r.massArea / rows[0].massArea - 1))) };
  },
};
