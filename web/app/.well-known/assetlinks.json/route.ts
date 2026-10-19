import { buildAssetLinks } from "@/lib/pwa";

/*
  Digital Asset Links لتطبيق أندرويد (TWA) — يربط الموقع بالتطبيق ليفتح بلا شريط المتصفح.
  يُخدَم فقط إن ضبط المالك ANDROID_ASSETLINKS_SHA256 (بصمة SHA-256 لشهادة التوقيع)؛
  وإلا 404 عمداً. التفاصيل في docs/STORE-PUBLISHING.md.
*/
export const dynamic = "force-dynamic";

export function GET() {
  const links = buildAssetLinks(process.env.ANDROID_ASSETLINKS_SHA256);
  if (!links) return new Response("Not Found", { status: 404 });
  return Response.json(links, { headers: { "Cache-Control": "public, max-age=300" } });
}
