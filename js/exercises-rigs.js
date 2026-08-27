/* Generated rig payloads for the exercise picker. One entry per drawn-rig
   exercise: the RIG snapshot JSON its folder's rig.js produces.

   Hand an entry to APP.RIG.apply() (js/main.js) and the drawn geometry, the
   edge modes, the level controls, the spout/piston, every Hydraulics slider,
   the gauges/rakes and the display state come back exactly as the rig.js
   built them. Stored as OBJECTS, not as deflated #rig= codes, so they stay
   human-diffable and a future format v2 can migrate them in place.

   NOT in a payload, by RIG's own design (RIGSHARE-report.md §2): the water
   (apply() ends with resetWater, so the spin-up runs against this geometry),
   the view/zoom, and the Resolution — every capture below was taken at
   Medium and every one re-applies identically at Medium. A rig whose demo
   needs another resolution must set it after loading, not before.

   Captured and verified headless (exercises/_code-changes/RIGCAP-report.md):
   each payload was applied to a freshly booted page and compared against the
   rig.js-built original on an FNV-1a hash of sim.mask plus wall/valve cell
   counts and 18 further state keys. All 26 round-trip byte-identical.

   DA-3 (scale effects) has no payload of its own: it drives DA-1's and DA-2's
   rigs around the Resolution control, so it maps onto DA-1@1 / DA-1@0.5 /
   DA-1@0.25 (its resolution sweep) and DA-2@0.25 (its orifice exhibit).

   Regenerate: exercises/_runner/runner.py + the rig.js of each folder; the
   build call used for every entry is quoted above its key.  Do not hand-edit
   coordinates — redraw and re-capture. */
const EXERCISE_RIGS = {
  /* FR-1-friction-law/rig.js · RIGA.build() · reservoir 3.30 m (digit d = 0) */
  "FR-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [1.5, 1, 9.3, 1, 2, 255],
     [1.5, 2.55, 9.3, 2.55, 0.3, 255],
     [1.5, 2.4, 1.5, 5.2, 0.12, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 1, "level": 3.3, "q": 0.25},
   "tailwater": {"on": 1, "level": 2.5},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.4, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[4, 2.2], [8.5, 2.2]],
   "rakes": [],
   "ui": {"mode": 1, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* LL-1-borda-carnot/rig.js · LL1.build() · reservoir 3.45 m (digit d = 0) */
  "LL-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [1.5, 1, 9.3, 1, 2, 255],
     [1.5, 2.55, 3.8, 2.55, 0.3, 255],
     [3.8, 2.95, 9.3, 2.95, 0.3, 255],
     [1.5, 2.4, 1.5, 5.2, 0.12, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 1, "level": 3.45, "q": 0.25},
   "tailwater": {"on": 1, "level": 2.95},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.4, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[3.4, 2.2], [7.6, 2.1]],
   "rakes": [],
   "ui": {"mode": 1, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* LL-2-find-throttle/rig.js · LL2.build() · the CLEAN pipe at the shared level 3.90 m — partner A's hidden fault is NOT in this payload (see NOTES) */
  "LL-2": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [1.5, 1, 9.3, 1, 2, 255],
     [1.5, 2.55, 9.3, 2.55, 0.3, 255],
     [1.5, 2.4, 1.5, 5.2, 0.12, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 1, "level": 3.9, "q": 0.25},
   "tailwater": {"on": 1, "level": 2.5},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.4, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[4, 2.2], [8.5, 2.2]],
   "rakes": [],
   "ui": {"mode": 1, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* PU-1-system-curve/rig.js · PU1.build() · spout OFF at the sandbox default position; prime by hand (README §2: fillSump 7 s, then installPump(2.2) ~55 s, then the digit's own vx) */
  "PU-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0, 2.7, 9, 2.7, 2.2, 0],
     [0, 0.2, 4, 0.2, 0.4, 255],
     [1.8, 0.95, 3.6, 0.95, 0.3, 255],
     [4, 1, 8.5, 1, 2, 255],
     [3.6, 2.55, 6.5, 2.55, 0.3, 255],
     [8.5, 2, 8.5, 2.9, 0.1, 255],
     [3.525, 1.05, 3.525, 2.75, 0.15, 255]
   ],
   "open": [0, 0, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 1, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* WE-1-sharp-weir/rig.js · RIGB.build({plate:{x:6.5,P:0.50}, bedX1:6.525, q:0.35, level:1.326, gauge:4.5}) — the README §1 build card verbatim */
  "WE-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 6.525, 0.25, 0.5, 255],
     [6.5, 0.4, 6.5, 1, 0.05, 255]
   ],
   "open": [1, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 1.326, "q": 0.35},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[4.5, 0.75]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* MO-1-gate-cv/rig.js · MOGATE.build({a:0.1522, q:0.33, level:1.2103}) — the README §1 card, the 7-cell opening (digits 5-7) */
  "MO-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 7.1, 0.25, 0.5, 255],
     [5.5, 3, 5.5, 0.6522, 0.05, 255]
   ],
   "open": [1, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 1.2103, "q": 0.33},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[3.5, 0.65]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* MO-2-jet-vane/rig.js · JETRIG.build(); JETRIG.flat() — the flat plate, first rung of the turning series; d45/d90/deepV are redrawn per step */
  "MO-2": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0, 2.7, 9, 2.7, 2.4, 0],
     [1.35, 2, 1.35, 3, 0.06, 255]
   ],
   "open": [0, 0, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 1, "x": 0.7, "z": 2.5, "r": 0.09, "vx": 4.5, "vz": 0},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 2, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* HP-1-penstock-power/rig.js · HP1.build(0.84) on ?scene=hammer — fixed penstock plate (x 8.0, gap 0.70) + nozzle plate at 0.84 m */
  "HP-1": {
   "v": 2,
   "scene": "hammer",
   "segs": [
     [56.5, 2.05, 56.5, 4.95, 0.6, 0],
     [8, 2, 8, 3.15, 0.5, 255],
     [8, 3.85, 8, 5, 0.5, 255],
     [56.5, 2, 56.5, 3.08, 0.5, 255],
     [56.5, 3.92, 56.5, 5, 0.5, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 0,
   "inflow": {"on": 1, "free": 1, "level": 25, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.5, "z": 4, "r": 0.12, "vx": 1.2, "vz": -1.6},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 70, "cf": 0.004, "cs": 0.05, "bulk": 0.03, "ca": 0.6, "nu": 0.0001, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 1, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* HP-2-pelton/rig.js · JETRIG.build(); JETRIG.flat() — byte-identical to MO-2 (the two folders ship the same rig card) */
  "HP-2": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0, 2.7, 9, 2.7, 2.4, 0],
     [1.35, 2, 1.35, 3, 0.06, 255]
   ],
   "open": [0, 0, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 1, "x": 0.7, "z": 2.5, "r": 0.09, "vx": 4.5, "vz": 0},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 2, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* FB-1-choking-hump/rig.js · FB1.buildBase(0.35, 1.00, 1.00) — base channel, NO hump: students raise it themselves (see NOTES) */
  "FB-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 9.3, 0.25, 0.5, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 1, "q": 0.35},
   "tailwater": {"on": 1, "level": 1},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[2.5, 0.75]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* FB-2-yc-three-ways/rig.js · FB2.build(0.35) — the class-base q */
  "FB-2": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 7.4, 0.25, 0.5, 255],
     [6.3, 0.687391, 7.4, 0.687391, 0.494783, 255]
   ],
   "open": [1, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 1.3476, "q": 0.35},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[6.85, 1.134783]],
   "rakes": [],
   "ui": {"mode": 3, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* DA-1-scale-ladder/rig.js · DA1.build(1, 0.72) */
  "DA-1@1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 6.521739, 0.25, 0.5, 255],
     [4.782609, 0.628913, 6.521739, 0.628913, 0.378204, 255],
     [4.782609, 1.006739, 6.521739, 1.006739, 0.378204, 255]
   ],
   "open": [1, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 1.86, "q": 0.72},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[2.173913, 1.245652]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* DA-1-scale-ladder/rig.js · DA1.build(0.5, 0.72) */
  "DA-1@0.5": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 3.26087, 0.25, 0.5, 255],
     [2.391304, 0.643913, 3.26087, 0.643913, 0.408234, 255]
   ],
   "open": [1, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 1.18, "q": 0.2546},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[1.086957, 0.897826]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* DA-1-scale-ladder/rig.js · DA1.build(0.25, 0.72) */
  "DA-1@0.25": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [-0.3, 0.25, 1.630435, 0.25, 0.5, 255],
     [1.195652, 0.556957, 1.630435, 0.556957, 0.234147, 255]
   ],
   "open": [1, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 0, "level": 0.84, "q": 0.09},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[0.543478, 0.723913]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  },

  /* DA-2-time-scales/rig.js · DA2.build(1) — 4-cell orifice */
  "DA-2@1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.5, 3.45, 3.4, 2.85, 0.55, 0],
     [3.2, 2.6, 7.1, 1.95, 0.55, 0],
     [4.5, -0.2, 4.5, 3.2, 0.12, 255],
     [4.35, 0, 4.65, 0, 0.204211, 128]
   ],
   "open": [0, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 1, "level": 0.04},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[2.25, 0.1], [5.5, 0.02]],
   "rakes": [],
   "ui": {"mode": 0, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* DA-2-time-scales/rig.js · DA2.build(0.75) — 3-cell orifice */
  "DA-2@0.75": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.5, 3.45, 3.4, 2.85, 0.55, 0],
     [3.2, 2.6, 7.1, 1.95, 0.55, 0],
     [3.375, -0.2, 3.375, 3.2, 0.12, 255],
     [3.225, 0, 3.525, 0, 0.157086, 128]
   ],
   "open": [0, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 1, "level": 0.04},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[1.6875, 0.075], [4.375, 0.02]],
   "rakes": [],
   "ui": {"mode": 0, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* DA-2-time-scales/rig.js · DA2.build(0.5) — 2-cell orifice */
  "DA-2@0.5": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.5, 3.45, 3.4, 2.85, 0.55, 0],
     [3.2, 2.6, 7.1, 1.95, 0.55, 0],
     [2.25, -0.2, 2.25, 3.2, 0.12, 255],
     [2.1, 0, 2.4, 0, 0.120835, 128]
   ],
   "open": [0, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 1, "level": 0.04},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[1.125, 0.05], [3.25, 0.02]],
   "rakes": [],
   "ui": {"mode": 0, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* DA-2-time-scales/rig.js · DA2.build(0.25) — 1-cell orifice */
  "DA-2@0.25": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.5, 3.45, 3.4, 2.85, 0.55, 0],
     [3.2, 2.6, 7.1, 1.95, 0.55, 0],
     [1.125, -0.2, 1.125, 3.2, 0.12, 255],
     [0.975, 0, 1.275, 0, 0.09295, 128]
   ],
   "open": [0, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 1, "level": 0.04},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[0.5625, 0.025], [2.125, 0.02]],
   "rakes": [],
   "ui": {"mode": 0, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* QS-2-twin-tanks/rig.js · QS2.build() — tank 2 at the card's own default A2 = 2.00 m (digit d = 6); A2 is per-student geometry, see NOTES */
  "QS-2": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.5, 3.45, 3.4, 2.85, 0.55, 0],
     [3.2, 2.6, 7.1, 1.95, 0.55, 0],
     [2.8, -0.2, 2.8, 3.2, 1.6, 255],
     [5.65, -0.2, 5.65, 3.2, 0.1, 255],
     [1.93, 0, 3.67, 0, 0.1208, 128]
   ],
   "open": [0, 0, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.4, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[0.9, 0.3], [4.6, 0.3]],
   "rakes": [],
   "ui": {"mode": 0, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* UN-3-surge-tank/rig.js · UN3.setup(0.98) on ?scene=hammer — b_s = 0.98 m (7 cells, digit d = 2), the width the README's seal audit is quoted at */
  "UN-3": {
   "v": 2,
   "scene": "hammer",
   "segs": [
     [56.5, 2.05, 56.5, 4.95, 0.6, 0],
     [56.5, 2, 56.5, 3.36, 0.5, 255],
     [56.5, 3.64, 56.5, 5, 0.5, 255],
     [53, 4.9, 53, 6.6, 0.98, 0],
     [52.36, 4.9, 52.36, 29.6, 0.3, 255],
     [53.64, 4.9, 53.64, 29.6, 0.3, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 0,
   "inflow": {"on": 1, "free": 1, "level": 12, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 0, "x": 0.5, "z": 4, "r": 0.12, "vx": 1.2, "vz": -1.6},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 70, "cf": 0.004, "cs": 0.05, "bulk": 0.03, "ca": 0.6, "nu": 0.0001, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[53, 6]],
   "rakes": [],
   "ui": {"mode": 1, "field": "d", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* CS-1-cso-spill/rig.js · CS1.build({presses: 0}) — the 6-cell throttle; the storm is the spout, ramped by CS1.storm(vx) from ~1.7 m/s */
  "CS-1": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 3.5, 3.5, 2.85, 0.45, 0],
     [3.2, 2.62, 7.1, 1.95, 0.45, 0],
     [-0.4, 2.9, 3, 2.9, 0.2, 255],
     [3, 1.35, 3, 2.95, 0.1, 255],
     [2.95, 1.4, 4.6, 1.4, 0.2, 255],
     [4.5, 1.35, 4.5, 2.5, 0.05, 255],
     [4, 1.56, 4, 1.24, 0.121, 0]
   ],
   "open": [0, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 1, "x": 0.75, "z": 3.16, "r": 0.1, "vx": 0.5, "vz": 0},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.16, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0},
   "gauges": [[4.25, 1.62]],
   "rakes": [],
   "ui": {"mode": 0, "field": "d", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* B8-three-orifices · ?scene=jet untouched — the sharp-edged orifice IS the scene default (no drawn strokes) */
  "B8-sharp": {
   "v": 2,
   "scene": "jet",
   "segs": [],
   "open": [0, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 1, "x": 1.1, "z": 3.15, "r": 0.13, "vx": 0.1, "vz": -1.6},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 26, "cf": 0.004, "cs": 0.1, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 2, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* B8-three-orifices/rig.js · the BELLMOUTH paste block (two 45° erase bevels on the upstream corners) */
  "B8-bellmouth": {
   "v": 2,
   "scene": "jet",
   "segs": [
     [2.23, 1.32, 2.33, 1.22, 0.055, 0],
     [2.23, 1.4, 2.33, 1.5, 0.055, 0]
   ],
   "open": [0, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 1, "x": 1.1, "z": 3.15, "r": 0.13, "vx": 0.1, "vz": -1.6},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 26, "cf": 0.004, "cs": 0.1, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 2, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* B8-three-orifices/rig.js · the BORDA paste block (two re-entrant tube walls projecting 0.11 m into the tank) */
  "B8-borda": {
   "v": 2,
   "scene": "jet",
   "segs": [
     [2.17, 1.285, 2.28, 1.285, 0.03, 255],
     [2.17, 1.435, 2.28, 1.435, 0.03, 255]
   ],
   "open": [0, 1, 1, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 0, "q": 0},
   "tailwater": {"on": 0, "level": 0},
   "source": {"on": 1, "x": 1.1, "z": 3.15, "r": 0.13, "vx": 0.1, "vz": -1.6},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 26, "cf": 0.004, "cs": 0.1, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [],
   "rakes": [],
   "ui": {"mode": 2, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* B9-three-reservoirs/rig.js · B9.build() — zB = 2.0 m. The valve is SHUT and both level controls are still off: run B9.fillAC / fillB / release to stage it */
  "B9": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [2, -0.2, 2, 4.2, 1, 255],
     [3.55, -0.2, 3.55, 4.2, 1, 255],
     [1.43, 0, 2.57, 0, 0.2, 128],
     [2.98, 0, 4.12, 0, 0.2, 128],
     [2.775, -0.2, 2.775, 1, 0.55, 128]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 0, "free": 0, "level": 3.2, "q": 0},
   "tailwater": {"on": 0, "level": 0.6},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.4, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[2.775, 0.5], [2.775, 1.08], [0.75, 0.2], [5.05, 0.2]],
   "rakes": [],
   "ui": {"mode": 0, "field": "h", "speed": 1, "channel": 0, "labels": 1, "jumps": 1, "particles": 0, "dye": 1}
  },

  /* B10-crest-vs-hgl/rig.js · B10.build({level: 3.95}) — RIG-A with a FLAT pipe (no crest yet, digit d = 5). Same mask as FR-1; students lift the crest themselves (see NOTES) */
  "B10": {
   "v": 2,
   "scene": "sandbox",
   "segs": [
     [0.6, 2.5, 7.2, 2.5, 1.1, 0],
     [0.6, 3.2, 7.2, 3.2, 1.1, 0],
     [1.5, 1, 9.3, 1, 2, 255],
     [1.5, 2.55, 9.3, 2.55, 0.3, 255],
     [1.5, 2.4, 1.5, 5.2, 0.12, 255]
   ],
   "open": [1, 1, 0, 0],
   "valveClosed": 1,
   "inflow": {"on": 1, "free": 1, "level": 3.95, "q": 0.25},
   "tailwater": {"on": 1, "level": 2.5},
   "source": {"on": 0, "x": 0.55, "z": 4.55, "r": 0.14, "vx": 1.1, "vz": -1.4},
   "wave": {"on": 0, "amp": 0, "period": 1.5, "x": 0.15},
   "hyd": {"c": 22, "cf": 0.02, "cs": 0.4, "bulk": 0.1, "ca": 0.6, "nu": 1e-05, "slip": 0, "g": 9.81},
   "dye": {"line": 0, "decay": 0.02},
   "gauges": [[3.7, 2.2], [8, 2.2]],
   "rakes": [],
   "ui": {"mode": 1, "field": "h", "speed": 1, "channel": 0, "labels": 0, "jumps": 0, "particles": 0, "dye": 1}
  }
};

/* Per-student parameters that change GEOMETRY, so no slider can express them:
   the picker can load the base rig above, but the student still draws this
   one thing. `how` is lifted from the exercise's own worksheet. */
const EXERCISE_RIG_NOTES = {
  "UN-1": {
    control: "nozzle gap g = 0.14 x (1 + (d mod 6)) metres — the verified SIX-rung ladder, 0.14-0.84 m (the flow area is quantised to ONE cell at Medium)",
    how: "Erase the scene's plate with the brush widened four `]` presses, then with the Wall tool and Shift held draw two vertical pieces at the same station: lower half from the pipe floor (z = 2.0) up to z = 3.5 - gap/2, upper half from z = 3.5 + gap/2 up to the pipe roof (z = 5.0).",
  },
  "LL-2": {
    control: "partner A's hidden fault: its station x (4.6-7.0 m) and its height (2-3 blocked cells of the 18-cell bore)",
    how: "Wall tool with the brush narrowed two or three `[` presses to about one grid cell, Shift held, one short vertical stroke starting exactly on the pipe invert (z = 2.00 m) and ending between z = 2.04 and z = 2.07 m, at any x from 4.6 to 7.0 m.",
  },
  "FB-1": {
    control: "hump height dz above the bed — raised in steps until the flow chokes",
    how: "Wall tool with the brush shrunk to about 0.04 m, Shift held, a horizontal stroke about 1 m long centred on x = 4.5 m starting from inside the bed slab (about z = 0.48) up to a low first height, e.g. z = 0.55 m.",
  },
  "QS-2": {
    control: "tank 2 width A2 = 0.50 + 0.25·d metres (the payload ships A2 = 2.00, d = 6)",
    how: "Wall tool, one vertical stroke (brush 0.10) at x = 3.60 + A2, floor to z ~ 3.2 — tank 2's far wall is the personalised dimension.",
  },
  "UN-3": {
    control: "reservoir level = 10.0 + 0.4·d metres (the payload ships 12.0, d = 5)",
    how: "Set the Reservoir level slider, then press R. Nothing is drawn — the standpipe ships built and is the same for everyone.",
  },
  "B10": {
    control: "crest soffit elevation z_c — lifted step by step until the pipe separates (the payload ships the FLAT pipe, no crest)",
    how: "Console only: B10.crest(z) redraws the whole staircase hump so its soffit sits at z, jumped first to about 0.09 m below your HGL prediction and then raised in 3-cell (0.065 m) steps, switching to 1-cell (0.0217 m) steps once the crown pressure head falls below 0.06 m.",
  },
};
