import "server-only";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

/** يبني رابط تحويل المستخدم لصفحة موافقة جوجل */
export function googleAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID ?? "",
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export type GoogleProfile = { email: string; name: string };

/** يبادل كود التفويض بمعلومات المستخدم (البريد والاسم) */
export async function exchangeGoogleCode(code: string, redirectUri: string): Promise<GoogleProfile> {
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!tokenRes.ok) throw new Error("تعذّر التحقق من حساب جوجل");
  const tokens = (await tokenRes.json()) as { access_token?: string };
  if (!tokens.access_token) throw new Error("تعذّر التحقق من حساب جوجل");

  const infoRes = await fetch(USERINFO_URL, {
    headers: { Authorization: `Bearer ${tokens.access_token}` },
  });
  if (!infoRes.ok) throw new Error("تعذّر جلب بيانات حساب جوجل");
  const info = (await infoRes.json()) as { email?: string; name?: string; email_verified?: boolean };
  if (!info.email || info.email_verified === false) throw new Error("بريد جوجل غير موثّق");

  return { email: info.email.toLowerCase(), name: info.name ?? info.email };
}
