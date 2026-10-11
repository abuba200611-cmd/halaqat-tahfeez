import "server-only";

/*
  عميل نداءات خادم-لخادم لنظام إدارة الجامع (masjid-idara) — الاتجاه
  المعاكس لمسارات /api/link/** (هناك الجامع يستدعينا، وهنا نحن نستدعيه).
  نفس السرّ المشترك LINK_SECRET بترويسة x-link-secret، وعنوان الجامع من
  MOSQUE_APP_URL (افتراضي الإنتاج).
*/

const DEFAULT_MOSQUE_APP_URL = "https://masjid-idara.vercel.app";

function mosqueAppUrl(): string {
  return (process.env.MOSQUE_APP_URL?.trim() || DEFAULT_MOSQUE_APP_URL).replace(/\/+$/, "");
}

function secretHeader(): Record<string, string> {
  const secret = process.env.LINK_SECRET;
  return secret ? { "x-link-secret": secret } : {};
}

export type MosqueInfo = { mosqueName: string; city: string };

/** معلومات الجامع صاحب رمز الانضمام: "invalid" لو الرمز غير صحيح، null لو نظام الجامع غير متاح */
export async function fetchMosqueInfo(code: string): Promise<MosqueInfo | "invalid" | null> {
  try {
    const res = await fetch(`${mosqueAppUrl()}/api/link/mosque-info?code=${encodeURIComponent(code)}`, {
      headers: secretHeader(),
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 404) return "invalid";
    if (!res.ok) return null;
    return (await res.json()) as MosqueInfo;
  } catch {
    return null;
  }
}

export type JoinMosqueResult =
  | { ok: true; alreadyJoined: boolean; mosqueName: string }
  | { ok: false; status: number; error: string };

/** يطلب من نظام الجامع إضافة الحلقة (برمز دعوة طلابها) لجامع رمز الانضمام */
export async function joinMosque(input: {
  code: string;
  halaqahInviteCode: string;
  halaqahName: string;
  teacherName: string;
}): Promise<JoinMosqueResult> {
  try {
    const res = await fetch(`${mosqueAppUrl()}/api/link/join-mosque`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...secretHeader() },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      alreadyJoined?: boolean;
      mosqueName?: string;
    };
    if (res.ok) {
      return { ok: true, alreadyJoined: data.alreadyJoined === true, mosqueName: data.mosqueName ?? "" };
    }
    return { ok: false, status: res.status, error: data.error ?? "تعذّر الانضمام" };
  } catch {
    return { ok: false, status: 502, error: "نظام الجامع غير متاح حالياً، حاول لاحقاً" };
  }
}
