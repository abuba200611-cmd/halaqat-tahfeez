import { describe, expect, it } from "vitest";
import { splitBottomNav } from "./bottom-nav";

describe("splitBottomNav — لا عنصر تنقّل يضيع على الجوال", () => {
  it("5 عناصر أو أقل: كلها مباشرة بلا «المزيد»", () => {
    expect(splitBottomNav([1, 2, 3, 4, 5])).toEqual({ primary: [1, 2, 3, 4, 5], overflow: [] });
    expect(splitBottomNav([1, 2])).toEqual({ primary: [1, 2], overflow: [] });
  });

  it("أكثر من 5: أول 4 مباشرة (الخانة الخامسة للمزيد) والباقي بالورقة", () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const { primary, overflow } = splitBottomNav(items);
    expect(primary).toEqual([1, 2, 3, 4]);
    expect(overflow).toEqual([5, 6, 7, 8, 9, 10]);
    expect([...primary, ...overflow]).toEqual(items);
  });
});
