import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { googleAuthUrl } from "@/lib/google-auth";

const STATE_COOKIE = "google_oauth_state";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/auth/google/callback`;
  const state = randomBytes(16).toString("hex");

  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600, // ١٠ دقائق تكفي لإتمام الموافقة
  });

  return Response.redirect(googleAuthUrl(redirectUri, state));
}
