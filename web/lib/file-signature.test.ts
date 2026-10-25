import { describe, expect, it } from "vitest";
import { looksLikeBinary, looksLikeZip } from "./file-signature";

const u8 = (...b: number[]) => new Uint8Array(b);
const text = (s: string) => new TextEncoder().encode(s);

describe("file-signature", () => {
  it("looksLikeZip: بصمة PK\\x03\\x04 فقط", () => {
    expect(looksLikeZip(u8(0x50, 0x4b, 0x03, 0x04, 0x14))).toBe(true);
    expect(looksLikeZip(u8(0x50, 0x4b, 0x03, 0x04))).toBe(false); // قصير جداً
    expect(looksLikeZip(text("name,group\n"))).toBe(false);
  });

  it("looksLikeBinary: نص CSV عربي ليس ثنائياً", () => {
    expect(looksLikeBinary(text("﻿الاسم,المجموعة\nأحمد,أ\n"))).toBe(false);
    expect(looksLikeBinary(u8(0xc7, 0xe1, 0x2c, 0x0a))).toBe(false); // Windows-1256
  });

  it("looksLikeBinary: بصمات معروفة وNUL", () => {
    expect(looksLikeBinary(u8(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(true); // PDF
    expect(looksLikeBinary(u8(0x4d, 0x5a, 0x90, 0x00))).toBe(true); // exe
    expect(looksLikeBinary(u8(0xd0, 0xcf, 0x11, 0xe0, 0xa1))).toBe(true); // xls قديم
    expect(looksLikeBinary(text("a,b\nc\u0000d"))).toBe(true);
  });
});
