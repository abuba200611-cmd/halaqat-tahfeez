import { describe, expect, it } from "vitest";

import { DEV_CENTER_ID, DEV_NAV_ITEMS, DEV_SETTINGS_ITEM, splitDevMobileNav } from "./dev-nav";

describe("splitDevMobileNav — شريط لوحة المطوّر السفلي", () => {
  const split = splitDevMobileNav();

  it("الشريط: نظرة عامة والجوامع وطلبات الجوامع فقط", () => {
    expect(split.bar.map((i) => i.id)).toEqual(["overview", "mosques", "mosque-requests"]);
  });

  it("زر الفتحة بالمنتصف = البلاغات", () => {
    expect(split.center?.id).toBe(DEV_CENTER_ID);
    expect(split.center?.href).toBe("/dev/reports");
  });

  it("ورقة «المزيد»: كل ما تبقّى بما فيه الإعدادات — لا عنصر يضيع ولا يتكرر", () => {
    const all = [...split.bar, ...(split.center ? [split.center] : []), ...split.more];
    const full = [...DEV_NAV_ITEMS, DEV_SETTINGS_ITEM];
    expect(all.map((i) => i.id).sort()).toEqual(full.map((i) => i.id).sort());
    expect(new Set(all.map((i) => i.id)).size).toBe(all.length);
    expect(split.more.map((i) => i.id)).toContain("settings");
  });

  it("البلاغات لا تتكرر: ليست بالشريط ولا داخل «المزيد»", () => {
    expect(split.bar.some((i) => i.id === DEV_CENTER_ID)).toBe(false);
    expect(split.more.some((i) => i.id === DEV_CENTER_ID)).toBe(false);
  });

  it("قائمة أقصر من المعتاد: يُقسَّم ما وجد فقط بلا رمي", () => {
    const partial = splitDevMobileNav([
      { id: "overview", href: "/dev", label: "نظرة عامة" },
      { id: "users", href: "/dev/users", label: "المستخدمون" },
    ]);
    expect(partial.bar.map((i) => i.id)).toEqual(["overview"]);
    expect(partial.center).toBeNull();
    expect(partial.more.map((i) => i.id)).toEqual(["users"]);
  });
});
