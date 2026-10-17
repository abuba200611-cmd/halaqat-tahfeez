import { devConsoleGate } from "@/lib/dev-gate";
import { logDevAction } from "@/lib/dev-audit";
import { logServerError } from "@/lib/dev-error-log";
import {
  createAssociation,
  createAssociationAdmin,
  deleteAssociation,
  getAssociation,
  listAssociationAdmins,
  listAssociations,
  listMosqueAssignments,
  resetAssociationAdminPassword,
  setMosqueAssociation,
  updateAssociation,
} from "@/lib/association-db";
import { parseAssociationAdminBody, parseAssociationBody } from "@/lib/association";
import { hashPassword } from "@/lib/mosque/password";
import { getMosque } from "@/lib/mosque/db";

/*
  A3 — إدارة الجمعيات من لوحة المطوّر: إنشاء/تعديل/حذف جمعية، إسناد جامع
  لجمعية أو فكّه، إنشاء مدير جمعية وإعادة تعيين كلمة مروره (تُبطل جلساته).
  كل إجراء يمرّ ببوابة اللوحة (مستضيف + جلسة أدمن + ليس «عرض كـ») ويُسجَّل
  في سجل التدقيق — كلمات المرور لا تُسجَّل أبداً.
*/

export type DevAssociationCard = {
  id: number;
  name: string;
  city: string;
  admins: { id: number; username: string }[];
  mosques: { id: number; name: string }[];
};

export async function GET() {
  const gate = await devConsoleGate();
  if (gate) return gate;

  try {
    const [associations, mosques] = await Promise.all([listAssociations(), listMosqueAssignments()]);
    const cards = await Promise.all(
      associations.map(async (a): Promise<DevAssociationCard> => {
        const admins = await listAssociationAdmins(a.id);
        return {
          id: a.id,
          name: a.name,
          city: a.city,
          admins: admins.map((x) => ({ id: x.id, username: x.username })),
          mosques: mosques.filter((m) => m.associationId === a.id).map((m) => ({ id: m.id, name: m.name })),
        };
      }),
    );
    return Response.json({ associations: cards, mosques });
  } catch (error) {
    await logServerError("dev:associations", error);
    return Response.json({ error: "تعذّر تحميل الجمعيات" }, { status: 500 });
  }
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}

export async function POST(request: Request) {
  const gate = await devConsoleGate();
  if (gate) return gate;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const bad = (error: string, status = 400) => Response.json({ error }, { status });

  try {
    switch (body.action) {
      case "create": {
        const parsed = parseAssociationBody(body);
        if (!parsed.ok) return bad(parsed.error);
        const created = await createAssociation(parsed.name, parsed.city);
        await logDevAction("association_create", "association", created.id, { name: created.name });
        return Response.json({ ok: true, association: created });
      }
      case "update": {
        const id = positiveInt(body.id);
        const parsed = parseAssociationBody(body);
        if (id === null) return bad("جمعية غير صالحة");
        if (!parsed.ok) return bad(parsed.error);
        const updated = await updateAssociation(id, parsed.name, parsed.city);
        if (!updated) return bad("الجمعية غير موجودة", 404);
        await logDevAction("association_update", "association", id, { name: updated.name });
        return Response.json({ ok: true, association: updated });
      }
      case "delete": {
        const id = positiveInt(body.id);
        if (id === null) return bad("جمعية غير صالحة");
        if (!(await deleteAssociation(id))) return bad("الجمعية غير موجودة", 404);
        await logDevAction("association_delete", "association", id);
        return Response.json({ ok: true });
      }
      case "assign": {
        const mosqueId = positiveInt(body.mosqueId);
        const associationId = body.associationId === null ? null : positiveInt(body.associationId);
        if (mosqueId === null || (body.associationId !== null && associationId === null)) return bad("بيانات الإسناد غير صالحة");
        if (!(await getMosque(mosqueId))) return bad("الجامع غير موجود", 404);
        if (associationId !== null && !(await getAssociation(associationId))) return bad("الجمعية غير موجودة", 404);
        await setMosqueAssociation(mosqueId, associationId);
        await logDevAction("association_assign_mosque", "mosque", mosqueId, { associationId });
        return Response.json({ ok: true });
      }
      case "create_admin": {
        const associationId = positiveInt(body.associationId);
        const parsed = parseAssociationAdminBody(body);
        if (associationId === null) return bad("جمعية غير صالحة");
        if (!parsed.ok) return bad(parsed.error);
        if (!(await getAssociation(associationId))) return bad("الجمعية غير موجودة", 404);
        const result = await createAssociationAdmin(associationId, parsed.username, hashPassword(parsed.password));
        if (!result.ok) return bad(result.error, 409);
        await logDevAction("association_admin_create", "association", associationId, { username: parsed.username });
        return Response.json({ ok: true, admin: { id: result.admin.id, username: result.admin.username } });
      }
      case "reset_password": {
        const adminId = positiveInt(body.adminId);
        const password = typeof body.password === "string" ? body.password : "";
        if (adminId === null) return bad("حساب غير صالح");
        if (password.length < 8 || password.length > 200) return bad("كلمة المرور من ٨ أحرف إلى ٢٠٠");
        if (!(await resetAssociationAdminPassword(adminId, hashPassword(password)))) return bad("الحساب غير موجود", 404);
        await logDevAction("association_admin_reset_password", "association_admin", adminId);
        return Response.json({ ok: true });
      }
      default:
        return bad("إجراء غير معروف");
    }
  } catch (error) {
    await logServerError("dev:associations:post", error);
    return Response.json({ error: "تعذّر تنفيذ الإجراء" }, { status: 500 });
  }
}
