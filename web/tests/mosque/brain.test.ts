import { describe, expect, it } from "vitest";
import { parseLinks, parseNoteFile, slugify } from "@/lib/mosque/brain";

describe("slugify — عربي آمن", () => {
  it("يبقي الحروف العربية والفراغات شرَطات", () => {
    expect(slugify("خطة الحلقات")).toBe("خطة-الحلقات");
    expect(slugify("  المراجعة   الأسبوعية ")).toBe("المراجعة-الأسبوعية");
  });

  it("يبقي اللاتينية والأرقام ويصغّرها، ويحذف الرموز", () => {
    expect(slugify("Ramadan 2026!")).toBe("ramadan-2026");
    expect(slugify("خطة_الحلقات")).toBe("خطة-الحلقات");
  });

  it("نص بلا حروف يعطي سلَغاً فارغاً", () => {
    expect(slugify("///")).toBe("");
    expect(slugify("   ")).toBe("");
  });
});

describe("parseLinks — وصلات [[المزدوجة]]", () => {
  it("يستخرج السَلَغات فريدة بترتيب الظهور", () => {
    const body = "راجع [[خطة الحلقات]] ثم [[المراجعة الأسبوعية]] ورجع لـ[[خطة الحلقات]]";
    expect(parseLinks(body)).toEqual(["خطة-الحلقات", "المراجعة-الأسبوعية"]);
  });

  it("يقبل السَلَغ الجاهز كما هو", () => {
    expect(parseLinks("راجع [[خطة-الحلقات]]")).toEqual(["خطة-الحلقات"]);
  });

  it.each(["نص عادي", "[وصلة واحدة]", "[]", "[[]]"])("لا وصلات في %s", (text) => {
    expect(parseLinks(text)).toEqual([]);
  });
});

describe("parseNoteFile — ملفات الاستيراد", () => {
  it("العنوان من أول Heading والوسوم من سطر tags: أول الملف", () => {
    const note = parseNoteFile("anything.md", "tags: خطة, أطفال\n\n# خطة الحلقات\n\nالمحتوى");
    expect(note.title).toBe("خطة الحلقات");
    expect(note.slug).toBe("خطة-الحلقات");
    expect(note.tags).toEqual(["خطة", "أطفال"]);
    expect(note.body).not.toContain("tags:");
    expect(note.body).toContain("# خطة الحلقات");
  });

  it("بلا Heading: العنوان من اسم الملف", () => {
    const note = parseNoteFile("قواعد السلوك.md", "tags: تنظيم\nالنص فقط");
    expect(note.title).toBe("قواعد السلوك");
    expect(note.slug).toBe("قواعد-السلوك");
    expect(note.tags).toEqual(["تنظيم"]);
  });

  it("بلا سطر وسوم: بلا وسوم، والمحتوى كما هو", () => {
    const note = parseNoteFile("مذكرة.md", "# مذكرة\nنص");
    expect(note.tags).toEqual([]);
    expect(note.body).toContain("نص");
  });
});
