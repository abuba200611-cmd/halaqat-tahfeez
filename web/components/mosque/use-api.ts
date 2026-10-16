"use client";

import { useEffect, useState } from "react";

/*
  جلب JSON من مسارات النظام بحالة بسيطة: data (آخر نجاح)، status (آخر رمز HTTP،
  0 عند فشل الشبكة)، loading، وreload() لإعادة الجلب بعد أي تعديل. dataKey يتغيّر
  فقط حين تصل بيانات جديدة — لتُستخدم كـ key لمكوّنات تُهيّأ حالتها من البيانات.
*/
export function useApi<T>(url: string | null) {
  const [version, setVersion] = useState(0);
  const [result, setResult] = useState<{ key: string; data: T | null; status: number } | null>(null);
  const key = `${url}#${version}`;

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    fetch(url)
      .then(async (res) => ({ data: res.ok ? ((await res.json()) as T) : null, status: res.status }))
      .catch(() => ({ data: null, status: 0 }))
      .then((outcome) => {
        if (!cancelled) setResult({ key, ...outcome });
      });
    return () => {
      cancelled = true;
    };
  }, [url, key]);

  return {
    data: result?.data ?? null,
    status: result?.status ?? null,
    loading: url !== null && result?.key !== key,
    dataKey: result?.key ?? "",
    reload: () => setVersion((v) => v + 1),
  };
}

export type CallResult<T> = { ok: boolean; status: number; error: string | null; data: T | null };

/** استدعاء مسار تعديل (POST/PATCH/PUT/DELETE) وإرجاع نتيجة موحّدة بلا استثناءات */
export async function callApi<T = Record<string, unknown>>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<CallResult<T>> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    return { ok: res.ok, status: res.status, error: res.ok ? null : (data?.error ?? "تعذّر تنفيذ الطلب"), data };
  } catch {
    return { ok: false, status: 0, error: "تعذّر الاتصال بالخادم", data: null };
  }
}
