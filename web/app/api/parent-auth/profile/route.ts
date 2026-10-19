import { currentParent, parentUnauthorized } from "@/lib/parent-auth";
import { updateParentName } from "@/lib/parent-db";
import { handleNameChange } from "@/lib/name-change";

/** تعديل اسم ولي الأمر — المعرّف من الجلسة حصراً، والجسم `{ name }` فقط */
export async function PATCH(request: Request) {
  const parent = await currentParent();
  if (!parent) return parentUnauthorized();

  return handleNameChange(request, {
    scope: "parent",
    sessionId: parent.id,
    apply: (name) => updateParentName(parent.id, name),
  });
}
