/*
  أرشيف الأنشطة — قواعد صرفة (بلا خادم) يشاركها المسار والواجهة:
  حدود الصور، فحص البايتات السحرية، وقائمة السماح لروابط الفيديو.
  الصور تُضغط في المتصفح قبل الرفع، والفيديو رابط فقط (لا يُرفع أبداً).
*/

export const MAX_PHOTO_BYTES = 600 * 1024; // السيرفر يرفض ما فوقه
export const TARGET_PHOTO_BYTES = 400 * 1024; // هدف الضغط بالمتصفح
export const MAX_PHOTO_SIDE = 1600;
export const MAX_PHOTOS_PER_MOSQUE = 300;
export const MAX_VIDEO_URL_LENGTH = 500;

export const TAG_KINDS = ["halaqah", "family", "committee"] as const;
export type TagKind = (typeof TAG_KINDS)[number];

export function isTagKind(value: unknown): value is TagKind {
  return value === "halaqah" || value === "family" || value === "committee";
}

export type PhotoMime = "image/jpeg" | "image/png" | "image/webp";

/** نوع الصورة من أول بايتات الملف (لا نثق بالترويسة)، أو null إن لم يكن jpeg/png/webp */
export function detectImageMime(bytes: Uint8Array): PhotoMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  // RIFF....WEBP
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

export type VideoHost = "youtube" | "drive" | "instagram" | "tiktok" | "x";

const VIDEO_HOSTS: Record<string, VideoHost> = {
  "youtube.com": "youtube",
  "www.youtube.com": "youtube",
  "m.youtube.com": "youtube",
  "youtu.be": "youtube",
  "drive.google.com": "drive",
  "instagram.com": "instagram",
  "www.instagram.com": "instagram",
  "tiktok.com": "tiktok",
  "www.tiktok.com": "tiktok",
  "vm.tiktok.com": "tiktok",
  "x.com": "x",
  "www.x.com": "x",
  "twitter.com": "x",
  "www.twitter.com": "x",
  "mobile.twitter.com": "x",
};

export const VIDEO_HOST_LABEL: Record<VideoHost, string> = {
  youtube: "يوتيوب",
  drive: "جوجل درايف",
  instagram: "إنستقرام",
  tiktok: "تيك توك",
  x: "إكس (تويتر)",
};

/** رابط فيديو صالح: https فقط، مضيف من القائمة، بلا بيانات دخول — يعيد الرابط المنظَّف ونوع المنصة، أو null */
export function parseVideoUrl(raw: unknown): { url: string; host: VideoHost } | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > MAX_VIDEO_URL_LENGTH) return null;
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  if (parsed.username || parsed.password) return null;
  if (parsed.port && parsed.port !== "443") return null;
  const host = VIDEO_HOSTS[parsed.hostname.toLowerCase()];
  if (!host) return null;
  return { url: parsed.toString(), host };
}

/** معرّف فيديو يوتيوب (11 محرفاً) من رابط يوتيوب، أو null — يُستخدم لمشغّل youtube-nocookie */
export function youtubeId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  const host = parsed.hostname.toLowerCase();
  let id: string | null = null;
  if (host === "youtu.be") {
    id = parsed.pathname.slice(1).split("/")[0] ?? null;
  } else if ((host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com")) {
    if (parsed.pathname === "/watch") id = parsed.searchParams.get("v");
    else {
      const match = /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(parsed.pathname);
      id = match ? match[1] : null;
    }
  }
  return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
}
