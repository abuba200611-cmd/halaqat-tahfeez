"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Badge, Button, Card, Empty } from "@/components/ui";
import { PushToggle } from "@/components/push-toggle";
import { ReviewTrackSelect } from "@/components/review-track-bits";
import { WardErrorGrader } from "@/components/ward-error-grader";
import type { ErrorCounts, ErrorGradingConfig } from "@/lib/error-grading";
import { juzLabel, juzesOfRange } from "@/lib/quran";
import { pageRangeOfAyahRange } from "@/lib/quran-surahs";
import { formatAyahRange, formatReviewSegments } from "@/lib/ward-ayah";
import { kubraWindow, reviewTextWithTracks, suggestReviewTrackFor } from "@/lib/review-tracks";
import type { AyahRange, PageRange, ReviewTrack, WardLog, WardStatus } from "@/lib/types";

const STATUS_LABEL: Record<WardStatus, string> = {
  new: "جديد",
  seen: "مطّلع عليه",
  approved: "معتمد",
  needs_revision: "يحتاج إعادة",
};

/** زميل المراجعة (STEP 56) — تسمية حالة التأكيد */
const BUDDY_STATUS_LABEL: Record<"pending" | "confirmed" | "declined", string> = {
  pending: "بانتظار",
  confirmed: "مؤكَّد",
  declined: "مرفوض",
};

function statusTone(status: WardStatus): "neutral" | "good" | "warn" {
  if (status === "approved") return "good";
  if (status === "new") return "warn";
  return "neutral";
}

/** الحفظ يبقى نطاقاً واحداً دائماً. الأوراد الجديدة (STEP 49) تعرض السورة/الآية؛ القديمة (بلا سورة محفوظة) تظل تُعرض بالصفحات كما كانت دائماً */
function rangeText(range: PageRange | null, ayahRange: AyahRange | null): string | null {
  if (ayahRange) return formatAyahRange(ayahRange);
  if (!range) return null;
  return `صفحة ${range.from}–${range.to} · ${juzLabel(juzesOfRange(range.from, range.to))}`;
}

/** المراجعة: تفضّل مقاطع STEP 52 (مهما كان عددها)، ثم نطاق STEP 49 القديم بمقطع واحد، ثم الصفحات المجرّدة لأقدم الأوراد */
function reviewRangeText(ward: WardLog): string | null {
  if (ward.reviewSegments && ward.reviewSegments.length > 0) return formatReviewSegments(ward.reviewSegments);
  return rangeText(ward.review, ward.reviewAyah);
}

const REVISION_NOTE_MAX = 500;

export default function InboxPage() {
  const [wards, setWards] = useState<WardLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlyNew, setOnlyNew] = useState(false);

  // حالة نموذج "طلب إعادة" — ورد واحد مفتوح كحد أقصى في كل مرة
  const [revisionOpenId, setRevisionOpenId] = useState<number | null>(null);
  const [revisionNote, setRevisionNote] = useState("");
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [revisionError, setRevisionError] = useState<string | null>(null);

  // B3: مسوّدة تصنيف المقاطع (الكبرى/الصغرى) — معرّف الورد ← قيمة كل مقطع
  const [trackDrafts, setTrackDrafts] = useState<Record<number, (ReviewTrack | null)[]>>({});
  const [trackBusyId, setTrackBusyId] = useState<number | null>(null);
  const [trackError, setTrackError] = useState<string | null>(null);

  // تقييم نقاط الأخطاء: يظهر فقط إن فعّل الجامع الميزة (وإلا تبقى الواجهة كما هي)
  const [gradingConfig, setGradingConfig] = useState<ErrorGradingConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/wards/grade")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { enabled?: boolean; config?: ErrorGradingConfig } | null) => {
        if (!cancelled && data?.enabled && data.config) setGradingConfig(data.config);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  function onGraded(id: number, grade: { score: number; band: string; counts: ErrorCounts }) {
    setWards((prev) =>
      prev.map((w) =>
        w.id === id ? { ...w, errorScore: grade.score, errorBand: grade.band, errorCounts: grade.counts } : w,
      ),
    );
  }

  const load = useCallback(() => {
    fetch("/api/wards")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { wards?: WardLog[] } | null) => {
        if (data) setWards(data.wards ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const newCount = useMemo(() => wards.filter((w) => w.status === "new").length, [wards]);
  const shown = onlyNew ? wards.filter((w) => w.status === "new") : wards;

  async function setStatus(id: number, status: WardStatus) {
    // تحديث متفائل ثم مزامنة
    setWards((prev) => prev.map((w) => (w.id === id ? { ...w, status } : w)));
    try {
      await fetch("/api/wards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
    } catch {
      load();
    }
  }

  function openRevisionForm(id: number) {
    setRevisionOpenId(id);
    setRevisionNote("");
    setRevisionError(null);
  }

  function closeRevisionForm() {
    setRevisionOpenId(null);
    setRevisionNote("");
    setRevisionError(null);
  }

  /**
   * B3: يفتح مسوّدة التصنيف — القيم المخزَّنة كما هي، وكل مقطع بلا قيمة
   * مخزَّنة يُعبَّى مسبقاً بالاقتراح (يغيّره المعلّم قبل «حفظ التصنيف» إن
   * شاء). بهذه الصفحة لا سجلّ حفظ كامل للطالب — حفظ هذا الورد نفسه هو
   * آخر نطاق معروف، فيحدّد الاتجاهَ قاعدةُ النصف الثاني من المصحف وحدها.
   */
  function openTrackDraft(ward: WardLog) {
    const count = ward.reviewSegments?.length ?? 0;
    const kubra = kubraWindow([ward.hifz]);
    setTrackDrafts((prev) => ({
      ...prev,
      [ward.id]: Array.from({ length: count }, (_, i) => {
        const stored = ward.reviewSegmentTracks?.[i] ?? null;
        if (stored) return stored;
        const segment = ward.reviewSegments?.[i];
        const pages =
          ward.reviewSegmentPages?.[i] ??
          (segment ? pageRangeOfAyahRange(segment.fromSurah, segment.fromAyah, segment.toSurah, segment.toAyah) : null);
        return pages ? suggestReviewTrackFor(pages, kubra) : null;
      }),
    }));
    setTrackError(null);
  }

  /** B3: يحفظ التصنيفات — مسموح فقط قبل قرار المعلّم، والخطأ يظهر ولا يغيّر شيء */
  async function saveTrackDraft(id: number) {
    const draft = trackDrafts[id];
    if (!draft) return;
    setTrackBusyId(id);
    setTrackError(null);
    try {
      const res = await fetch("/api/wards/track", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, tracks: draft }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setTrackError(data.error ?? "تعذّر حفظ التصنيف");
        return;
      }
      setWards((prev) => prev.map((w) => (w.id === id ? { ...w, reviewSegmentTracks: draft } : w)));
      setTrackDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch {
      setTrackError("تعذّر الاتصال بالخادم");
    } finally {
      setTrackBusyId(null);
    }
  }

  /** طلب إعادة له تدفق خاص (يتطلّب ملاحظة، ويعرض الخطأ صراحة) — لا يشارك setStatus أعلاه */
  async function submitRevision(id: number) {
    const note = revisionNote.trim();
    if (!note) {
      setRevisionError("اكتب ملاحظة توضّح سبب طلب الإعادة");
      return;
    }
    setRevisionBusy(true);
    setRevisionError(null);
    try {
      const res = await fetch("/api/wards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status: "needs_revision", note }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setRevisionError(data.error ?? "تعذّر إرسال طلب الإعادة");
        return;
      }
      setWards((prev) =>
        prev.map((w) => (w.id === id ? { ...w, status: "needs_revision", reviewNote: note } : w)),
      );
      closeRevisionForm();
    } catch {
      setRevisionError("تعذّر الاتصال بالخادم");
    } finally {
      setRevisionBusy(false);
    }
  }

  if (loading) {
    return <Empty title="جارٍ تحميل الوارد…" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">
          الوارد{" "}
          {newCount > 0 && (
            <span className="tabular text-base font-normal text-accent-ink">({newCount} جديد)</span>
          )}
        </h1>
        <PushToggle />
      </div>

      <p className="no-print text-xs text-muted-foreground">
        إعدادات الحلقة (زميل المراجعة، زملاء الحلقة) انتقلت إلى{" "}
        <Link href="/settings" className="font-semibold text-accent-ink underline">الإعدادات</Link>.
      </p>

      <div className="flex gap-2">
        {(
          [
            ["all", "الكل"],
            ["new", "الجديدة"],
          ] as const
        ).map(([value, label]) => {
          const on = (value === "new") === onlyNew;
          return (
            <button
              key={value}
              type="button"
              onClick={() => setOnlyNew(value === "new")}
              className={`cursor-pointer rounded-full border px-3 py-1 text-sm transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${
                on
                  ? "border-primary bg-primary text-on-primary"
                  : "border-border bg-surface text-muted-foreground hover:bg-muted"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <Empty
          title={
            onlyNew ? "لا أوراد جديدة — كل شيء مطّلع عليه." : "لم يصل أي ورد من الطلاب بعد."
          }
        />
      ) : (
        <ul className="space-y-2">
          {shown.map((ward) => (
            <Card key={ward.id} className="p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-baseline gap-2">
                  <span className="font-medium">{ward.studentName}</span>
                  <span className="tabular text-xs text-muted-foreground">{ward.date}</span>
                </div>
                <Badge tone={statusTone(ward.status)}>{STATUS_LABEL[ward.status]}</Badge>
              </div>

              {ward.previousAttemptId && (
                <p className="mt-1 text-xs text-muted-foreground">
                  ↩ محاولة معادة بعد طلب إعادة سابق
                </p>
              )}

              {ward.buddy && (
                <p className="mt-1 text-xs text-muted-foreground">
                  🤝 مع: {ward.buddy.name} ({BUDDY_STATUS_LABEL[ward.buddy.status]})
                </p>
              )}

              <div className="mt-2 space-y-0.5 text-sm text-muted-foreground">
                {rangeText(ward.hifz, ward.hifzAyah) && <p>حفظ: {rangeText(ward.hifz, ward.hifzAyah)}</p>}
                {reviewTextWithTracks(ward, reviewRangeText(ward)) && (
                  <p>مراجعة: {reviewTextWithTracks(ward, reviewRangeText(ward))}</p>
                )}
                {ward.note && <p className="text-foreground">«{ward.note}»</p>}
                {ward.status === "needs_revision" && ward.reviewNote && (
                  <p className="text-accent-ink">سبب طلب الإعادة: «{ward.reviewNote}»</p>
                )}
              </div>

              {gradingConfig && <WardErrorGrader ward={ward} config={gradingConfig} onSaved={onGraded} />}

              {(ward.status === "new" || ward.status === "seen") && (
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => setStatus(ward.id, "approved")} className="text-xs">
                      اعتماد
                    </Button>
                    {ward.status === "new" && (
                      <Button
                        variant="ghost"
                        onClick={() => setStatus(ward.id, "seen")}
                        className="text-xs"
                      >
                        اطّلعت
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      onClick={() =>
                        revisionOpenId === ward.id ? closeRevisionForm() : openRevisionForm(ward.id)
                      }
                      className="text-xs"
                    >
                      طلب إعادة
                    </Button>
                  </div>

                  {(ward.reviewSegments?.length ?? 0) > 0 && !trackDrafts[ward.id] && (
                    <Button variant="ghost" onClick={() => openTrackDraft(ward)} className="text-xs">
                      تصنيف المراجعة (الكبرى/الصغرى)
                    </Button>
                  )}

                  {trackDrafts[ward.id] && (
                    <div className="space-y-2 rounded-md border border-border bg-surface p-3">
                      <p className="text-xs text-muted-foreground">
                        صنّف كل مقطع: الكبرى (المراجعة بعد الحفظ الجديد مباشرة، ١٠ صفحات افتراضياً) أو الصغرى (ما بعد الكبرى
                        من المحفوظ) — الحفظ الجديد نفسه بلا تصنيف.
                      </p>
                      <ul className="space-y-1.5">
                        {ward.reviewSegments!.map((segment, i) => (
                          <li key={i} className="flex items-center justify-between gap-2 text-sm">
                            <span className="min-w-0 truncate">{formatReviewSegments([segment])}</span>
                            <ReviewTrackSelect
                              id={`inbox-track-${ward.id}-${i}`}
                              value={trackDrafts[ward.id][i] ?? null}
                              onChange={(next) =>
                                setTrackDrafts((prev) => ({
                                  ...prev,
                                  [ward.id]: prev[ward.id].map((t, k) => (k === i ? next : t)),
                                }))
                              }
                            />
                          </li>
                        ))}
                      </ul>
                      <div className="flex items-center justify-between gap-2">
                        {trackError ? (
                          <p className="text-xs text-destructive">{trackError}</p>
                        ) : (
                          <span />
                        )}
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            onClick={() =>
                              setTrackDrafts((prev) => {
                                const next = { ...prev };
                                delete next[ward.id];
                                return next;
                              })
                            }
                            className="text-xs"
                            disabled={trackBusyId === ward.id}
                          >
                            إلغاء
                          </Button>
                          <Button
                            onClick={() => saveTrackDraft(ward.id)}
                            className="text-xs"
                            disabled={trackBusyId === ward.id}
                          >
                            {trackBusyId === ward.id ? "يُحفظ…" : "حفظ التصنيف"}
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {revisionOpenId === ward.id && (
                    <div className="space-y-1 rounded-md border border-border bg-surface p-3">
                      <label className="block text-xs text-muted-foreground">
                        سبب طلب الإعادة (إلزامي)
                        <textarea
                          value={revisionNote}
                          onChange={(e) => setRevisionNote(e.target.value.slice(0, REVISION_NOTE_MAX))}
                          maxLength={REVISION_NOTE_MAX}
                          rows={2}
                          placeholder="مثال: راجع صفحة ٤٥ مرة أخرى، فيها تعثّر واضح"
                          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                        />
                      </label>
                      <div className="flex items-center justify-between">
                        <span className="tabular text-xs text-muted-foreground">
                          {revisionNote.length}/{REVISION_NOTE_MAX}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            onClick={closeRevisionForm}
                            className="text-xs"
                            disabled={revisionBusy}
                          >
                            إلغاء
                          </Button>
                          <Button
                            onClick={() => submitRevision(ward.id)}
                            className="text-xs"
                            disabled={revisionBusy || !revisionNote.trim()}
                          >
                            {revisionBusy ? "يُرسل…" : "إرسال طلب الإعادة"}
                          </Button>
                        </div>
                      </div>
                      {revisionError && <p className="text-xs text-destructive">{revisionError}</p>}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
