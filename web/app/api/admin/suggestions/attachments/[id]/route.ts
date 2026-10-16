import { cookies } from "next/headers";
import { getSuggestionAttachmentImage } from "@/lib/db";
import { verifyAdminToken } from "@/lib/admin-session";
import { devHostGate } from "@/lib/host-gate";
import { ADMIN_COOKIE } from "../../../login/route";

/**
 * صورة مرفق واحدة — للأدمن فقط، بمعرّف عالمي فريد (id في suggestion_attachments)
 * بلا حاجة لمعرفة مصدرها (بلاغ معلّم أو طالب). غير الأدمن → 404 لا 401،
 * حتى لا يكشف هذا المسار عن وجوده أصلاً لغير المصرَّح له — ومن مستضيج
 * عام 404 أيضاً (dev split).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const hostGate = await devHostGate();
  if (hostGate) return hostGate;

  const store = await cookies();
  const session = store.get(ADMIN_COOKIE)?.value;

  if (!session || !verifyAdminToken(session)) {
    return new Response(null, { status: 404 });
  }

  const { id } = await params;
  const attachmentId = Number(id);
  if (!Number.isInteger(attachmentId)) return new Response(null, { status: 404 });

  const image = await getSuggestionAttachmentImage(attachmentId);
  if (!image) return new Response(null, { status: 404 });

  return new Response(new Uint8Array(image.bytes), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
