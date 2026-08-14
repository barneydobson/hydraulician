# LEAKFIX — P12: `SIM.build` leaked GPU textures/FBOs on every rebuild

Scope: **resource management only.** No physics, numerics, texture format, pass
logic or size changed. Files touched: `js/sim.js`, `js/gl.js` (nothing else —
`js/overlay.js`, `js/main.js`, `index.html` are another worker's territory).
Verified with `exercises/_runner/runner.py --id LEAKFIX` on
ANGLE / NVIDIA RTX 2060, visible Chrome, hardware GL.

---

## 1 · Root cause — found, then measured

Every GL object in the project is allocated in `SIM`: the six programs and the
three VAOs once in `SIM.init` (`js/sim.js:31–36`, fine), **everything else on
every single `SIM.build` call**:

| site (pre-fix line) | object | textures | FBOs |
|---|---|---|---|
| `js/sim.js:148` | `S.U = GLH.createDoubleBuffer(nx,ny,RGBA32F)` | 2 | 2 |
| `js/sim.js:149` | `S.F = GLH.createDoubleBuffer(nx,ny,RGBA32F)` | 2 | 2 |
| `js/sim.js:150` | `S.solid = GLH.createTexture(nx,ny,R8)` | 1 | — |
| `js/sim.js:151` | `S.colTex = GLH.createTexture(nx,1,RGBA32F)` | 1 | — |
| `js/sim.js:152` | `S.colFbo = GLH.createFBO(S.colTex)` | — | 1 |
| `js/sim.js:163` | `S.P = GLH.createDoubleBuffer(128,128,RGBA32F)` | 2 | 2 |
| | **per build** | **8** | **7** |

`js/sim.js:139` (`S = { … }`) replaced the module-level grid wholesale, so the
outgoing grid's handles became unreachable from JS — and **nothing in the
codebase ever called `deleteTexture` / `deleteFramebuffer`** (`grep` over `js/`
returned zero hits pre-fix). JS unreachability does not free a GL object: the
driver keeps every one of them until the context dies. `GLH.createDoubleBuffer`
(`js/gl.js:61`) likewise had no counterpart to `one()`.

The four `nx×ny` RGBA32F buffers are what makes it bite: on **m2 at Ultra
(3434 × 204 = 700 536 cells)** they are 11.2 MB each, so **≈ 45 MB of VRAM was
stranded per rebuild** — and `set` on the Resolution control is one rebuild per
flick (`js/main.js:312`). That is DA-3's `Framebuffer incomplete: 0x8cdd` on the
second large build under concurrent load, and B8's repeat of it.

### Pre-fix baseline (m2, counters wrapped around `gl.create*/delete*`)

| what | builds | textures created | deleted | FBOs created | deleted | live tex / FBO |
|---|---|---|---|---|---|---|
| 3 cycles Low/Medium/High | 9 | 72 | **0** | 63 | **0** | 72 / 63 |
| + 6 cycles Very high/Ultra | +12 | 168 | **0** | 147 | **0** | 168 / 147 |

Exactly 8 textures + 7 FBOs per build, **zero** deletions, live count rising
linearly (24 tex / 21 FBO per 3-build cycle — flat growth per build, unbounded
in total). The 12 large builds alone stranded ≈ 400 MB. On this idle 6 GB card
it did not throw; the mechanism DA-3 hit is the same one, just with a
concurrent worker's allocations sharing the ceiling.

## 2 · The fix

Matches DA-3's own proposal and the existing structure (allocation stays in
`SIM`, the double-buffer owns its own pair):

- **`js/gl.js:75`** — `createDoubleBuffer` gains `dispose()`: deletes both
  halves' FBO and texture, nulls `a`/`b`. It already closes over `gl`.
- **`js/sim.js:114`** — new `release(g)`: `dispose()`s `g.U`/`g.F`/`g.P`, deletes
  `g.colFbo`, `g.solid`, `g.colTex`, and nulls the fields so a stale reference
  fails loudly instead of drawing from a deleted handle. Guarded with
  `if (!g || g === S) return` so the live grid can never be freed.
- **`js/sim.js:158,166`** — `build` captures `const old = S` *after* it has
  copied `segs` and the live parameter block `p` across, then calls
  `release(old)` immediately before allocating the new set (free-then-allocate
  keeps peak VRAM at one grid, not two).

**Documented behaviour preserved:** `release` touches GL handles only. `segs`
and `S.p` are plain JS objects, already copied into the new grid by the existing
code above the `release` call — confirmed live (`segs.length` 3 → 3 across four
rebuilds, boundary/valve params intact, §5). `resetWater` on rebuild is
unchanged and still resets the water to the scene's own initial field.

## 3 · Soak — allocation flat across cycles

| soak | rebuilds | tex created / deleted | FBO created / deleted | live at every cycle boundary | thrown | `gl.getError()` | console errors |
|---|---|---|---|---|---|---|---|
| **m2**, 25 × (Low→Medium→High→Very high→Ultra) | **125** (25 at Ultra 3434×204) | 1000 / 1000 | 875 / 875 | **0 / 0** ×25 | none | 0 after all 125 | — |
| **h23**, 10 × same sweep + return to Medium | **51** | 408 / 408 | 357 / 357 | **0 / 0** ×10 | none | 0 after all 51 | **none** (`onerror`, `unhandledrejection`, `console.error/warn` all captured) |

408 = 51 × 8 and 357 = 51 × 7 exactly, matched one-for-one by the deletions —
i.e. the per-rebuild allocation is unchanged (this is not a "reuse" fix), and
**the live handle count is flat at zero net growth instead of +8/+7 per build.**
The m2 soak's 125 rebuilds took 4.0 s wall. 190 rebuilds were exercised
post-fix across the session; every one balanced.

**Still runs after the soak:** m2 back at Medium ran **19 011 substeps/s**
(HOWTO's 1-instance band is 18 400–20 300 — no degradation). h23 advanced
5 sim-s after its 51 rebuilds: mean depth 0.336 m over the middle 40 % of the
reach; mid-depth probes read `f` = 1.0034 / 1.0061 / 1.0078 / 1.0043 with
`u` = 2.85 → 2.28 → 1.89 → 0.94 m/s through the jump; no NaN, no dry columns.

## 4 · Physics regression gate

### h23 at defaults, jump box (`q` = 0.5, Medium 667×142)

| run | protocol | Fr₁ | y₁ | y₂ | y₂ᵖ (Bélanger) |
|---|---|---|---|---|---|
| **after 9 rebuild cycles** | HOWTO: pump 25 s, warm `analyse` ×15 | **2.36** | 0.157 | **0.427** | 0.450 (−5.1 %) |
| clean control, **0 rebuilds** | identical | 1.67 | 0.221 | 0.484 | 0.423 |
| **after 9 rebuild cycles** | median of 30 reads over 15 sim-s (t 40→55) | **1.886** | 0.199 | **0.4603** | 0.433 |
| clean control, **0 rebuilds** | identical | 2.012 | 0.190 | 0.4555 | 0.447 |

Gate band Fr₁ 1.7–2.4, y₂ 0.40–0.45: the churned run at the documented protocol
is **inside both** (2.36 / 0.427) and is the closer of the two to CLAUDE.md's
verified 2.24 / 0.416. The clean control at the same protocol reads y₂ = 0.484,
i.e. **the frame-to-frame spread between two rebuild-free runs is wider than any
rebuild effect** — h23's documented 12 % flutter (HJ-1: "median of a window,
never one frame"). On the 15 s medians, churned and control agree to 6 % on Fr₁
and **1 % on y₂**, with identical spreads (y₂ range 0.393–0.562 churned,
0.394–0.551 control); both sit ≈ 0.46 at that later window, so the excursion
above 0.45 there is the scene, not the fix.

### m2 at defaults after the 125-rebuild soak (Medium 1265×75, q_in = 0.25)

| t (sim-s) | q mean (15–85 % of reach) | q median | mean depth | domain volume |
|---|---|---|---|---|
| 90.4 | 0.2547 | 0.2562 | 0.3163 | 4.54688 |
| 100.9 | 0.2601 | 0.2617 | 0.3193 | 4.60798 |
| 111.4 | 0.2604 | 0.2606 | 0.3181 | 4.60266 |
| 121.7 | 0.2615 | 0.2637 | 0.3211 | 4.61065 |

q out 0.255–0.262 against 0.251 in (CLAUDE.md's band 0.215–0.261). Volume from
t = 101 → 122: **+0.058 % total, +0.003 %/s** — steady. (The first window's
+1.3 % is the tail of m2's measured 85 s spin-up, not drift: the rebuild resets
`t` to 0.)

## 5 · Mid-session rebuild integrity (drawn rig)

Sandbox + three drawn segments (tank floor `y` = 1.0 from `x` = 3.0→6.0, two
side walls to `y` = 2.6, `th` = 0.18) with the spout moved over the tank:

| stage | budget | grid | segs | tank mean depth | domain volume | wall / floor / interior cell |
|---|---|---|---|---|---|---|
| drawn | Medium | 414×230 | 3 | 0 | 0 | 255 / 255 / 0 |
| fill 10 sim-s | Medium | 414×230 | 3 | **0.3370** | **1.1548** | 255 / 255 / 0 |
| after High→Very high→Low→Medium (4 rebuilds) | Medium | 414×230 | 3 | 0 (water reset) | 0 | 255 / 255 / 0 |
| re-fill the same 10 sim-s | Medium | 414×230 | 3 | **0.3370** | **1.1548** | 255 / 255 / 0 |
| spout off, +8 s | Medium | 414×230 | 3 | 0.4356 | 1.2493 | 255 / 255 / 0 |
| spout off, +16 s → +36 s | Medium | 414×230 | 3 | 0.4440 | 1.2719 → 1.2719 → 1.2719 → 1.2754 | 255 / 255 / 0 |

Two things worth quoting. The rig **re-rasterises correctly**: all three segments
survive, wall and floor cells are solid and the interior open at the rebuilt
grid, and the tank **holds** — with the spout shut the volume is flat to
+0.27 % over 20 further sim-s (three consecutive reads bit-identical at 1.2719),
so nothing leaks through the re-rasterised walls. And the same 10 s fill before
and after four rebuilds at three different resolutions gives **bit-identical**
depth (0.3370) and volume (1.1548) — the tightest available proof that rebuilds
still produce identical physics. (Water resetting on a resolution change is the
pre-existing `resetWater` contract, unchanged here.)

## 6 · Notes / limits

- The counters used above were injected **at run time** by wrapping
  `gl.createTexture/deleteTexture/createFramebuffer/deleteFramebuffer` on the
  live context from the runner — no instrumentation was added to the source.
- Not attempted: reusing textures when `nx`/`ny` are unchanged. Every rebuild in
  practice changes the grid, and reuse would have meant touching the allocation
  sizes, which is out of scope.
- No teardown hook exists for a page unload; not needed (context loss frees
  everything) and out of scope.
- DA-3's `Framebuffer incomplete: 0x8cdd` was not reproducible on this idle
  card even at 168 leaked handles / ≈ 400 MB pre-fix — it needed their shared-GPU
  load. The leak itself is fully reproduced and quantified above, which is the
  part the fix addresses.
- DA-3's workaround note ("reload the page between resolution flips beyond the
  scripted two") and B8's runner-relaunch note can be retired, but their
  worksheets were **not** edited (demo folders untouched, per brief).
