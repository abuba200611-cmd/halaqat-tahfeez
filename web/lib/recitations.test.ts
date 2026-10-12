import { describe, expect, it } from "vitest";
import {
  RECITATION_MAX_BYTES,
  detectAudioFamily,
  formatDuration,
  formatRecitationRange,
  normalizeTeacherNote,
  parseByteRange,
  validateAudioBytes,
  validateDuration,
  validateRecitationRange,
  validateScore,
} from "./recitations";
import { AAC_ADTS, MP3_FRAME, MP3_ID3, MP4, OGG, WEBM } from "./test/audio-fixtures";

describe("detectAudioFamily — magic bytes (STEP 64)", () => {
  it("يتعرّف على كل عائلة مسموحة", () => {
    expect(detectAudioFamily(WEBM)).toBe("webm");
    expect(detectAudioFamily(OGG)).toBe("ogg");
    expect(detectAudioFamily(MP4)).toBe("mp4");
    expect(detectAudioFamily(MP3_ID3)).toBe("mpeg");
    expect(detectAudioFamily(MP3_FRAME)).toBe("mpeg");
    expect(detectAudioFamily(AAC_ADTS)).toBe("aac");
  });

  it("يرفض غير الصوت: نص، PNG، WAV، SVG، فارغ", () => {
    expect(detectAudioFamily(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(detectAudioFamily(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(detectAudioFamily(new TextEncoder().encode("RIFF....WAVEfmt "))).toBeNull();
    expect(detectAudioFamily(new Uint8Array(0))).toBeNull();
  });
});

describe("validateAudioBytes (STEP 64)", () => {
  it("يقبل النوع المُعلَن المطابق للبايتات (مع معاملات codecs)", () => {
    expect(validateAudioBytes(WEBM, "audio/webm;codecs=opus")).toEqual({ ok: true, mime: "audio/webm" });
    expect(validateAudioBytes(OGG, "audio/ogg")).toEqual({ ok: true, mime: "audio/ogg" });
    expect(validateAudioBytes(MP4, "audio/mp4")).toEqual({ ok: true, mime: "audio/mp4" });
    expect(validateAudioBytes(MP4, "audio/x-m4a")).toEqual({ ok: true, mime: "audio/x-m4a" });
    expect(validateAudioBytes(MP3_ID3, "audio/mpeg")).toEqual({ ok: true, mime: "audio/mpeg" });
    expect(validateAudioBytes(AAC_ADTS, "audio/aac")).toEqual({ ok: true, mime: "audio/aac" });
  });

  it("يرفض ملفاً نصياً مُعلَناً صوتاً (الترويسة لا تكفي)", () => {
    const text = new TextEncoder().encode("this is not audio at all");
    expect(validateAudioBytes(text, "audio/webm").ok).toBe(false);
  });

  it("يرفض عدم تطابق البايتات مع النوع المُعلَن", () => {
    expect(validateAudioBytes(MP3_ID3, "audio/webm").ok).toBe(false);
    expect(validateAudioBytes(WEBM, "audio/mpeg").ok).toBe(false);
  });

  it("يرفض نوعاً خارج القائمة حتى لو البايتات صحيحة، أو نوعاً فارغاً", () => {
    expect(validateAudioBytes(WEBM, "video/webm").ok).toBe(false);
    expect(validateAudioBytes(WEBM, "audio/wav").ok).toBe(false);
    expect(validateAudioBytes(WEBM, "").ok).toBe(false);
  });

  it("يرفض الفارغ وما فوق ٣MB", () => {
    expect(validateAudioBytes(new Uint8Array(0), "audio/webm").ok).toBe(false);
    const atLimit = new Uint8Array(RECITATION_MAX_BYTES);
    atLimit.set(WEBM);
    expect(validateAudioBytes(atLimit, "audio/webm").ok).toBe(true);
    const over = new Uint8Array(RECITATION_MAX_BYTES + 1);
    over.set(WEBM);
    const res = validateAudioBytes(over, "audio/webm");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toContain("3 ميغابايت");
  });
});

describe("validateDuration (STEP 64)", () => {
  it("يقبل من ثانية إلى ٣ دقائق ويقرّب", () => {
    expect(validateDuration(1)).toEqual({ ok: true, seconds: 1 });
    expect(validateDuration("42.4")).toEqual({ ok: true, seconds: 42 });
    expect(validateDuration(180)).toEqual({ ok: true, seconds: 180 });
  });

  it("يرفض صفراً وسالباً وNaN وما فوق ٣ دقائق", () => {
    expect(validateDuration(0).ok).toBe(false);
    expect(validateDuration(0.4).ok).toBe(false);
    expect(validateDuration(-5).ok).toBe(false);
    expect(validateDuration("abc").ok).toBe(false);
    expect(validateDuration(undefined).ok).toBe(false);
    expect(validateDuration(null).ok).toBe(false);
    expect(validateDuration("").ok).toBe(false);
    expect(validateDuration(182).ok).toBe(false);
    expect(validateDuration(600).ok).toBe(false);
  });
});

describe("validateRecitationRange (STEP 64)", () => {
  it("يقبل نطاقاً صحيحاً داخل سورة", () => {
    expect(validateRecitationRange("67", "1", "30")).toEqual({
      ok: true,
      range: { surah: 67, fromAyah: 1, toAyah: 30 },
    });
  });

  it("يرفض سورة خارج 1..114 وآية خارج حدود السورة وعكس الترتيب والحقول الفارغة", () => {
    expect(validateRecitationRange(0, 1, 1).ok).toBe(false);
    expect(validateRecitationRange(115, 1, 1).ok).toBe(false);
    expect(validateRecitationRange(1, 1, 8).ok).toBe(false); // الفاتحة 7 آيات
    expect(validateRecitationRange(2, 0, 5).ok).toBe(false);
    expect(validateRecitationRange(2, 10, 5).ok).toBe(false);
    expect(validateRecitationRange("", 1, 1).ok).toBe(false);
    expect(validateRecitationRange(null, null, null).ok).toBe(false);
    expect(validateRecitationRange("x", 1, 1).ok).toBe(false);
    expect(validateRecitationRange(2, 1.5, 3).ok).toBe(false);
  });
});

describe("validateScore / normalizeTeacherNote (STEP 64)", () => {
  it("الدرجة 1..10 صحيحة فقط", () => {
    for (const n of [1, 5, 10, "7"]) expect(validateScore(n).ok).toBe(true);
    for (const n of [0, 11, -1, 5.5, "", "abc", null, undefined, NaN]) expect(validateScore(n).ok).toBe(false);
  });

  it("الملاحظة اختيارية وتُقصّ وتُفرَّغ إن كانت مسافات", () => {
    expect(normalizeTeacherNote(undefined)).toEqual({ ok: true, note: null });
    expect(normalizeTeacherNote("   ")).toEqual({ ok: true, note: null });
    expect(normalizeTeacherNote(" أحسنت ")).toEqual({ ok: true, note: "أحسنت" });
    const long = normalizeTeacherNote("ا".repeat(900));
    expect(long.ok && long.note?.length).toBe(500);
    expect(normalizeTeacherNote(5).ok).toBe(false);
  });
});

describe("parseByteRange (STEP 64)", () => {
  it("بلا ترويسة: null (أرسل الكل)", () => {
    expect(parseByteRange(null, 1000)).toBeNull();
  });
  it("نطاقات صحيحة", () => {
    expect(parseByteRange("bytes=0-", 1000)).toEqual({ start: 0, end: 999 });
    expect(parseByteRange("bytes=100-199", 1000)).toEqual({ start: 100, end: 199 });
    expect(parseByteRange("bytes=900-5000", 1000)).toEqual({ start: 900, end: 999 });
    expect(parseByteRange("bytes=-100", 1000)).toEqual({ start: 900, end: 999 });
  });
  it("غير مُرضٍ", () => {
    expect(parseByteRange("bytes=1000-", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=500-100", 1000)).toBe("invalid");
    expect(parseByteRange("bytes=-", 1000)).toBe("invalid");
    expect(parseByteRange("items=0-5", 1000)).toBe("invalid");
  });
});

describe("التنسيق (STEP 64)", () => {
  it("المدة والنطاق", () => {
    expect(formatDuration(125)).toBe("2:05");
    expect(formatDuration(0)).toBe("0:00");
    expect(formatRecitationRange({ surah: 67, fromAyah: 1, toAyah: 15 })).toBe("الملك 1–15");
    expect(formatRecitationRange({ surah: 67, fromAyah: 3, toAyah: 3 })).toBe("الملك 3");
  });
});
