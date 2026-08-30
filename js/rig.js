"use strict";
/**
 * rig.js - RIG: save, load and share a drawn rig.
 *
 * Split out of js/main.js; the block below moved verbatim, and it documents the
 * wire format, what a rig deliberately does NOT store, and the version gate.
 * Read the note on `V` before adding a key to the format.
 *
 * It reaches back into main.js for CONFIG, state, sim, loadScene, placeCV,
 * placeFlux, seedTracers, showToast, syncPanel, CV_NEXT and GINSP -- all from
 * inside functions.
 */

// ------------------------------------------------------- rig save / share
/** A drawn rig is a segment list plus the panel settings that make it work.
 *  Both are plain CPU-side state, so a rig can be written out as JSON and
 *  read back at any resolution or window size — the solver is never touched.
 *
 *  Two things make that true and they are worth stating:
 *
 *  - **Segments are physical**, `[x0,z0,x1,z1,thickness,kind]` in metres, and
 *    `SIM.rasterise()` re-stamps them into whatever grid is current. So a rig
 *    saved at Medium loads sealed at Low or High; the cell COUNT of a gap
 *    changes (it always does — see UN-1's quantised nozzle), the geometry
 *    does not.
 *  - **The domain is a fixed physical rectangle**, so the window size only
 *    moves the letterbox. Nothing about the view is stored, and a rig opened
 *    on a phone frames the same metres as one opened on a projector.
 *
 *  Transient water state is deliberately NOT stored. A rig is a rig, not a
 *  snapshot: applying one ends with `SIM.resetWater()` — the R key — so the
 *  scene's initial water lands on the NEW geometry and the scene's spin-up
 *  countdown runs from t = 0 against the rig you just loaded. Storing a
 *  velocity/fill field would be megabytes and would still need the same
 *  settle time to mean anything.
 *
 *  Wire format: `#rig=<tag><base64url>` where the tag is one character —
 *  `A` = plain UTF-8 JSON, `B` = raw-deflate JSON (CompressionStream, no
 *  dependency; falls back to `A` where it is missing). Deflate is worth it:
 *  a 35-stroke staircase rig is 4.4 kB of JSON and mostly repeated digits. */
const RIG = (() => {
  /** Format version. The standing rule (AGENTS.md) is that a key change bumps
   *  this and old links simply break — no back-compat, it is a prototype.
   *
   *  `flux` and `ui.cvShow` were ADDED at v2 without a bump, deliberately, and
   *  the reasoning should be checked before the next person adds a key:
   *
   *  - The rule exists so a RENAMED or REDEFINED key cannot silently misload
   *    (v2 renamed source y→z and the gauge fields head→h). Neither hazard
   *    applies to a purely additive optional key: an old rig without `flux`
   *    reads as no sections, and an old BUILD handed a rig with `flux` ignores
   *    a key it does not know. Both directions degrade to the truth.
   *  - Bumping would reject all 26 payloads in js/exercises-rigs.js, which are
   *    v2 captures, and every drawn-rig exercise would fall back to "draw it
   *    from the README". Re-capturing them needs the CDP runner, which is
   *    Linux-bound. The cost is the whole teaching pack; the benefit is zero.
   *
   *  So: RENAME or REDEFINE a key and you must bump. ADD an optional one that
   *  reads correctly when absent, and you need not.
   *
   *  The trailing comment is load-bearing: check_notation.py greps for exactly
   *  `const V = <n>;  // format version` and cross-checks <n> against the
   *  payloads in js/exercises-rigs.js. That gate is what would catch a bump
   *  made without re-capturing them. */
  const V = 2;  // format version
  /** Micrometres. Not cosmetic: B10's staircase snaps its step boundaries to
   *  cell centres on purpose (a boundary landing exactly on one is claimed by
   *  both neighbouring steps and pinches the bore a whole step deep), and at
   *  Ultra Δx is ~2.6 mm — so the stored coordinate has to sit far closer to
   *  the drawn one than any rasterisation decision. 1 µm is 0.04% of the
   *  finest cell, and JSON.stringify still prints 1.5 as "1.5". */
  const r4 = (v) => Math.round((+v || 0) * 1e6) / 1e6;
  const b01 = (v) => (v > 0.5 ? 1 : 0);
  let note = "", msg = "", ui = null;

  // ------------------------------------------------------------- snapshot
  /** Everything needed to rebuild the current rig, and nothing else. */
  function snapshot() {
    const p = sim.p, sc = state.scene;
    const inflow = { on: b01(p.inflow.on), free: b01(p.inflow.free),
                     level: r4(p.inflow.level), q: r4(p.inflow.q) };
    if (p.inflow.v !== undefined) inflow.v = r4(p.inflow.v);
    const o = {
      v: V,
      scene: sc.id,
      segs: (sim.segs || []).map((s) =>
        [r4(s[0]), r4(s[1]), r4(s[2]), r4(s[3]), r4(s[4]), s[5] | 0]),
      open: p.open.map((k) => k | 0),
      valveClosed: b01(p.valveClosed),
      inflow,
      tailwater: { on: b01(p.tailwater.on), level: r4(p.tailwater.level) },
      // Wire keys follow the display notation (z vertical, vz its velocity);
      // and match the runtime fields since the code-wide z/w rename.
      source: { on: b01(p.source.on), x: r4(p.source.x), z: r4(p.source.z),
                r: r4(p.source.r), vx: r4(p.source.vx), vz: r4(p.source.vz) },
      wave: { on: b01(p.wave.on), amp: r4(p.wave.amp),
              period: r4(p.wave.period), x: r4(p.wave.x) },
      hyd: { c: r4(p.c), cf: r4(p.cf), cs: r4(p.cs), bulk: r4(p.bulk),
             ca: r4(p.ca), nu: r4(p.nu), slip: b01(p.slip), g: r4(p.g) },
      dye: { line: r4(p.dyeLine), decay: r4(p.dyeDecay) },
      gauges: state.gauges.map((g) => [r4(g.x), r4(g.z)]),
      rakes: state.rakes.map((k) => r4(k.x)),
      // Sections belong here for exactly the reason the control volume does:
      // they are PLACED, they survive until something clears them, and where
      // you put them is the measurement. What they accumulate (the EMA, t0) is
      // not stored — that is water state, and a rig carries none of it.
      flux: state.flux.map((L) => [r4(L.x0), r4(L.z0), r4(L.x1), r4(L.z1)]),
      ui: { mode: state.mode | 0, field: state.gaugeField, speed: r4(state.speed),
            // Which per-edge quantity the box and the sections label — the Q /
            // M / E the B key cycles. Travels with them or the rig arrives
            // reading something other than what it was shared showing.
            cvShow: state.cvShow,
            channel: b01(state.channel), labels: b01(state.labels),
            jumps: b01(state.jumps), particles: b01(state.particles),
            dye: b01(state.dye) },
    };
    if (state.tracers) o.tracers = [r4(state.tracers.x), state.tracerN | 0,
                                    r4(state.tracers.trail)];
    if (state.cv) o.cv = [r4(state.cv.x0), r4(state.cv.z0), r4(state.cv.x1), r4(state.cv.z1)];
    return o;
  }

  /** Version gate. Exactly the current format loads — this is a prototype
   *  and old wire formats are NOT migrated (v2 renamed source y→z, vy→vz and
   *  the gauge field keys head→h, depth→d; a v1 link is simply stale).
   *  Wire keys and runtime keys agree since the code-wide z/w rename, so
   *  there is nothing to map — only the version to check. */
  function migrate(o) {
    if (!o || typeof o !== "object" || !Array.isArray(o.segs)) {
      throw new Error("not a hydraulician rig");
    }
    if ((o.v | 0) !== V) {
      throw new Error("rig format v" + (o.v | 0) + " — this build reads v" + V +
                      " only (prototype, no back-compat); re-save the rig");
    }
    return o;
  }

  // ---------------------------------------------------------------- apply
  /** Replace the current rig with `obj`. Returns a short summary string.
   *
   *  The drawn segments are REPLACED, not merged — the loaded strokes become
   *  the undo stack, so Z pops the last loaded stroke exactly as if you had
   *  drawn them yourself, and C clears them. */
  function apply(obj) {
    const o = migrate(obj);
    const id = SCENES.byId[o.scene] ? o.scene : "sandbox";
    const swapped = id !== o.scene;
    loadScene(id, false);                    // fresh grid, fresh params, no drawing
    const p = sim.p;

    sim.segs.length = 0;
    o.segs.forEach((s) => sim.segs.push([+s[0], +s[1], +s[2], +s[3], +s[4], s[5] | 0]));

    if (Array.isArray(o.open)) for (let k = 0; k < 4; k++) p.open[k] = o.open[k] | 0;
    p.autoL = 0; p.autoR = 0;                // the rig owns its edges outright
    // Through SIM.setValve, not p.valveClosed: the flag is part of the solid
    // set, so it carries the averaging reset (js/sim.js, docs/averaging.md §9).
    if (o.valveClosed !== undefined) SIM.setValve(b01(o.valveClosed));
    // Merge onto the scene's own objects: a key the rig does not carry (a
    // scene that pins an inlet velocity, say) keeps the scene's value.
    ["inflow", "tailwater", "source", "wave"].forEach((k) => {
      if (o[k]) Object.assign(p[k], o[k]);
    });
    if (o.hyd) {
      ["c", "cf", "cs", "bulk", "ca", "nu", "slip", "g"].forEach((k) => {
        if (o.hyd[k] !== undefined) p[k] = +o.hyd[k];
      });
    }
    if (o.dye) {
      if (o.dye.line !== undefined) p.dyeLine = +o.dye.line;
      if (o.dye.decay !== undefined) p.dyeDecay = +o.dye.decay;
    }
    p.pour = null;
    SIM.rasterise();                         // one stamp for the whole rig

    // ---- instruments. Same objects the Gauge / Rake tools push.
    GINSP.closeAll();
    state.gauges.length = 0;
    (o.gauges || []).slice(0, 4).forEach((g) => {
      state.gauges.push( { x: +g[0], z: +g[1], hist: [], log: [], id: ++state.gaugeSeq,
                          colour: CONFIG.gaugeColours[state.gauges.length % 4] });
    });
    state.rakes.length = 0;
    (o.rakes || []).slice(0, 2).forEach((x) => state.rakes.push({ x: +x, buf: null }));
    state.cv = null;
    if (Array.isArray(o.cv) && o.cv.length === 4) placeCV(+o.cv[0], +o.cv[1], +o.cv[2], +o.cv[3]);
    // loadScene above has already emptied state.flux; placeFlux re-seeds each
    // section with a null EMA, so they start accumulating against the geometry
    // that just loaded rather than carrying a previous rig's smoothing in.
    (o.flux || []).slice(0, 4).forEach((L) => {
      if (Array.isArray(L) && L.length === 4) placeFlux(+L[0], +L[1], +L[2], +L[3]);
    });
    state.gaugeT = -1;

    const U = o.ui || {};
    if (U.mode !== undefined) state.mode = U.mode | 0;
    if (U.field) state.gaugeField = U.field;
    if (U.cvShow && CV_NEXT[U.cvShow]) state.cvShow = U.cvShow;
    if (U.speed !== undefined) state.speed = +U.speed;
    ["channel", "labels", "jumps", "particles", "dye"].forEach((k) => {
      if (U[k] !== undefined) state[k] = !!(+U[k]);
    });

    SIM.resetWater();                        // R — a clean start on the new bed
    state.deliv = null;
    if (o.tracers) { state.tracerN = o.tracers[1] || state.tracerN; seedTracers(+o.tracers[0]);
                     if (state.tracers && o.tracers[2]) state.tracers.trail = +o.tracers[2]; }
    syncPanel();

    const n = sim.segs.length;
    note = "rig loaded: " + n + " segment" + (n === 1 ? "" : "s") +
           (state.gauges.length ? " · " + state.gauges.length + " gauge" +
             (state.gauges.length === 1 ? "" : "s") : "") +
           (state.rakes.length ? " · " + state.rakes.length + " rake" +
             (state.rakes.length === 1 ? "" : "s") : "") +
           (state.cv ? " · control volume" : "") +
           (state.flux.length ? " · " + state.flux.length + " section" +
             (state.flux.length === 1 ? "" : "s") : "") +
           " · scene " + id + (swapped ? " (unknown scene “" + o.scene + "”)" : "");
    return note;
  }

  // ------------------------------------------------------------- transport
  /** Compact for a link; for a FILE, one line per top-level key and one line
   *  per drawn segment. A rig file is meant to be read and hand-edited — the
   *  default pretty-printer puts every coordinate on a line of its own, which
   *  turns a five-stroke rig into eighty lines of digits. */
  function toText(obj, pretty) {
    const o = obj || snapshot();
    if (!pretty) return JSON.stringify(o);
    const parts = Object.keys(o).map((k) => {
      if (k === "segs") {
        return ' "segs": [\n' + o.segs.map((s) => "  " + JSON.stringify(s)).join(",\n") + "\n ]";
      }
      return " " + JSON.stringify(k) + ": " + JSON.stringify(o[k]);
    });
    return "{\n" + parts.join(",\n") + "\n}\n";
  }

  function b64url(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function unb64url(str) {
    const s = str.replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(s + "===".slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  const utf8 = (s) => new TextEncoder().encode(s);
  const unutf8 = (b) => new TextDecoder().decode(b);

  /** Raw deflate through the platform's own streams — no dependency, and the
   *  fallback below means a browser without it still shares, just longer. */
  function zip(bytes, dir) {
    const C = dir === "d" ? self.DecompressionStream : self.CompressionStream;
    if (!C) return Promise.reject(new Error("no CompressionStream"));
    const st = new C("deflate-raw");
    const w = st.writable.getWriter();
    w.write(bytes); w.close();
    const rd = st.readable.getReader(), parts = [];
    const pump = () => rd.read().then((r) => {
      if (r.done) {
        let n = 0; parts.forEach((c) => n += c.length);
        const out = new Uint8Array(n); let k = 0;
        parts.forEach((c) => { out.set(c, k); k += c.length; });
        return out;
      }
      parts.push(r.value); return pump();
    });
    return pump();
  }

  /** Always-available encoder: plain base64url JSON. */
  function encodeSync(o) { return "A" + b64url(utf8(toText(o))); }
  /** Preferred encoder: deflate when the platform has it. */
  function encode(o) {
    const t = toText(o);
    return zip(utf8(t), "c").then((b) => "B" + b64url(b)).catch(() => "A" + b64url(utf8(t)));
  }
  function decode(code) {
    const s = String(code || "").trim(), tag = s.charAt(0), body = s.slice(1);
    if (tag === "A") return Promise.resolve(JSON.parse(unutf8(unb64url(body))));
    if (tag === "B") return zip(unb64url(body), "d").then((b) => JSON.parse(unutf8(b)));
    // Tolerate a hand-trimmed code with the tag lost.
    return Promise.resolve(JSON.parse(unutf8(unb64url(s))));
  }

  const baseUrl = () => location.href.split("#")[0];
  function link(o) { return encode(o).then((c) => baseUrl() + "#rig=" + c); }
  function hashCode() {
    const m = /(?:^|[#&])rig=([^&\s]+)/.exec(location.hash || "");
    return m ? decodeURIComponent(m[1]) : null;
  }

  // -------------------------------------------------------------- loading
  /** Accept anything a student might paste: a full share URL, a bare code, or
   *  the exported JSON. */
  function parseAny(txt) {
    const t = String(txt == null ? "" : txt).trim();
    if (!t) throw new Error("nothing to load — paste a rig link or its JSON");
    const m = /rig=([A-Za-z0-9_\-%]+)/.exec(t);
    if (m) return decode(decodeURIComponent(m[1]));
    if (t.charAt(0) === "{") return JSON.parse(t);
    return decode(t);
  }
  /** The one entry point every load path goes through. Returns a promise so
   *  the deflate branch can be awaited; resolves to the status line. */
  function load(txt) {
    return Promise.resolve()
      .then(() => parseAny(txt))
      .then((o) => {
        const s = apply(o);
        flash("loaded"); showToast("Rig loaded", s.replace(/^rig loaded: /, ""));
        return s;
      })
      .catch((err) => {
        note = "rig NOT loaded — " + (err && err.message || err);
        flash("failed"); showToast("Could not load that rig", String(err && err.message || err));
        syncPanel();
        throw err;
      });
  }

  // ------------------------------------------------------------------- UI
  function el(sel) { return ui ? ui.querySelector(sel) : null; }
  function flash(m) { msg = m || ""; syncPanel(); }
  function box(text) { const t = el(".rigtx"); if (t) { t.value = text; t.scrollTop = 0; } }

  function share() {
    return link().then((url) => {
      box(url);
      try { history.replaceState(null, "", url); } catch (_) { /* file:// may refuse */ }
      const done = (how) => { note = "share link ready · " + url.length + " characters";
                              flash(how); return url; };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(url)
          .then(() => done("copied to the clipboard"))
          .catch(() => done("clipboard blocked — copy it from the box"));
      }
      const t = el(".rigtx");
      if (t) { t.focus(); t.select(); }
      return done("select-all done — press ⌘/Ctrl-C");
    });
  }

  function exportJSON() {
    const o = snapshot(), text = toText(o, true);
    const name = "hydraulician-rig-" + o.scene + "-" + o.segs.length + "seg.json";
    try {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      note = "exported " + name + " · " + text.length + " characters";
      flash("saved");
    } catch (err) {
      // A blocked download must never lose the rig: it goes in the box.
      box(text);
      note = "download blocked — the JSON is in the box, copy it out";
      flash("blocked");
    }
    return { name, text };
  }

  function buildUI(host) {
    ui = host;
    host.innerHTML =
      '<div class="rigrow">' +
        '<button data-a="share" title="Copy a link that rebuilds this rig">⇪ Share link</button>' +
        '<button data-a="json" title="Download the rig as a .json file">⤓ Export JSON</button>' +
      '</div>' +
      '<textarea class="rigtx" spellcheck="false" placeholder="Share puts the link here to copy — ' +
        'or paste a rig link (or its JSON) and press Load."></textarea>' +
      '<div class="rigrow">' +
        '<button data-a="load" title="Rebuild the rig in the box above">⇧ Load box</button>' +
        '<label class="rigfile" title="Open a .json rig file">⇧ Open file' +
          '<input type="file" accept=".json,.txt,application/json" hidden></label>' +
        '<span class="rigmsg"></span></div>';
    host.querySelectorAll("button").forEach((b) => {
      b.onclick = () => {
        b.blur();
        const a = b.dataset.a;
        if (a === "share") share();
        else if (a === "json") exportJSON();
        else if (a === "load") load(el(".rigtx").value).catch(() => {});
      };
    });
    const f = host.querySelector('input[type="file"]');
    f.onchange = () => {
      const file = f.files && f.files[0];
      f.value = "";
      if (!file) return;
      const rd = new FileReader();
      rd.onload = () => load(rd.result).catch(() => {});
      rd.onerror = () => { note = "could not read that file"; flash("failed"); };
      rd.readAsText(file);
    };
    syncUI();
  }

  /** The one-line status under the row: what just happened, or what is here. */
  function statusLine() {
    if (note) return note;
    const n = sim && sim.segs ? sim.segs.length : 0;
    return n || state.gauges.length
      ? n + " segment" + (n === 1 ? "" : "s") + " · " + state.gauges.length + " gauge" +
        (state.gauges.length === 1 ? "" : "s") + " drawn on " + state.scene.id
      : "nothing drawn yet — Share still captures the panel settings";
  }
  function syncUI() { const m = el(".rigmsg"); if (m) m.textContent = msg; }

  return { snapshot, apply, toText, encode, encodeSync, decode, link, load,
           hashCode, share, exportJSON, buildUI, syncUI, statusLine,
           get note() { return note; } };
})();

