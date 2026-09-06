import { describe, expect, it } from "vitest";
import { clientIp } from "./link-auth";

/*
  clientIp() هنا هي الدالة الحقيقية التي يستدعيها requireLinkSecret فعلياً
  لكل المسارات الستة تحت /api/link — لا نسخة معزولة بملف الاختبار. النسخ
  الست القائمة بمسارات المصادقة (auth/login وغيرها) مستقلة ولا تُختبَر هنا.
*/

function request(headers: Record<string, string> = {}): Request {
  return new Request("https://example.com/api/link/stats", { headers });
}

describe("clientIp", () => {
  it("يأخذ أول عنوان عند تعدّد القيم بفاصلة", () => {
    expect(clientIp(request({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("يزيل المسافات الزائدة حول العنوان", () => {
    expect(clientIp(request({ "x-forwarded-for": "  1.2.3.4  , 5.6.7.8" }))).toBe("1.2.3.4");
  });

  it("يرجع عنواناً واحداً بلا فاصلة كما هو", () => {
    expect(clientIp(request({ "x-forwarded-for": "9.9.9.9" }))).toBe("9.9.9.9");
  });

  it("يرجع 'unknown' لو الترويسة فارغة", () => {
    expect(clientIp(request({ "x-forwarded-for": "" }))).toBe("unknown");
  });

  it("يرجع 'unknown' لو الترويسة غائبة تماماً", () => {
    expect(clientIp(request())).toBe("unknown");
  });
});
