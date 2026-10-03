import {
  GlProgram,
  Mesh,
  MeshGeometry,
  Shader,
  type Texture,
  type TextureSource,
  UniformGroup,
} from "pixi.js";

/**
 * Kantenglättung für Pixelgrafik: vergrößert ein Bild in Originalauflösung auf
 * ein ganzzahliges Vielfaches und rundet dabei Treppen an Kanten ab. Eigene
 * Umsetzung von xBR Stufe 2 (Algorithmus von Hyllian) als ein Durchgang, der
 * für jedes Zielpixel die 21 umliegenden Quellpixel liest:
 *
 *        A1 B1 C1
 *     A0 A  B  C  C4
 *     D0 D  E  F  F4
 *     G0 G  H  I  I4
 *        G5 H5 I5
 *
 * Für jede Ecke von E wird geprüft, ob eine Kante quer davor verläuft: Sind
 * die Pixel entlang der Diagonalen F–H einander ähnlicher (Helligkeit) als
 * quer dazu, bekommt die Ecke zu I hin die Farbe von F bzw. H — als Dreieck
 * unter 45° oder, wenn die Kante flacher bzw. steiler läuft (F≈G bzw. H≈C),
 * als längerer Keil (Stufe 2). Die vier Komponenten der `vec4` sind die vier
 * Ecken (I, C, A, G), die Nachbarn je Ecke um 90° gedreht. Der Übergang an der
 * Kante ist etwa ein Zielpixel breit; nur dort entstehen Mischfarben. Ohne
 * Kante bleibt E unverändert.
 */

const VERTEX = `
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
uniform mat3 uProjectionMatrix;
uniform mat3 uWorldTransformMatrix;
uniform mat3 uTransformMatrix;
void main() {
  mat3 mvp = uProjectionMatrix * uWorldTransformMatrix * uTransformMatrix;
  gl_Position = vec4((mvp * vec3(aPosition, 1.0)).xy, 0.0, 1.0);
  vUV = aUV;
}
`;

const FRAGMENT = `
in vec2 vUV;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec2 uSize;
uniform float uStep;

// Helligkeit (0,299 / 0,587 / 0,114) auf 0–48 skaliert, ähnlich unter 15
const vec3 LUMA = vec3(14.352, 28.176, 5.472);
const float SIMILAR = 15.0;

vec4 at(vec2 c, float x, float y) { return texture(uTexture, (c + vec2(x, y)) / uSize); }
vec4 luma(vec4 a, vec4 b, vec4 c, vec4 d) {
  return vec4(dot(a.rgb, LUMA), dot(b.rgb, LUMA), dot(c.rgb, LUMA), dot(d.rgb, LUMA));
}
vec4 dist(vec4 a, vec4 b) { return abs(a - b); }
vec4 ne(vec4 a, vec4 b) { return vec4(notEqual(a, b)); }
vec4 near(vec4 a, vec4 b) { return vec4(lessThan(dist(a, b), vec4(SIMILAR))); }
vec4 along(vec4 a, vec4 b, vec4 c, vec4 d, vec4 e, vec4 f, vec4 g, vec4 h) {
  return dist(a, b) + dist(a, c) + dist(d, e) + dist(d, f) + 4.0 * dist(g, h);
}

void main() {
  vec2 p = vUV * uSize;
  vec2 fp = fract(p);
  vec2 c = floor(p) + 0.5;

  vec4 A1 = at(c, -1.0, -2.0), B1 = at(c, 0.0, -2.0), C1 = at(c, 1.0, -2.0);
  vec4 A0 = at(c, -2.0, -1.0), A = at(c, -1.0, -1.0), B = at(c, 0.0, -1.0);
  vec4 C = at(c, 1.0, -1.0), C4 = at(c, 2.0, -1.0);
  vec4 D0 = at(c, -2.0, 0.0), D = at(c, -1.0, 0.0), E = at(c, 0.0, 0.0);
  vec4 F = at(c, 1.0, 0.0), F4 = at(c, 2.0, 0.0);
  vec4 G0 = at(c, -2.0, 1.0), G = at(c, -1.0, 1.0), H = at(c, 0.0, 1.0);
  vec4 I = at(c, 1.0, 1.0), I4 = at(c, 2.0, 1.0);
  vec4 G5 = at(c, -1.0, 2.0), H5 = at(c, 0.0, 2.0), I5 = at(c, 1.0, 2.0);

  // je Komponente eine Ecke von E (I, C, A, G), die Nachbarn mitgedreht
  vec4 b = luma(B, D, H, F);
  vec4 cc = luma(C, A, G, I);
  vec4 e = luma(E, E, E, E);
  vec4 d = b.yzwx;
  vec4 f = b.wxyz;
  vec4 h = b.zwxy;
  vec4 g = cc.zwxy;
  vec4 i = cc.wxyz;
  vec4 i4 = luma(I4, C1, A0, G5);
  vec4 i5 = luma(I5, C4, A1, G0);
  vec4 h5 = luma(H5, F4, B1, D0);
  vec4 f4 = h5.yzwx;

  // keine Ecke runden, wo F oder H zu E gehören oder eine gerade Kante weiterläuft
  vec4 lv0 = ne(e, f) * ne(e, h);
  vec4 lv1 = lv0 * max(
    max((1.0 - near(f, b)) * (1.0 - near(h, d)), near(e, i) * (1.0 - near(f, i4)) * (1.0 - near(h, i5))),
    max(near(e, g), near(e, cc)));
  vec4 lv2Flat = ne(e, g) * ne(d, g);
  vec4 lv2Steep = ne(e, cc) * ne(b, cc);

  // Unterschiede entlang F–H (Kante) und quer dazu
  vec4 wd1 = along(e, cc, g, i, h5, f4, h, f);
  vec4 wd2 = along(h, d, i5, f, i4, b, e, i);
  vec4 edgeInner = vec4(lessThanEqual(wd1, wd2)) * lv0;
  vec4 edge = vec4(lessThan(wd1, wd2)) * lv1;
  vec4 edgeFlat = vec4(lessThanEqual(2.0 * dist(f, g), dist(h, cc))) * lv2Flat * edge;
  vec4 edgeSteep = vec4(greaterThanEqual(dist(f, g), 2.0 * dist(h, cc))) * lv2Steep * edge;

  // Lage im Pixel gegen die Kantenlinien: 45°, flach (1:2) und steil (2:1)
  vec4 l45 = vec4(1.0, -1.0, -1.0, 1.0) * fp.y + vec4(1.0, 1.0, -1.0, -1.0) * fp.x;
  vec4 lFlat = vec4(1.0, -1.0, -1.0, 1.0) * fp.y + vec4(0.5, 2.0, -0.5, -2.0) * fp.x;
  vec4 lSteep = vec4(1.0, -1.0, -1.0, 1.0) * fp.y + vec4(2.0, 0.5, -2.0, -0.5) * fp.x;
  vec4 c45 = vec4(1.5, 0.5, -0.5, 0.5);
  vec4 cFlat = vec4(1.0, 1.0, -0.5, 0.0);
  vec4 cSteep = vec4(2.0, 0.0, -1.0, 0.5);
  vec4 s45 = vec4(0.7 * uStep);
  vec4 sFlat = vec4(0.5, 1.0, 0.5, 1.0) * uStep;
  vec4 sSteep = sFlat.yxwz;
  vec4 w45i = clamp((l45 + s45 - c45 - 0.25) / (2.0 * s45), 0.0, 1.0) * edgeInner;
  vec4 w45 = clamp((l45 + s45 - c45) / (2.0 * s45), 0.0, 1.0) * edge;
  vec4 wFlat = clamp((lFlat + sFlat - cFlat) / (2.0 * sFlat), 0.0, 1.0) * edgeFlat;
  vec4 wSteep = clamp((lSteep + sSteep - cSteep) / (2.0 * sSteep), 0.0, 1.0) * edgeSteep;
  vec4 w = max(max(wFlat, wSteep), max(w45, w45i));

  // Farbe von F bzw. H (der zu E ähnlichere); gegenüberliegende Ecken getrennt,
  // es gilt die stärkere Änderung
  vec4 pickF = vec4(lessThanEqual(dist(e, f), dist(e, h)));
  vec4 r1 = mix(E, mix(H, F, pickF.x), w.x);
  r1 = mix(r1, mix(B, D, pickF.z), w.z);
  vec4 r2 = mix(E, mix(F, B, pickF.y), w.y);
  r2 = mix(r2, mix(D, H, pickF.w), w.w);
  vec3 d1 = abs(E.rgb - r1.rgb);
  vec3 d2 = abs(E.rgb - r2.rgb);
  finalColor = d1.r + d1.g + d1.b <= d2.r + d2.g + d2.b ? r2 : r1;
}
`;

let program: GlProgram | undefined;

/** Bild `texture` (`width` × `height`, Auflösung 1) per xBR auf `scale.set(m)` vergrößert. */
export class XbrPresent {
  readonly mesh: Mesh<MeshGeometry, Shader>;
  private readonly uniforms: UniformGroup<{
    uSize: { value: Float32Array; type: "vec2<f32>" };
    uStep: { value: number; type: "f32" };
  }>;

  constructor(texture: Texture, width: number, height: number) {
    // die Lage im Quellpixel braucht volle Genauigkeit (mediump reicht nicht für 800 Texel)
    program ??= GlProgram.from({
      vertex: VERTEX,
      fragment: FRAGMENT,
      name: "clove-xbr",
      preferredFragmentPrecision: "highp",
    });
    const geometry = new MeshGeometry({
      positions: new Float32Array([0, 0, width, 0, width, height, 0, height]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    });
    this.uniforms = new UniformGroup({
      uSize: { value: new Float32Array([width, height]), type: "vec2<f32>" },
      uStep: { value: 1, type: "f32" },
    });
    const source: TextureSource = texture.source;
    const shader = new Shader({
      glProgram: program,
      resources: { uTexture: source, xbrUniforms: this.uniforms },
    });
    this.mesh = new Mesh({ geometry, shader, texture });
  }

  /** Vergrößerung m (ganzzahlig): Zielgröße und Breite des Kantenübergangs. */
  setScale(m: number): void {
    this.mesh.scale.set(m);
    this.uniforms.uniforms.uStep = 1 / m;
    this.uniforms.update();
  }

  destroy(): void {
    this.mesh.destroy();
  }
}
