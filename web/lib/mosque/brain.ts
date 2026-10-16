/*
  الدماغ — دوال صرفة (بلا خادم ولا قاعدة بيانات) يشاركها مُنشئ الرسم
  وسكربت الاستيراد والاختبارات: سَلَغة عربية آمنة، تحليل وصلات
  [[المزدوجة]]، وتحليل ملفات الاستيراد.
*/

/** سَلَغ عربي آمن: يُبقي الحروف (عربية/لاتينية) والأرقام، والفراغات شرَطات */
export function slugify(input: string): string {
  return input
    .trim()
    .replace(/[\s_]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

/** كل الوصلات الداخلية [[عنوان]] أو [[سَلَغ]] في نص — سَلَغات فريدة بترتيب الظهور */
export function parseLinks(body: string): string[] {
  const slugs: string[] = [];
  for (const match of body.matchAll(/\[\[([^\[\]]+)\]\]/g)) {
    const slug = slugify(match[1]);
    if (slug && !slugs.includes(slug)) slugs.push(slug);
  }
  return slugs;
}

// ————— تحليل ملفات الاستيراد (mosques-data/<جامع>/*.md) —————

export type ParsedNote = { title: string; slug: string; tags: string[]; body: string };

/**
 * ملف .md واحد إلى ملاحظة: العنوان من أول سطر "# " أو من اسم الملف،
 * والوسوم من سطر "tags: أ، ب" أول الملف (يُحذف من المحتوى)، والباقي
 * محتوى كما هو.
 */
export function parseNoteFile(filename: string, content: string): ParsedNote {
  let body = content.replace(/\r\n/g, "\n");
  let tags: string[] = [];

  const lines = body.split("\n");
  const first = lines.findIndex((line) => line.trim());
  if (first !== -1) {
    const tagsMatch = /^tags:\s*(.*)$/.exec(lines[first].trim());
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(/[,،]/)
        .map((tag) => tag.trim())
        .filter(Boolean);
      lines.splice(first, 1);
      body = lines.join("\n");
    }
  }

  const heading = /^#\s+(.+)$/m.exec(body);
  const title = (heading?.[1] ?? filename.replace(/\.md$/i, "")).trim();

  return { title, slug: slugify(title), tags, body: body.trim() };
}
