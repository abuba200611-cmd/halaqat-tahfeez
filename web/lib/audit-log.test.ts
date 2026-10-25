import { describe, expect, it } from "vitest";
import { buildSecurityAuditEntry, identifierFingerprint, sanitizeAuditDetails } from "./audit-log-entry";

describe("audit-log entry", () => {
  it("يبني action ببادئة security. والهدف من الفاعل", () => {
    const entry = buildSecurityAuditEntry({ event: "login.success", actorKind: "teacher", actorId: 7, ip: "1.2.3.4" });
    expect(entry).toEqual({
      action: "security.login.success",
      targetKind: "teacher",
      targetId: "7",
      details: { ip: "1.2.3.4" },
    });
  });

  it("بلا فاعل معروف = '-'", () => {
    expect(buildSecurityAuditEntry({ event: "login.failure", actorKind: "unknown" }).targetId).toBe("-");
    expect(buildSecurityAuditEntry({ event: "login.failure", actorKind: "unknown", actorId: "" }).targetId).toBe("-");
  });

  it("المعرّف المُدخَل يُخزَّن بصمةً لا نصاً", () => {
    const entry = buildSecurityAuditEntry({
      event: "login.failure",
      actorKind: "unknown",
      identifier: "Someone@Example.com",
    });
    expect(JSON.stringify(entry)).not.toContain("someone");
    expect(entry.details.idFp).toBe(identifierFingerprint("someone@example.com"));
    expect(String(entry.details.idFp)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("يُسقط المفاتيح الحسّاسة ويقصّ النصوص", () => {
    const out = sanitizeAuditDetails({
      password: "x",
      newPassword: "y",
      resetCode: "123456",
      token: "t",
      sessionCookie: "c",
      reason: "a".repeat(500),
      count: 3,
      ok: true,
      nested: { a: 1 },
      skip: undefined,
    });
    expect(out).toEqual({ reason: "a".repeat(200), count: 3, ok: true, nested: '{"a":1}' });
  });
});
