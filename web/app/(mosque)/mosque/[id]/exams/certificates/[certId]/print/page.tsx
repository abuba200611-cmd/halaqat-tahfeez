"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CERTIFICATE_KIND_LABELS, hijriDateLabel, type CertificateKind } from "@/lib/mosque/exams";

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
    <main className="flex min-h-dvh flex-1 flex-col items-center gap-4 bg-slate-100 px-4 py-6">
      <div className="no-print flex w-full max-w-[210mm] items-center justify-between">
        <Link href={`/mosque/${id}/exams`} className="text-sm text-primary hover:underline">
          عودة للاختبارات
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="cursor-pointer rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          طباعة الشهادة
        </button>
      </div>

      {certificate.revokedAt && (
        <p className="no-print w-full max-w-[210mm] rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-800">
          هذه الشهادة مسحوبة — طباعتها لا تعيدها صالحة، وصفحة التحقق تظهر مسحوبة.
        </p>
      )}

      <article
        dir="rtl"
        className="print-block flex w-full max-w-[210mm] flex-col items-center justify-between gap-6 border-[6px] border-double border-emerald-800 bg-white p-10 text-center shadow-sm"
        style={{ aspectRatio: "210 / 297" }}
      >
        <header className="space-y-1">
          <p className="text-lg font-bold text-emerald-900">المملكة العربية السعودية</p>
          <h1 className="font-naskh text-2xl font-bold text-emerald-900">جامع {mosque?.name ?? ""}</h1>
          {mosque?.city && <p className="text-sm text-slate-600">{mosque.city}</p>}
        </header>

        <div className="space-y-4">
          <h2 className="font-naskh text-3xl font-bold text-slate-900">{CERTIFICATE_KIND_LABELS[certificate.kind]}</h2>
          <div className="mx-auto h-1 w-40 rounded bg-emerald-700" />
          <p className="text-base text-slate-700">تشهد إدارة الجامع بأن المذكور اسمه أدناه:</p>
          <p className="font-naskh text-4xl font-bold text-emerald-900">{certificate.holderName}</p>
          <p className="max-w-prose text-lg leading-relaxed text-slate-800">{certificate.title}</p>
          {certificate.payload.period && <p className="text-sm text-slate-600">خلال الفترة: {certificate.payload.period}</p>}
          {certificate.payload.academicYear && <p className="text-sm text-slate-600">للعام الدراسي: {certificate.payload.academicYear}</p>}
        </div>

        <div className="w-full space-y-6">
          <p className="tabular text-sm text-slate-600">
            بتاريخ {hijri}، الموافق {certificate.issuedAt}م
          </p>
          <div className="flex items-end justify-between text-sm text-slate-700">
            <div className="flex-1 space-y-8 px-2">
              <p>مدير الجامع</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-400">التوقيع</p>
            </div>
            <div className="flex-1 space-y-8 px-2">
              <p>الختم الرسمي</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-400"> </p>
            </div>
            <div className="flex-1 space-y-8 px-2">
              <p>رئيس لجنة الاختبار</p>
              <p className="border-t border-slate-400 pt-1 text-xs text-slate-400">التوقيع</p>
            </div>
          </div>
          <p className="text-xs text-slate-400">
            للتحقق من صلاحية هذه الشهادة: رمزها {certificate.code} عبر صفحة التحقق العامة
          </p>
        </div>
      </article>
    </main>
  );
}
