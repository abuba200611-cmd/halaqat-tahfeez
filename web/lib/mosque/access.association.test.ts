import { describe, expect, it, vi } from "vitest";

/*
  A3 — جلسة مدير الجمعية لا تمنح أي صلاحية على جامع: canAccessMosque (الذي
  تمرّ به كل مسارات القراءة والتعديل لمزايا الجامع) لا يعرف كوكيها أصلاً.
*/

const associationSession = vi.hoisted(() => ({ currentAssociationAdmin: vi.fn() }));
vi.mock("@/lib/association-auth", () => associationSession);
vi.mock("./admin-auth", () => ({ isAdmin: vi.fn(async () => false) }));
vi.mock("@/lib/mosque-auth", () => ({ currentMosqueAdmin: vi.fn(async () => null) }));

const { canAccessMosque } = await import("./access");

describe("canAccessMosque", () => {
  it("مدير جمعية بجلسة صالحة (بلا جلسة جامع/أدمن) ممنوع من أي جامع، ولو كان من جوامعه", async () => {
    associationSession.currentAssociationAdmin.mockResolvedValue({ id: 1, associationId: 1, username: "a", sessionVersion: 0 });
    expect(await canAccessMosque(10)).toBe(false);
    expect(await canAccessMosque(20)).toBe(false);
    expect(associationSession.currentAssociationAdmin).not.toHaveBeenCalled();
  });
});
