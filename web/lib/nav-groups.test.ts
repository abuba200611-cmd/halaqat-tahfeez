import { describe, expect, it } from "vitest";
import {
  computeVisible,
  flattenNav,
  groupByField,
  groupKey,
  parseNavState,
  toggleCollapsed,
  toggleExpanded,
  type NavGroup,
} from "./nav-groups";

const items = ["a", "b", "c", "d", "e"].map((href) => ({ href }));
const group: NavGroup<{ href: string }> = { title: "T", items, collapsible: true, initialVisible: 3 };
const active = (h: string) => (i: { href: string }) => i.href === h;

describe("computeVisible", () => {
  it("يعرض initialVisible ثم زر المزيد", () => {
    const v = computeVisible(group, undefined);
    expect(v.items).toHaveLength(3);
    expect(v.hiddenCount).toBe(2);
    expect(v.showToggle).toBe(true);
  });
  it("يعرض الكل عند التوسيع", () => {
    const v = computeVisible(group, { expanded: true });
    expect(v.items).toHaveLength(5);
    expect(v.showToggle).toBe(true);
    expect(v.hiddenCount).toBe(0);
  });
  it("لا زر مزيد إن كانت العناصر أقل من الحد", () => {
    expect(computeVisible({ ...group, initialVisible: 5 }, undefined).showToggle).toBe(false);
  });
  it("الطيّ يخفي العناصر", () => {
    const v = computeVisible(group, { collapsed: true });
    expect(v.collapsed).toBe(true);
    expect(v.items).toEqual([]);
  });
  it("العنصر النشط لا يُخفى بالطيّ ولا بالحد", () => {
    expect(computeVisible(group, { collapsed: true }, active("a")).collapsed).toBe(false);
    const v = computeVisible(group, undefined, active("e"));
    expect(v.items.map((i) => i.href)).toEqual(["a", "b", "c", "e"]);
    expect(v.hiddenCount).toBe(1);
  });
  it("القسم غير القابل للطيّ أو المثبّت يتجاهل الطيّ", () => {
    expect(computeVisible({ ...group, collapsible: false }, { collapsed: true }).collapsed).toBe(false);
    expect(computeVisible({ ...group, pinned: true }, { collapsed: true }).items).toHaveLength(5);
  });
});

describe("state helpers", () => {
  it("parseNavState يتحمّل المدخلات التالفة", () => {
    expect(parseNavState(null)).toEqual({});
    expect(parseNavState("{bad")).toEqual({});
    expect(parseNavState("[1]")).toEqual({});
    expect(parseNavState('{"x":{"collapsed":true},"y":5}')).toEqual({ x: { collapsed: true, expanded: false } });
  });
  it("التبديل لا يغيّر الأصل", () => {
    const s = {};
    const t = toggleCollapsed(s, "k");
    expect(t.k.collapsed).toBe(true);
    expect(toggleCollapsed(t, "k").k.collapsed).toBe(false);
    expect(toggleExpanded(t, "k").k).toEqual({ collapsed: true, expanded: true });
    expect(s).toEqual({});
  });
  it("groupKey وflattenNav", () => {
    expect(groupKey({ id: "i", title: "t", items: [] }, 0)).toBe("i");
    expect(groupKey({ title: "t", items: [] }, 0)).toBe("t");
    expect(groupKey({ items: [] }, 2)).toBe("group-2");
    expect(flattenNav([group, { items: [{ href: "z" }] }])).toHaveLength(6);
  });
  it("groupByField يوزّع ويحذف الفارغ", () => {
    const g = groupByField([{ group: "b" }, {}, { group: "zzz" }], [{ id: "a" }, { id: "b" }, { id: "c" }]);
    expect(g.map((x) => [x.id, x.items.length])).toEqual([["a", 2], ["b", 1]]);
  });
});
