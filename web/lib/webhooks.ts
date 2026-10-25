import "server-only";

import { createHmac, randomBytes } from "node:crypto";
import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";
import https from "node:https";
import { safeEqual } from "@/lib/safe-equal";

/*
  ويب هوكس موقَّعة (صادرة). التوقيع: ترويسة X-Salam-Signature: t=<ثواني>,v1=<hex>
  حيث v1 = HMAC-SHA256(secret, `${t}.${bodyRaw}`). المستلم يعيد الحساب ويرفض
  الطوابع القديمة (>٥ دقائق) لمنع إعادة التشغيل.

  حارس SSRF: https فقط، منفذ 443 فقط، بلا بيانات اعتماد في الرابط، تحليل DNS
  ورفض أي عنوان خاص/loopback/link-local/metadata (IPv4 وIPv6 بما فيه
  المضمَّن v4)، ثم تثبيت الاتصال على العنوان المُتحقَّق منه (يمنع DNS
  rebinding)، بلا تتبّع تحويلات، ومهلة قصيرة وسقف لحجم الرد.
*/

export const SIGNATURE_HEADER = "X-Salam-Signature";
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const WEBHOOK_EVENTS = ["ping", "student.created", "attendance.recorded", "progress.recorded"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: unknown): value is WebhookEvent {
  return typeof value === "string" && (WEBHOOK_EVENTS as readonly string[]).includes(value);
}

export function generateWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString("hex")}`;
}

// ————— التوقيع —————

export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
}

export function signatureHeader(secret: string, body: string, timestamp = Math.floor(Date.now() / 1000)): string {
  return `t=${timestamp},v1=${computeSignature(secret, timestamp, body)}`;
}

/** تحقق المستلم (يُستخدم بالاختبارات وكمرجع للتوثيق) */
export function verifySignatureHeader(
  secret: string,
  header: string | null,
  body: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(
    header.split(",").map((p) => {
      const i = p.indexOf("=");
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isInteger(t) || typeof v1 !== "string") return false;
  if (Math.abs(nowSeconds - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
  return safeEqual(computeSignature(secret, t, body), v1);
}

// ————— حارس SSRF —————

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^[0-9]{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

const V4_BLOCKS: readonly [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function isPrivateV4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  if (n === null) return true; // غير مفهوم = مرفوض
  return V4_BLOCKS.some(([base, bits]) => {
    const b = ipv4ToInt(base) as number;
    const size = 2 ** (32 - bits);
    return Math.floor(n / size) === Math.floor(b / size);
  });
}

/** يحوّل نص IPv6 إلى ٨ مجموعات ١٦ بت، أو null */
function parseV6(input: string): number[] | null {
  let ip = input.split("%")[0].toLowerCase();
  if (ip.startsWith("[") && ip.endsWith("]")) ip = ip.slice(1, -1);
  // ذيل v4 منقوط
  const lastColon = ip.lastIndexOf(":");
  const tail = ip.slice(lastColon + 1);
  if (tail.includes(".")) {
    const n = ipv4ToInt(tail);
    if (n === null) return null;
    ip = `${ip.slice(0, lastColon + 1)}${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const fill = 8 - head.length - rest.length;
    if (fill < 1) return null;
    groups = [...head, ...Array<string>(fill).fill("0"), ...rest];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(parseInt(g, 16));
  }
  return out;
}

function v4FromGroups(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

function isPrivateV6(ip: string): boolean {
  const g = parseV6(ip);
  if (!g) return true;
  const allZeroUntil = (n: number) => g.slice(0, n).every((x) => x === 0);
  // :: و ::1
  if (allZeroUntil(7) && (g[7] === 0 || g[7] === 1)) return true;
  // ::ffff:a.b.c.d (مُطابَق v4) و ::a.b.c.d (متوافق قديم)
  if (allZeroUntil(5) && (g[5] === 0xffff || g[5] === 0)) return isPrivateV4(v4FromGroups(g[6], g[7]));
  // NAT64 64:ff9b::/96
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPrivateV4(v4FromGroups(g[6], g[7]));
  }
  // 6to4 2002::/16 يضمّن v4 في المجموعتين التاليتين
  if (g[0] === 0x2002) return isPrivateV4(v4FromGroups(g[1], g[2]));
  // نسمح فقط بـglobal unicast 2000::/3
  if ((g[0] & 0xe000) !== 0x2000) return true;
  // Teredo 2001::/32 وdocumentation 2001:db8::/32 وORCHID وغيرها 2001:0::/23
  if (g[0] === 0x2001 && g[1] < 0x0200) return true;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true;
  return false;
}

/** هل العنوان (IPv4/IPv6 نصاً) غير عام؟ أي نص غير صالح يُعدّ خاصاً (رفض) */
export function isPrivateIp(ip: string): boolean {
  const version = isIP(ip.startsWith("[") ? ip.slice(1, -1) : ip);
  if (version === 4) return isPrivateV4(ip);
  if (version === 6) return isPrivateV6(ip);
  return true;
}

export type ResolvedAddress = { address: string; family: 4 | 6 };
export type Resolver = (hostname: string) => Promise<ResolvedAddress[]>;

const defaultResolver: Resolver = async (hostname) => {
  const res = await dnsLookup(hostname, { all: true, verbatim: true });
  return res.map((r) => ({ address: r.address, family: r.family === 6 ? 6 : 4 }));
};

export class UnsafeUrlError extends Error {}

/**
 * يتحقق أن الرابط وجهة صالحة للويب هوك ويعيد العنوان المُتحقَّق منه
 * (للتثبيت عند الاتصال). يرمي UnsafeUrlError عند أي مخالفة.
 */
export async function assertSafeWebhookUrl(
  rawUrl: string,
  resolve: Resolver = defaultResolver,
): Promise<{ url: URL; address: ResolvedAddress }> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeUrlError("رابط غير صالح");
  }
  if (url.protocol !== "https:") throw new UnsafeUrlError("يلزم رابط https");
  if (url.username || url.password) throw new UnsafeUrlError("الرابط لا يقبل بيانات اعتماد");
  if (url.port && url.port !== "443") throw new UnsafeUrlError("المنفذ المسموح 443 فقط");

  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new UnsafeUrlError("رابط غير صالح");
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower.endsWith(".localhost") || lower.endsWith(".internal") || lower.endsWith(".local")) {
    throw new UnsafeUrlError("وجهة غير مسموحة");
  }

  let addresses: ResolvedAddress[];
  if (isIP(host)) {
    addresses = [{ address: host, family: isIP(host) === 6 ? 6 : 4 }];
  } else {
    try {
      addresses = await resolve(host);
    } catch {
      throw new UnsafeUrlError("تعذّر تحليل اسم النطاق");
    }
  }
  if (addresses.length === 0) throw new UnsafeUrlError("تعذّر تحليل اسم النطاق");
  // أي عنوان غير عام يُسقط الطلب كله (لا نختار «العام منها»)
  if (addresses.some((a) => isPrivateIp(a.address))) throw new UnsafeUrlError("وجهة غير مسموحة");
  return { url, address: addresses[0] };
}

// ————— الإرسال —————

export const DELIVERY_TIMEOUT_MS = 8000;
const MAX_RESPONSE_BYTES = 64 * 1024;

export type SendResult = { ok: boolean; status: number | null; error?: string };

export type Sender = (args: {
  url: URL;
  address: ResolvedAddress;
  body: string;
  headers: Record<string, string>;
  timeoutMs: number;
}) => Promise<{ status: number }>;

/** https.request مثبَّت على العنوان المُتحقَّق منه؛ لا يتتبّع تحويلات إطلاقاً */
export const httpsSender: Sender = ({ url, address, body, headers, timeoutMs }) =>
  new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: "POST",
        hostname: url.hostname,
        port: 443,
        path: `${url.pathname}${url.search}`,
        headers: { ...headers, "Content-Length": Buffer.byteLength(body).toString() },
        timeout: timeoutMs,
        // التثبيت: نتجاهل DNS ونستعمل العنوان الذي فحصناه (SNI يبقى باسم المضيف)
        lookup: (_host, options, cb) => {
          const done = cb as unknown as (err: Error | null, addr: unknown, family?: number) => void;
          if (typeof options === "object" && options && "all" in options && options.all) {
            done(null, [{ address: address.address, family: address.family }]);
          } else {
            done(null, address.address, address.family);
          }
        },
      },
      (res) => {
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_RESPONSE_BYTES) res.destroy();
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("close", () => resolve({ status: res.statusCode ?? 0 }));
        res.on("error", () => resolve({ status: res.statusCode ?? 0 }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end(body);
  });

export function buildWebhookBody(event: string, payload: unknown, deliveryId: number | string, createdAtISO: string): string {
  return JSON.stringify({ id: String(deliveryId), event, created_at: createdAtISO, data: payload });
}

/** محاولة تسليم واحدة: فحص SSRF ثم POST موقَّع. 2xx فقط نجاح؛ 3xx فشل (لا تتبّع). */
export async function sendWebhook(
  args: { url: string; secret: string; event: string; body: string; deliveryId: number | string },
  deps: { resolve?: Resolver; sender?: Sender; now?: () => number } = {},
): Promise<SendResult> {
  try {
    const { url, address } = await assertSafeWebhookUrl(args.url, deps.resolve);
    const ts = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
    const { status } = await (deps.sender ?? httpsSender)({
      url,
      address,
      body: args.body,
      timeoutMs: DELIVERY_TIMEOUT_MS,
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Salam-Webhooks/1",
        "X-Salam-Event": args.event,
        "X-Salam-Delivery": String(args.deliveryId),
        [SIGNATURE_HEADER]: signatureHeader(args.secret, args.body, ts),
      },
    });
    if (status >= 200 && status < 300) return { ok: true, status };
    return { ok: false, status, error: status >= 300 && status < 400 ? "تحويل غير مسموح" : `رد HTTP ${status}` };
  } catch (error) {
    return { ok: false, status: null, error: error instanceof Error ? error.message.slice(0, 200) : "فشل الإرسال" };
  }
}

// ————— إعادة المحاولة —————

export const MAX_ATTEMPTS = 6;
/** تراجع بالثواني بعد الفشل رقم n (١-based): ١د، ٥د، ٣٠د، ٢س، ٦س */
const BACKOFF_SECONDS = [60, 300, 1800, 7200, 21600];

/** ثواني الانتظار قبل المحاولة التالية، أو null لو استُنفدت المحاولات */
export function nextDelaySeconds(attemptsMade: number): number | null {
  if (attemptsMade >= MAX_ATTEMPTS) return null;
  return BACKOFF_SECONDS[Math.min(attemptsMade, BACKOFF_SECONDS.length) - 1] ?? BACKOFF_SECONDS[0];
}
