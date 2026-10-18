"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CERTIFICATE_KIND_LABELS, hijriDateLabel, type CertificateKind } from "@/lib/mosque/exams";
import { BrandLogo } from "@/components/brand";

/*
  شهادة قابلة للطباعة A4 — ورقة واحدة RTL بحدود وزخرفة بسيطة، ترويسة
  الجامع واسم الحامل والإنجاز وتاريخ هجري/ميلادي ومكان التوقيعات ورمز
  التحقق. زر الطباعة خارج الورقة (no-print).
*/

type Certificate = {
  id: number;
  code: string;
  kind: CertificateKind;
  holderName: string;
  title: string;
  issuedAt: string;
  revokedAt: string | null;
  payload: Record<string, string>;
};

type MosqueInfo = { name: string; city: string };

export default function CertificatePrintPage() {
  const { id, certId } = useParams<{ id: string; certId: string }>();
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [mosque, setMosque] = useState<MosqueInfo | null>(null);
  const [status, setStatus] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(`/api/mosques/${id}/exams/certificates/${certId}`).then(async (res) => ({ ok: res.ok, status: res.status, body: res.ok ? await res.json() : null })),
      fetch(`/api/mosques/${id}`).then((res) => (res.ok ? res.json() : null)),
    ])
      .then(([cert, mosqueData]) => {
        if (cancelled) return;
        setStatus(cert.ok ? 200 : cert.status);
        if (cert.ok) setCertificate((cert.body as { certificate: Certificate }).certificate);
        if (mosqueData?.mosque) setMosque(mosqueData.mosque as MosqueInfo);
      })
      .catch(() => {
        if (!cancelled) setStatus(0);
      });
    return () => {
      cancelled = true;
    };
  }, [id, certId]);

  if (certificate === null) {
    return (
      <main className="flex min-h-dvh flex-1 items-center justify-center px-4">
        <p className="text-sm text-muted-foreground">
          {status === null ? "جارٍ التحميل…" : status === 401 ? "سجّل دخولك أولاً." : status === 404 ? "الشهادة غير موجودة." : "تعذّر التحميل."}
        </p>
      </main>
    );
  }

  const hijri = hijriDateLabel(certificate.issuedAt);

  return (
    <main className="flex min-h-dvh flex-1 flex-col items-center gap-4 bg-stone-100 px-4 py-6">
      <div className="no-print flex w-full max-w-[210mm] items-center justify-between">
        <Link href={`/mosque/${id}/exams`} className="text-sm text-accent-ink hover:underline">
          عودة للاختبارات
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:opacity-90"
        >
          طباعة الشهادة
        </button>
      </div>

      {certificate.revokedAt && (
        <p className="no-print w-full max-w-[210mm] rounded-xl bg-accent-soft px-4 py-2 text-sm text-accent-ink">
          هذه الشهادة مسحوبة — طباعتها لا تعيدها صالحة، وصفحة التحقق تظهر مسحوبة.
        </p>
      )}

      <article
        dir="rtl"
        className="print-block flex w-full max-w-[210mm] flex-col items-center justify-between gap-6 border-[6px] border-double border-foreground bg-white p-10 text-center shadow-sm"
        style={{ aspectRatio: "210 / 297" }}
      >
        <header className="flex flex-col items-center space-y-1">
          <BrandLogo size={56} />
          <p className="mt-1 text-[10px] text-muted-foreground">السلام — MOS نظام تشغيل الجامع</p>
          <p className="text-lg font-bold text-foreground">المملكة العربية السعودية</p>
          <h1 className="font-display text-2xl font-bold text-foreground">جامع {mosque?.name ?? ""}</h1>
          {mosque?.city && <p className="text-sm text-stone-600">{mosque.city}</p>}
        </header>

        <div className="space-y-4">
          <h2 className="font-display text-3xl font-bold text-foreground">{CERTIFICATE_KIND_LABELS[certificate.kind]}</h2>
          <div className="mx-auto h-1 w-40 rounded bg-secondary" />
          <p className="text-base text-stone-700">تشهد إدارة الجامع بأن المذكور اسمه أدناه:</p>
          <p className="font-display text-4xl font-bold text-foreground">{certificate.holderName}</p>
          <p className="max-w-prose text-lg leading-relaxed text-stone-800">{certificate.title}</p>
          {certificate.payload.period && <p className="text-sm text-stone-600">خلال الفترة: {certificate.payload.period}</p>}
          {certificate.payload.academicYear && <p className="text-sm text-stone-600">للعام الدراسي: {certificate.payload.academicYear}</p>}
        </div>

        <div className="w-full space-y-6">
          <p className="tabular text-sm text-stone-600">
            بتاريخ {hijri}، الموافق {certificate.issuedAt}م
          </p>
          <div className="flex items-end justify-between text-sm text-stone-700">
            <div className="flex-1 space-y-8 px-2">
              <p>مدير الجامع</p>
              <p className="border-t border-stone-400 pt-1 text-xs text-stone-400">التوقيع</p>
            </div>
            <div className="flex-1 space-y-8 px-2">
              <p>الختم الرسمي</p>
              <p className="border-t border-stone-400 pt-1 text-xs text-stone-400"> </p>
            </div>
            <div className="flex-1 space-y-8 px-2">
              <p>رئيس لجنة الاختبار</p>
              <p className="border-t border-stone-400 pt-1 text-xs text-stone-400">التوقيع</p>
            </div>
          </div>
          <p className="text-xs text-stone-400">
            للتحقق من صلاحية هذه الشهادة: رمزها {certificate.code} عبر صفحة التحقق العامة
          </p>
        </div>
      </article>
    </main>
  );
}
