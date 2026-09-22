/**
 * Pinnt die Herleitung von `TICK_MS = 14` an die Bytes von `DOVE.exe`.
 * Herleitung und Adressen: `docs/measurements/tick-rate.md`.
 */
import { describe, expect, test } from "bun:test";
import { join } from "node:path";

const EXE = join(import.meta.dir, "../original-dove/DOVE.exe");
const IMAGE_BASE = 0x400000; // .text/.data liegen mit Dateioffset = VA − Image-Base

const exe = new Uint8Array(await Bun.file(EXE).arrayBuffer());
const view = new DataView(exe.buffer);

const bytesAt = (va: number, hex: string) =>
  expect(
    Buffer.from(exe.subarray(va - IMAGE_BASE, va - IMAGE_BASE + hex.length / 2)).toString("hex"),
  ).toBe(hex);

/** Ziel eines `call rel32` bei `va`. */
const callTarget = (va: number) => va + 5 + view.getInt32(va - IMAGE_BASE + 1, true);

const TIME_GET_TIME_STUB = 0x40a45c;

describe("DOVE.exe — Spieltakt", () => {
  test("0x40A45C ist der Declare-Stub für winmm!timeGetTime", () => {
    // mov eax,[0x4BC494]; or eax,eax; jz +2; jmp eax; push 0x40A444 (Declare-Deskriptor)
    bytesAt(TIME_GET_TIME_STUB, "a194c44b000bc07402ffe06844a44000");
    bytesAt(0x40a438, Buffer.from("timeGetTime\0").toString("hex"));
    bytesAt(0x40a428, Buffer.from("winmm.dll\0").toString("hex"));
  });

  test("vor der Schleife und nach jedem Warten: nextT = timeGetTime + 14", () => {
    for (const [call, add] of [
      [0x470899, 0x4708b0],
      [0x48eb7a, 0x48eb91],
    ] as const) {
      expect(callTarget(call)).toBe(TIME_GET_TIME_STUB);
      bytesAt(add, "83c20e89959cfeffff"); // add edx,0xe ; mov [ebp-0x164],edx
    }
  });

  test("pro Schleifendurchlauf ein Aufruf der Event-Methode (vtable 0x7B4 → 0x43D6B0)", () => {
    bytesAt(0x472d3b, "ff91b4070000"); // call [ecx+0x7b4]
    expect(view.getUint32(0x4090a8 - IMAGE_BASE, true)).toBe(0x4099bd); // vtable-Slot → jmp
    expect(0x4099bd + 5 + view.getInt32(0x4099bd - IMAGE_BASE + 1, true)).toBe(0x43d6b0);
  });

  test("die Event-Methode endet mit Me.F4 = Me.F4 + 1", () => {
    bytesAt(0x4451b9, "81c6f4000000"); // add esi,0xf4 (→ &Me.F4)
    bytesAt(0x4451cb, "c785d8feffff01000000"); // Summand 1
  });
});
