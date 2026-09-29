import { describe, expect, test } from "bun:test";
import {
  AssetStore,
  FX_ONE,
  FixedStepLoop,
  Rng,
  decodeInput,
  encodeInput,
  firstDivergence,
  fx,
  fxDiv,
  fxFloor,
  fxMul,
  fxRound,
  hashArrays,
  xxhash32,
  type Fetch,
  type Manifest,
} from "../src/index";

describe("FixedStepLoop", () => {
  test("erster Aufruf startet die Uhr, danach ganze Ticks mit Rest", () => {
    const loop = new FixedStepLoop(14);
    expect(loop.frame(1000)).toBe(0);
    expect(loop.frame(1013)).toBe(0);
    expect(loop.frame(1014)).toBe(1);
    expect(loop.frame(1042)).toBe(2);
    expect(loop.alpha).toBe(0);
    expect(loop.frame(1049)).toBe(0);
    expect(loop.alpha).toBe(0.5);
  });

  test("Catch-up ist begrenzt und verwirft den Rest", () => {
    const loop = new FixedStepLoop(14, 5);
    loop.frame(0);
    expect(loop.frame(10_000)).toBe(5);
    expect(loop.frame(10_010)).toBe(0);
    expect(loop.frame(10_014)).toBe(1);
  });

  test("reset verwirft angesammelte Zeit; rückwärtslaufende Uhr ebenso", () => {
    const loop = new FixedStepLoop(14);
    loop.frame(0);
    loop.frame(13);
    loop.reset(100);
    expect(loop.frame(113)).toBe(0);
    expect(loop.frame(50)).toBe(0);
    expect(loop.frame(64)).toBe(1);
  });
});

describe("Q16.16", () => {
  test("Konvertierung", () => {
    expect(fx(1)).toBe(FX_ONE);
    expect(fx(-2.5)).toBe(-2.5 * FX_ONE);
    expect(fxFloor(fx(-0.25))).toBe(-1);
    expect(fxRound(fx(2.5))).toBe(3);
    expect(fxRound(fx(-2.5))).toBe(-2);
  });

  test("fxMul ist exakt floor(a·b/2^16), auch bei großen Werten", () => {
    const rng = new Rng(1);
    for (let i = 0; i < 20_000; i++) {
      const a = rng.next() | 0;
      const b = (rng.next() | 0) >> (rng.int(24) + 1);
      const exact = (BigInt(a) * BigInt(b)) >> 16n;
      expect(fxMul(a, b)).toBe(Number(BigInt.asIntN(32, exact)));
    }
    expect(fxMul(fx(1.5), fx(-2))).toBe(fx(-3));
  });

  test("fxDiv ist exakt floor(a·2^16/b)", () => {
    const rng = new Rng(2);
    for (let i = 0; i < 20_000; i++) {
      const a = (rng.next() | 0) >> rng.int(16);
      const b = (rng.next() | 0) >> rng.int(30) || 1;
      const num = BigInt(a) << 16n;
      const den = BigInt(b);
      let q = num / den;
      if (num % den !== 0n && num < 0n !== den < 0n) q -= 1n;
      expect(fxDiv(a, b)).toBe(Number(BigInt.asIntN(32, q)));
    }
    expect(() => fxDiv(1, 0)).toThrow(RangeError);
  });
});

describe("Rng", () => {
  test("xorshift32-Referenzfolge", () => {
    const rng = new Rng(1);
    expect([rng.next(), rng.next(), rng.next()]).toEqual([270369, 67634689, 2647435461]);
  });

  test("Zustand ist setzbar und reproduziert die Folge", () => {
    const a = new Rng(42);
    a.next();
    const b = new Rng(0);
    b.state = a.state;
    expect(b.next()).toBe(a.next());
    expect(new Rng(0).next()).not.toBe(0);
  });
});

const enc = (s: string) => new TextEncoder().encode(s);

describe("xxHash32", () => {
  test("Referenzvektoren", () => {
    expect(xxhash32(enc(""))).toBe(0x02cc5d05);
    expect(xxhash32(enc("a"))).toBe(0x550d7456);
    expect(xxhash32(enc("abc"))).toBe(0x32d153ff);
    expect(xxhash32(enc("Nobody inspects the spammish repetition"))).toBe(0xe2293b2f);
  });

  test("hashArrays unterscheidet Array-Grenzen", () => {
    const a = hashArrays([Int32Array.of(1, 2), Int32Array.of(3)]);
    const b = hashArrays([Int32Array.of(1), Int32Array.of(2, 3)]);
    expect(a).not.toBe(b);
  });
});

describe("Replay-Eingaben", () => {
  test("Lauflängen-Round-Trip", () => {
    const masks = Uint16Array.of(0, 0, 0, 5, 5, 1, 0, 0);
    const runs = encodeInput(masks);
    expect(runs).toEqual([0, 3, 5, 2, 1, 1, 0, 2]);
    expect([...decodeInput(runs)]).toEqual([...masks]);
    expect(encodeInput([])).toEqual([]);
  });

  test("Masken über 16 Bit (Zeigerziel) bleiben erhalten", () => {
    const big = (1 << 28) | (479 << 19) | 0x1ff;
    expect([...decodeInput(encodeInput([big, big, 3]))]).toEqual([big, big, 3]);
  });

  test("firstDivergence", () => {
    expect(firstDivergence([1, 2, 3], [1, 2, 3])).toBe(-1);
    expect(firstDivergence([1, 2, 3], [1, 9, 3])).toBe(1);
    expect(firstDivergence([1, 2], [1, 2, 3])).toBe(2);
  });
});

describe("AssetStore", () => {
  const manifest: Manifest = {
    version: 1,
    game: "dove",
    entries: [
      {
        id: "level/level1",
        bundles: ["level1"],
        kind: "level",
        file: "level/level1.abcd1234.json",
        bytes: 9,
        sha256: "x",
        sources: [],
        optionsHash: "o",
        converterVersion: 1,
        data: "levelData/level1",
      },
    ],
  };
  const files: Record<string, string> = {
    "/assets/dove/manifest.json": JSON.stringify(manifest),
    "/assets/dove/level/level1.abcd1234.json": '{"a": 1}',
  };
  let calls = 0;
  const fetchFn: Fetch = async (url) => {
    calls++;
    const body = files[url];
    return {
      ok: body !== undefined,
      status: body === undefined ? 404 : 200,
      arrayBuffer: async () => new TextEncoder().encode(body ?? "").buffer as ArrayBuffer,
    };
  };

  test("lädt Manifest, löst IDs auf und cacht", async () => {
    const store = await AssetStore.load("/assets/dove/manifest.json", fetchFn);
    expect(store.url("level/level1")).toBe("/assets/dove/level/level1.abcd1234.json");
    expect(store.bundle("level1")).toEqual(["level/level1"]);
    const before = calls;
    expect(await store.json<{ a: number }>("level/level1")).toEqual({ a: 1 });
    await store.bytes("level/level1");
    expect(calls - before).toBe(1);
    expect(() => store.entry("image/nix")).toThrow();
  });

  test("HTTP-Fehler wird gemeldet und nicht gecacht", async () => {
    await expect(AssetStore.load("/fehlt/manifest.json", fetchFn)).rejects.toThrow("HTTP 404");
  });
});
