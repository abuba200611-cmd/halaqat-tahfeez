/*
  يستخرج رمز انضمام الجامع مما يلصقه المعلّم: الرابط الكامل
  (…/join-mosque?code=XYZ — صيغة رابط مدير الجامع)، أي رابط فيه
  ?code= أو ?join= أو مقطع /j/XYZ، أو الرمز وحده. أي شيء آخر = null.
  دالة نقية — تعمل في العميل بلا اعتماد على الخادم.
*/

const CODE_PATTERN = /^[A-Za-z0-9_-]{4,64}$/;

function asCode(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return CODE_PATTERN.test(trimmed) ? trimmed : null;
}

export function parseMosqueJoinInput(raw: string): string | null {
  const input = (raw ?? "").trim();
  if (!input) return null;

  // رمز وحده (بلا مسافات ولا رموز رابط)
  const bare = asCode(input);
  if (bare) return bare;

  // رابط: بروتوكول صريح، أو نطاق بلا بروتوكول (مثل halaqa.app/join-mosque?code=…)
  const candidates = /^[a-z][a-z0-9+.-]*:\/\//i.test(input) ? [input] : [`https://${input}`];
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;

    const fromQuery = asCode(url.searchParams.get("code")) ?? asCode(url.searchParams.get("join"));
    if (fromQuery) return fromQuery;

    const segments = url.pathname.split("/").filter(Boolean);
    const at = segments.indexOf("j");
    if (at !== -1) {
      const fromPath = asCode(segments[at + 1]);
      if (fromPath) return fromPath;
    }
  }
  return null;
}
