import { describe, expect, it } from "vitest";

/*
  M5 — اختبار قواعد مطابقة الهوية الموحّدة النقية (lib/identity-mapping.ts).
  هذه نفس القواعد المطبَّقة في ترحيل 20261027000000_unified_identity وفي
  lib/identity.ts عند إنشاء الحسابات — العقد المشترك بين الثلاثة.
*/

import {
  loginHrefFor,
  mapAssociationAdminIdentity,
  mapMosqueAdminIdentity,
  mapParentIdentity,
  mapStudentIdentity,
  mapSuperAdminIdentity,
  mapTeacherIdentity,
  membershipShell,
  normalizeIdentityEmail,
  parseStudentLegacyId,
  studentHandle,
  studentLegacyId,
  switcherMemberships,
  type SwitchableMembership,
  type SwitcherCandidate,
} from "./identity-mapping";

describe("normalizeIdentityEmail", () => {
  it("يقصّ ويصغّر ويحوّل الفراغ إلى null", () => {
    expect(normalizeIdentityEmail("  Ali@Example.COM ")).toBe("ali@example.com");
    expect(normalizeIdentityEmail(null)).toBeNull();
    expect(normalizeIdentityEmail("   ")).toBeNull();
  });
});

describe("mapTeacherIdentity", () => {
  it("بريد المعلّم من عمود username القديم (بحروف صغيرة) وعضوية بدوره وحلقته", () => {
    const { user, membership } = mapTeacherIdentity({
      id: 7,
      username: "Teacher@Example.com",
      teacherName: "أحمد",
      halaqahId: 3,
      role: "supervisor",
    });
    expect(user).toEqual({ displayName: "أحمد", email: "teacher@example.com", username: null });
    expect(membership).toEqual({
      role: "supervisor",
      mosqueId: null,
      halaqahId: 3,
      studentId: null,
      legacyKind: "teacher",
      legacyId: "7",
      active: true,
    });
  });

  it("الاسم الفارغ يسقط للبريد، والموقوف = عضوية غير فعّالة، والمساعد role=assistant", () => {
    const assistant = mapTeacherIdentity({
      id: 9,
      username: "b@x.com",
      teacherName: "",
      halaqahId: 1,
      role: "assistant",
      deactivatedAt: "2026-10-01",
    });
    expect(assistant.user.displayName).toBe("b@x.com");
    expect(assistant.membership.role).toBe("assistant");
    expect(assistant.membership.active).toBe(false);
  });
});

describe("mapParentIdentity — دمج معلّم+ولي ببريد واحد", () => {
  it("بريد الولي هو مفتاح المستخدم (نفس صيغة معلّم بنفس البريد)", () => {
    const teacher = mapTeacherIdentity({ id: 1, username: "same@x.com", teacherName: "", halaqahId: 2, role: "supervisor" });
    const parent = mapParentIdentity({ id: 5, email: "Same@X.com ", name: "أم محمد" });
    // نفس الشخص: مفتاح البريد متطابق → مستخدم واحد بعضويتين بالترحيل و lib/identity
    expect(parent.user.email).toBe(teacher.user.email);
    expect(parent.membership).toEqual({
      role: "parent",
      mosqueId: null,
      halaqahId: null,
      studentId: null,
      legacyKind: "parent",
      legacyId: "5",
      active: true,
    });
    expect(teacher.membership.legacyKind).toBe("teacher");
  });

  it("اسم فارغ يسقط للبريد", () => {
    const { user } = mapParentIdentity({ id: 2, email: "p@x.com", name: "  " });
    expect(user.displayName).toBe("p@x.com");
  });
});

describe("mapMosqueAdminIdentity", () => {
  it("اسم المستخدم مقبضٌ (ليس بريداً) والعضوية مربوطة بالجامع", () => {
    const { user, membership } = mapMosqueAdminIdentity({ id: 4, mosqueId: 11, username: "Admin.Noor" });
    expect(user).toEqual({ displayName: "Admin.Noor", email: null, username: "Admin.Noor" });
    expect(membership).toEqual({
      role: "mosque_admin",
      mosqueId: 11,
      halaqahId: null,
      studentId: null,
      legacyKind: "mosque_admin",
      legacyId: "4",
      active: true,
    });
  });
});

describe("mapStudentIdentity — المفتاح المركّب", () => {
  it("طالب باسم مستخدم: المقبض اسمه، والعضوية تحمل الحلقة والطالب معاً", () => {
    const { user, membership } = mapStudentIdentity({
      halaqahId: 3,
      id: "abc123",
      name: "خالد",
      username: "khalid01",
      active: true,
    });
    expect(user).toEqual({ displayName: "خالد", email: null, username: "khalid01" });
    expect(membership.role).toBe("student");
    expect(membership.halaqahId).toBe(3);
    expect(membership.studentId).toBe("abc123");
    expect(membership.legacyId).toBe("3:abc123");
    expect(membership.legacyKind).toBe("student");
  });

  it("طالب بلا اسم مستخدم: مقبض اصطناعي فريد مشتق من مفتاحه القديم", () => {
    const { user } = mapStudentIdentity({ halaqahId: 3, id: "abc123", name: "خالد", username: null });
    expect(user.username).toBe("student:3:abc123");
    expect(mapStudentIdentity({ halaqahId: 4, id: "abc123", name: "آخر", username: null }).user.username).not.toBe(
      user.username,
    );
  });

  it("طالب غير نشط = عضوية غير فعّالة", () => {
    expect(mapStudentIdentity({ halaqahId: 1, id: "s", name: "ن", username: "u", active: false }).membership.active).toBe(
      false,
    );
  });
});

describe("studentLegacyId / parseStudentLegacyId / studentHandle", () => {
  it("تشفير وفكّ متطابقان", () => {
    const legacyId = studentLegacyId(12, "deadbeef");
    expect(legacyId).toBe("12:deadbeef");
    expect(parseStudentLegacyId(legacyId)).toEqual({ halaqahId: 12, studentId: "deadbeef" });
    expect(studentHandle(12, "deadbeef")).toBe("student:12:deadbeef");
  });

  it("يفكّ المفاتيح الفاسدة إلى null بلا رمي", () => {
    expect(parseStudentLegacyId("deadbeef")).toBeNull(); // بلا فاصل
    expect(parseStudentLegacyId(":deadbeef")).toBeNull(); // حلقة فارغة
    expect(parseStudentLegacyId("abc:deadbeef")).toBeNull(); // حلقة ليست رقماً
    expect(parseStudentLegacyId("3:")).toBeNull(); // طالب فارغ
    expect(parseStudentLegacyId("0:x")).toBeNull(); // حلقة صفر مستحيلة
  });
});

describe("mapSuperAdminIdentity", () => {
  it("دور developer ومفتاح super_admin", () => {
    const { membership } = mapSuperAdminIdentity({ id: 1, username: "root" });
    expect(membership.role).toBe("developer");
    expect(membership.legacyKind).toBe("super_admin");
    expect(membership.legacyId).toBe("1");
  });
});

describe("مدير جمعية → association_admin", () => {
  it("مستخدم باسم المستخدم وعضوية بلا جامع تشير لصف association_admin القديم", () => {
    expect(mapAssociationAdminIdentity({ id: 6, username: "assoc" })).toEqual({
      user: { displayName: "assoc", email: null, username: "assoc" },
      membership: {
        role: "association_admin",
        mosqueId: null,
        halaqahId: null,
        studentId: null,
        legacyKind: "association_admin",
        legacyId: "6",
        active: true,
      },
    });
  });
});

/*
  قواعد عرض مبدّل الأدوار (switcherMemberships) — جوهر إصلاح «تبديل الدور
  يرسل المعلّم لصفحة ولي أمر بلا دور ولي أمر»: لا يُعرض إلا دور يستطيع
  المستخدم فتحه فعلاً.
*/

function member(overrides: Partial<SwitchableMembership> = {}): SwitchableMembership {
  return {
    id: 10,
    role: "parent",
    legacyKind: "parent",
    legacyId: "9",
    active: true,
    halaqahId: null,
    mosqueId: null,
    halaqahName: null,
    mosqueName: null,
    ...overrides,
  };
}

function candidate(m: SwitchableMembership, live = true, sessionActive = false): SwitcherCandidate {
  return { membership: m, live, sessionActive };
}

const TEACHER = { email: "a@x.com", username: null };

describe("switcherMemberships — أدوار يستطيع فتحها فعلاً فقط", () => {
  it("عضوية ولي أمر بلا جلسة ولي (بريد متطابق فقط) لا تُعرض للمعلّم إطلاقاً", () => {
    const entries = switcherMemberships("teacher", [candidate(member())], TEACHER);
    expect(entries).toEqual([]);
  });

  it("تُعرض فقط إن كانت جلسة من نوعها قائمة على الجهاز — والتنقّل إليها يكفي", () => {
    const entries = switcherMemberships("teacher", [candidate(member(), true, true)], TEACHER);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ switchable: false, sessionActive: true, home: "/parent" });
  });

  it("نفس نوع الجلسة الحالية = تبديل مباشر بلا رابط دخول (معلّم بحلقتين)", () => {
    const second = member({ id: 2, role: "assistant", legacyKind: "teacher", legacyId: "8", halaqahId: 5, halaqahName: "حلقة العصر" });
    const entries = switcherMemberships("teacher", [candidate(second)], TEACHER);
    expect(entries).toEqual([
      expect.objectContaining({ switchable: true, loginHref: null, home: "/", label: "مساعد مشرف — حلقة العصر" }),
    ]);
  });

  it("عضوية موقوفة أو بصف قديم ميت (live=false) مخفية ولو تطابق النوع", () => {
    expect(switcherMemberships("teacher", [candidate(member({ role: "assistant", legacyKind: "teacher" }), false)], TEACHER)).toEqual([]);
    expect(
      switcherMemberships("teacher", [candidate(member({ role: "assistant", legacyKind: "teacher", active: false }))], TEACHER),
    ).toEqual([]);
  });

  it("عضوية المطوّر لا تُعرض أبداً — لا مسار تبديل لها", () => {
    const dev = member({ role: "developer", legacyKind: "super_admin", legacyId: "1" });
    expect(switcherMemberships("teacher", [candidate(dev, true, true)], TEACHER)).toEqual([]);
    expect(switcherMemberships("developer", [candidate(dev, true, true)], TEACHER)).toEqual([]);
  });

  it("عضويتان لنفس الصف القديم (تغيّر دور معلّم) = الأولى تكفي", () => {
    const asAssistant = member({ id: 3, role: "assistant", legacyKind: "teacher", legacyId: "7" });
    const asSupervisor = member({ id: 4, role: "supervisor", legacyKind: "teacher", legacyId: "7", halaqahName: "حلقة الفجر" });
    const entries = switcherMemberships("teacher", [candidate(asAssistant), candidate(asSupervisor)], TEACHER);
    expect(entries).toHaveLength(1);
    expect(entries[0].membership.id).toBe(3);
  });

  it("دور واحد فقط = قائمة فارغة (المكوّن يخفي المبدّل كلياً)", () => {
    expect(switcherMemberships("parent", [], TEACHER)).toEqual([]);
  });
});

describe("membershipShell + loginHrefFor بعد النقل", () => {
  it("وجهات وتسميات الأدوار كما كانت", () => {
    expect(membershipShell(member({ role: "parent" })).home).toBe("/parent");
    expect(membershipShell(member({ role: "student", halaqahName: "حلقة الفجر" })).label).toContain("حلقة الفجر");
  });

  it("رابط دخول المطوّر صفحة الأدمن — لا صفحة الطالب", () => {
    expect(loginHrefFor("developer", TEACHER)).toBe("/admin");
  });
});
