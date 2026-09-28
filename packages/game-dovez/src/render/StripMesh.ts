import {
  Buffer,
  BufferUsage,
  GlProgram,
  Geometry,
  Mesh,
  Shader,
  Texture,
  UniformGroup,
  type TextureSource,
} from "pixi.js";
import type { Strip } from "../sim/envDraw";

/**
 * Dreiecksstreifen mit eigener Farbe je Vertex (D3D-TL-Vertizes) als
 * Pixi-Mesh mit eigenem Shader: Pixi färbt Sprites und Meshes nur als
 * Ganzes, Sternschweife, Wasseroberfläche und Verzerrungsgitter brauchen
 * aber Verläufe. Texturkoordinaten kommen relativ zum Bild (0…1) und
 * werden im Shader auf den Atlas-Ausschnitt abgebildet, mit `wrap` wie
 * `D3DTADDRESS_WRAP` (Rauschen).
 */

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
in vec4 aColor;
out vec2 vUV;
out vec4 vColor;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
  vColor = aColor;
}
`;

const FRAGMENT = `
in vec2 vUV;
in vec4 vColor;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uFrame;
uniform float uWrap;
void main() {
  vec2 uv = uWrap > 0.5 ? fract(vUV) : vUV;
  vec4 t = texture(uTexture, uFrame.xy + uv * uFrame.zw);
  finalColor = t * vec4(vColor.rgb * vColor.a, vColor.a);
}
`;

let program: GlProgram | undefined;

/** Eine Textur mit Ausschnitt (normiert) für Streifen. */
export interface StripTexture {
  readonly id: string;
  readonly texture: Texture;
  readonly frame: readonly [number, number, number, number];
  readonly wrap: boolean;
}

const clamp01 = (v: number) => (v <= 0 ? 0 : v >= 1 ? 1 : v);

export class StripMesh {
  readonly mesh: Mesh<Geometry, Shader>;
  private readonly pos: Buffer;
  private readonly uv: Buffer;
  private readonly color: Buffer;
  private readonly index: Buffer;
  private readonly uniforms: UniformGroup<{
    uFrame: { value: Float32Array; type: "vec4<f32>" };
    uWrap: { value: number; type: "f32" };
  }>;
  private posData = new Float32Array(64);
  private uvData = new Float32Array(64);
  private colorData = new Float32Array(128);
  private indexData = new Uint32Array(96);
  private vertices = 0;
  private indices = 0;

  constructor() {
    program ??= GlProgram.from({ vertex: VERTEX, fragment: FRAGMENT, name: "dovez-strip" });
    const usage = BufferUsage.VERTEX | BufferUsage.COPY_DST;
    this.pos = new Buffer({ data: this.posData, usage });
    this.uv = new Buffer({ data: this.uvData, usage });
    this.color = new Buffer({ data: this.colorData, usage });
    this.index = new Buffer({
      data: this.indexData,
      usage: BufferUsage.INDEX | BufferUsage.COPY_DST,
    });
    const geometry = new Geometry({
      attributes: {
        aPosition: { buffer: this.pos, format: "float32x2" },
        aUV: { buffer: this.uv, format: "float32x2" },
        aColor: { buffer: this.color, format: "float32x4" },
      },
      indexBuffer: this.index,
    });
    this.uniforms = new UniformGroup({
      uFrame: { value: new Float32Array([0, 0, 1, 1]), type: "vec4<f32>" },
      uWrap: { value: 0, type: "f32" },
    });
    const shader = new Shader({
      glProgram: program,
      resources: { uTexture: Texture.WHITE.source, stripUniforms: this.uniforms },
    });
    this.mesh = new Mesh({ geometry, shader, texture: Texture.WHITE });
  }

  /** Neu beginnen mit Textur und Mischmodus. */
  reset(t: StripTexture, additive: boolean): void {
    this.vertices = 0;
    this.indices = 0;
    const src: TextureSource = t.texture.source;
    this.mesh.texture = t.texture;
    this.mesh.shader!.resources.uTexture = src;
    this.uniforms.uniforms.uFrame.set(t.frame);
    this.uniforms.uniforms.uWrap = t.wrap ? 1 : 0;
    this.uniforms.update();
    this.mesh.blendMode = additive ? "add" : "normal";
  }

  add(s: Strip): void {
    const n = s.v.length;
    if (n < 3) return;
    this.reserve(this.vertices + n, this.indices + 3 * (n - 2));
    const base = this.vertices;
    for (const v of s.v) {
      const k = this.vertices++;
      this.posData[2 * k] = v.x;
      this.posData[2 * k + 1] = v.y;
      this.uvData[2 * k] = v.u;
      this.uvData[2 * k + 1] = v.v;
      this.colorData[4 * k] = clamp01(v.r);
      this.colorData[4 * k + 1] = clamp01(v.g);
      this.colorData[4 * k + 2] = clamp01(v.b);
      this.colorData[4 * k + 3] = clamp01(v.a);
    }
    for (let i = 0; i < n - 2; i++) {
      this.indexData[this.indices++] = base + i;
      this.indexData[this.indices++] = base + i + 1;
      this.indexData[this.indices++] = base + i + 2;
    }
  }

  /** Puffer hochladen (nur der benutzte Teil wird gezeichnet). */
  finish(): void {
    if (this.indices > 0) {
      this.pos.update(this.vertices * 8);
      this.uv.update(this.vertices * 8);
      this.color.update(this.vertices * 16);
      this.index.update(this.indices * 4);
    }
    this.mesh.geometry.indexCount = this.indices;
    this.mesh.visible = this.indices > 0;
  }

  private reserve(vertices: number, indices: number): void {
    if (vertices * 2 > this.posData.length) {
      const cap = Math.max(vertices, (this.posData.length / 2) * 2);
      this.posData = grow(this.posData, cap * 2);
      this.uvData = grow(this.uvData, cap * 2);
      this.colorData = grow(this.colorData, cap * 4);
      this.pos.data = this.posData;
      this.uv.data = this.uvData;
      this.color.data = this.colorData;
    }
    if (indices > this.indexData.length) {
      const next = new Uint32Array(Math.max(indices, this.indexData.length * 2));
      next.set(this.indexData);
      this.indexData = next;
      this.index.data = this.indexData;
    }
  }

  destroy(): void {
    this.mesh.destroy();
  }
}

function grow(a: Float32Array<ArrayBuffer>, n: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(n);
  next.set(a);
  return next;
}
