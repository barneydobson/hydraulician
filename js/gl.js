"use strict";
/**
 * gl.js — tiny WebGL2 helpers (no dependencies).
 * Program compilation, float textures, framebuffers, ping-pong pairs,
 * coupled (MRT) pairs, bufferless draws (fullscreen triangle, rect, points),
 * and the one place a framebuffer is read back or a texture uploaded.
 *
 * Defines: GLH
 *
 * Reads:   none
 */
const GLH = (() => {

  function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(sh);
      const pretty = src.split("\n").map((l, i) => `${i + 1}: ${l}`).join("\n");
      throw new Error("Shader compile error:\n" + log + "\n" + pretty);
    }
    return sh;
  }

  function createProgram(gl, vsSrc, fsSrc) {
    const p = gl.createProgram();
    const vs = compile(gl, gl.VERTEX_SHADER, vsSrc), fs = compile(gl, gl.FRAGMENT_SHADER, fsSrc);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(p));
    }
    // The program keeps what it linked; the shader objects are not needed again.
    gl.detachShader(p, vs); gl.deleteShader(vs);
    gl.detachShader(p, fs); gl.deleteShader(fs);
    const warned = new Set();              // a missing name is reported once per program
    const cache = Object.create(null);     // lazy uniform-location cache: prog.u("name")
    p.u = (name) => {
      if (!(name in cache)) {
        const loc = gl.getUniformLocation(p, name);
        if (loc === null && !warned.has(name)) {
          warned.add(name);
          console.warn("uniform not found: " + name);
        }
        cache[name] = loc;
      }
      return cache[name];
    };
    return p;
  }

  function createTexture(gl, w, h, internalFormat, format, type, data, filter) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter || gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, data || null);
    return t;
  }

  function createFBO(gl, tex) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("Framebuffer incomplete: 0x" + status.toString(16));
    }
    return fb;
  }

  /** Two colour attachments, for a pass that emits a second texture. The
   *  drawBuffers call is the part that is easy to forget: without it the
   *  second output is silently discarded and everything still runs.
   *  drawBuffers state belongs to the framebuffer object, so it survives every
   *  later bindFramebuffer and the single-attachment FBOs keep their default. */
  function createFBO2(gl, texA, texB) {
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texA, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, texB, 0);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error("MRT framebuffer incomplete: 0x" + status.toString(16));
    }
    return fb;
  }

  /** Ping-pong pair of textures + FBOs. read = current state, write = next.
   *  `parity` is 0 or 1 and flips on every swap: which phase the pair is in,
   *  for whatever has to stay in step with it (see createCoupled). `prev` is
   *  `write` under the name a reader of a FINISHED step wants: after the swap
   *  the half that was just written over is the state one step ago (the
   *  particle tail reads it as "where each particle was"). */
  function createDoubleBuffer(gl, w, h, internalFormat, format, type, data) {
    function one(d) {
      const tex = createTexture(gl, w, h, internalFormat, format, type, d, gl.NEAREST);
      const fbo = createFBO(gl, tex);
      return { tex, fbo };
    }
    return {
      a: one(data), b: one(data), parity: 0,
      get read() { return this.a; },
      get write() { return this.b; },
      get prev() { return this.b; },
      swap() { const t = this.a; this.a = this.b; this.b = t; this.parity ^= 1; },
      /** Hand both halves back to the driver. A rebuild allocates a whole new
       *  pair, so the outgoing one has to be released or the driver keeps it
       *  for ever — see SIM.build's `release`. */
      dispose() {
        for (const s of [this.a, this.b]) {
          if (!s) continue;
          gl.deleteFramebuffer(s.fbo);
          gl.deleteTexture(s.tex);
        }
        this.a = null; this.b = null;
      },
    };
  }

  /** Two double buffers that a single MRT pass writes together (the vof pass:
   *  f on attachment 0, the transport accumulator on 1), and have to stay in
   *  the same phase. One framebuffer per phase, each attaching the two WRITE
   *  halves of that phase; `fbo()` picks by `dbA.parity`, and `swap()`
   *  flips both buffers, so the pair cannot drift apart.
   *
   *  Why not select on `dbA.write === dbA.b`: the `write` getter simply
   *  returns `b`, so that is a tautology, and a wrong selector keeps picking
   *  the same framebuffer and writes the two outputs into mismatched textures
   *  once the buffers have flipped. Parity is the honest test, and the pair may
   *  be created in ANY phase (the second buffer is fresh, the first may be
   *  mid-run): framebuffer [dbA.parity] attaches the write halves as they are
   *  now, the other framebuffer the halves that become write after one swap. */
  function createCoupled(gl, dbA, dbB) {
    const now = dbA.parity;
    const fbos = [null, null];
    fbos[now] = createFBO2(gl, dbA.b.tex, dbB.b.tex);
    fbos[now ^ 1] = createFBO2(gl, dbA.a.tex, dbB.a.tex);
    return {
      fbos,
      fbo() { return fbos[dbA.parity]; },
      swap() { dbA.swap(); dbB.swap(); },
      /** The framebuffers only: the buffers' textures belong to dbA / dbB. */
      dispose() {
        for (const f of fbos) if (f) gl.deleteFramebuffer(f);
        fbos[0] = fbos[1] = null;
      },
    };
  }

  /** Bind target (null = canvas) and set viewport. */
  function bindTarget(gl, fbo, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
  }

  /** A bufferless draw: the vertex shader makes its positions from
   *  gl_VertexID, so there is only an (empty) VAO to bind. `count` vertices
   *  by default; `draw(n)` overrides it (a point cloud's size changes).
   *    makeDraw(gl, gl.TRIANGLES, 3)   fullscreen triangle
   *    makeDraw(gl, gl.TRIANGLES, 6)   two triangles, for a letterboxed rect
   *    makeDraw(gl, gl.POINTS, 0)      particles: the VS reads a texture */
  function makeDraw(gl, mode, count) {
    const vao = gl.createVertexArray();
    return {
      draw(n) {
        gl.bindVertexArray(vao);
        gl.drawArrays(mode, 0, n === undefined ? count : n);
      },
    };
  }

  /** Bind textures to consecutive units from `firstUnit` (default 0) and set
   *  the matching sampler uniforms. Units are assigned by POSITION in the
   *  list, and unit state is global to the context, not per program: a pass
   *  that binds another texture to unit 0 in between leaves this program's
   *  `u_X` (which still names unit 0) reading the wrong texture. So a program
   *  drawn again after another one used the same units must be re-bound — the
   *  particle heads are (see render). `firstUnit` lets a caller keep a texture
   *  it has already bound on a low unit instead of rebinding it. */
  function bindTex(gl, prog, list, firstUnit = 0) {
    for (let i = 0; i < list.length; i++) {
      const unit = firstUnit + i;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, list[i][1]);
      gl.uniform1i(prog.u(list[i][0]), unit);
    }
  }

  /** Read a rectangle of `fbo`'s first colour attachment into `buf` (RGBA,
   *  FLOAT unless `type` says otherwise), then unbind: the one readback path,
   *  so no caller leaves a framebuffer bound for the next draw to inherit. */
  function read(gl, fbo, x, y, w, h, buf, format, type) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.readPixels(x, y, w, h, format || gl.RGBA, type || gl.FLOAT, buf);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Overwrite a whole texture of size w x h with `data`. texSubImage2D, not
   *  texImage2D: the texture may be a framebuffer attachment, and sub-image
   *  keeps the storage (and so the attachment) exactly as it is — respecifying
   *  with the same size is allowed to keep it too, but nothing here relies on
   *  that. `align` is UNPACK_ALIGNMENT for the rows of `data` (1 for tightly
   *  packed bytes, 4 for floats); it is restored to the default 4 afterwards. */
  function upload(gl, tex, w, h, format, type, data, align) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, align || 4);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, format, type, data);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
  }

  return {
    createProgram, createTexture, createFBO, createFBO2, createDoubleBuffer,
    createCoupled, bindTarget, bindTex, makeDraw, read, upload,
  };
})();
