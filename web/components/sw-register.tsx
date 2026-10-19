"use client";

import { useEffect } from "react";

/*
  يسجّل عامل الخدمة (/sw.js) مرة واحدة على مستوى التطبيق. الإنتاج فقط:
  في التطوير تتغير أسماء ملفات _next/static بلا هاش فلا نريد تخزينها.
  مفاتيح الإشعارات (push-toggle…) تسجّل الملف نفسه بنفس النطاق — التسجيل المتكرر آمن.
*/
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* فشل التسجيل لا يؤثر على عمل الموقع */
    });
  }, []);
  return null;
}
