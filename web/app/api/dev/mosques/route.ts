import { devConsoleGate } from "@/lib/dev-gate";
import { getMosqueAdminForMosque, getMosqueFeatures, listHalaqahs, listMosques } from "@/lib/mosque/db";
import { logServerError } from "@/lib/dev-error-log";

export type DevMosqueCard = {
  id: number;
  name: string;
  city: string;
  createdAt: string;
  halaqahs: { id: number; name: string; teacher: string }[];
  adminUsername: string | null;
  features: { key: string; nameAr: string; enabled: boolean; status: string }[];
};

/**
 * كل الجوامع ببطاقة واحدة لكل جامع: حلقاته المرتبطة + حساب مديره +
 * مصفوفة مزاياه. الإنشاء والتوزيع تبقى عبر المسارات القائمة
 * (/api/mosques، /api/mosques/[id]/...) — لا ازدواج هنا.
 */
export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;

  try {
    const mosques = await listMosques();
    const cards = await Promise.all(
      mosques.map(async (mosque) => {
        const [halaqahs, admin, features] = await Promise.all([
          listHalaqahs(mosque.id),
          getMosqueAdminForMosque(mosque.id),
          getMosqueFeatures(mosque.id),
        ]);
        return {
          id: mosque.id,
          name: mosque.name,
          city: mosque.city,
          createdAt: mosque.createdAt,
          halaqahs: halaqahs.map((h) => ({ id: h.id, name: h.halaqahName, teacher: h.teacherName })),
          adminUsername: admin?.username ?? null,
          features: features.map((f) => ({ key: f.key, nameAr: f.nameAr, enabled: f.enabled, status: f.status })),
        } satisfies DevMosqueCard;
      }),
    );
    return Response.json({ mosques: cards });
  } catch (error) {
    await logServerError("dev:mosques", error);
    return Response.json({ error: "تعذّر تحميل الجوامع" }, { status: 500 });
  }
}
