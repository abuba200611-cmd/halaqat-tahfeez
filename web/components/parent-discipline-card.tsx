"use client";

import { useEffect, useState } from "react";
import { eventLabel, type DisciplineEventKind } from "@/lib/discipline";

/*
  A2 — أحداث انضباط الابن كما يراها ولي أمره (إنذارات/استدعاءات/مخالفات
  مجرّدة من تفاصيلها الإدارية). صامتة عند الفشل — لا تعطّل بقية اللوحة،
  وتختفي كلياً حين لا أحداث أو حين الانضباط معطّل بجامع الحلقة.
*/

type ChildRef = { halaqahId: number; studentId: string };

type ParentEvent = {
  id: number;
  kind: DisciplineEventKind;
  level: number;
  reason: string;
  createdAt: string;
};

export function ParentDisciplineCard({ child }: { child: ChildRef }) {
  const [events, setEvents] = useState<ParentEvent[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/parent/discipline?halaqah=${child.halaqahId}&student=${encodeURIComponent(child.studentId)}`)
      .then((res) => (res.ok ? res.json() : { events: [] }))
      .then((data: { events?: ParentEvent[] }) => {
        if (!cancelled) setEvents(data.events ?? []);
      })
      .catch(() => {
        if (!cancelled) setEvents([]);
      });
    return () => {
      cancelled = true;
    };
  }, [child.halaqahId, child.studentId]);

  if (events === null || events.length === 0) return null;

  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-700">الانضباط والمتابعة</h2>
      <ul className="space-y-2">
        {events.map((event) => (
          <li key={event.id} className="rounded-2xl border border-slate-200 bg-white p-3.5">
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-slate-800">{eventLabel(event.kind, event.level)}</span>
              <span className="tabular text-xs text-slate-500">{event.createdAt.slice(0, 10)}</span>
            </div>
            {event.reason && <p className="text-sm text-slate-600">{event.reason}</p>}
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">للتواصل والتفاصيل، راجع معلّم الحلقة.</p>
    </section>
  );
}
