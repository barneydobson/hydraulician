"use strict";
/**
 * gl.js — tiny WebGL2 helpers (no dependencies).
 * Program compilation, float textures, framebuffers, ping-pong pairs,
 * a fullscreen-triangle draw and a bufferless POINTS draw for particles.
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
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vsSrc));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error("Program link error: " + gl.getProgramInfoLog(p));
    }
    const cache = {};                      // lazy uniform-location cache: prog.u("name")
    p.u = (name) => {
      if (!(name in cache)) cache[name] = gl.getUniformLocation(p, name);
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

  /** Ping-pong pair of textures + FBOs. read = current state, write = next. */
  function createDoubleBuffer(gl, w, h, internalFormat, format, type, data) {
    function one(d) {
      const tex = createTexture(gl, w, h, internalFormat, format, type, d, gl.NEAREST);
      const fbo = createFBO(gl, tex);
      return { tex, fbo };
    }
    return {
      a: one(data), b: one(data),
      get read() { return this.a; },
      get write() { return this.b; },
      swap() { const t = this.a; this.a = this.b; this.b = t; },
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

  /** Bind target (null = canvas) and set viewport. */
  function bindTarget(gl, fbo, w, h) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, w, h);
  }

  /** Fullscreen triangle — vertex positions generated from gl_VertexID. */
  function makeQuad(gl) {
    const vao = gl.createVertexArray();
    return {
      draw() {
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
    };
  }

  /** Two triangles from gl_VertexID — for drawing into a letterboxed rect. */
  function makeRect(gl) {
    const vao = gl.createVertexArray();
    return {
      draw() {
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
      },
    };
  }

  /** Bufferless point cloud — the VS reads positions from a texture via gl_VertexID. */
  function makePoints(gl) {
    const vao = gl.createVertexArray();
    return {
      draw(n) {
        gl.bindVertexArray(vao);
        gl.drawArrays(gl.POINTS, 0, n);
      },
    };
  }

  /** Bind textures to units 0..n-1 and set the matching sampler uniforms. */
  function bindTex(gl, prog, list) {
    for (let i = 0; i < list.length; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, list[i][1]);
      gl.uniform1i(prog.u(list[i][0]), i);
    }
  }

  return {
    createProgram, createTexture, createFBO, createFBO2, createDoubleBuffer,
    bindTarget, bindTex, makeQuad, makeRect, makePoints,
  };
})();
