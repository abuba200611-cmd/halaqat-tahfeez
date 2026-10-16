"use client";

import { useState } from "react";
import { PERIODS, WEEK_DAYS, programKindLabel } from "@/lib/mosque/schedule";
import type { ScheduleSlot } from "@/lib/mosque/db";

/*
  شبكة الجدول الأسبوعي المشتركة بين صفحة الإدارة والعرض العام: أيام
  السبت..الجمعة أعمدة (RTL) والفترات صفوف. على الجوال تبويب يوم واحد
  في كل مرة. بلا onAdd/onEdit تُعرض للقراءة فقط.
*/

const cellKey = (day: number, period: string) => `${day}:${period}`;

function sortSlots(slots: ScheduleSlot[]): ScheduleSlot[] {
  return [...slots].sort((a, b) => (a.startTime ?? "99:99").localeCompare(b.startTime ?? "99:99") || a.title.localeCompare(b.title, "ar"));
}

export function ScheduleGrid({
  slots,
  onAdd,
  onEdit,
}: {
  slots: ScheduleSlot[];
  onAdd?: (day: number, period: string) => void;
  onEdit?: (slot: ScheduleSlot) => void;
}) {
  // اليوم المختار بتبويب الجوال — الافتراضي اليوم الحالي بترقيم الأسبوع السعودي
  const [day, setDay] = useState(() => (new Date().getDay() + 1) % 7);

  const byCell = new Map<string, ScheduleSlot[]>();
  for (const slot of slots) {
    const key = cellKey(slot.dayOfWeek, slot.period);
    byCell.set(key, sortSlots([...(byCell.get(key) ?? []), slot]));
  }

  return (
    <>
      {/* سطح المكتب: جدول 7 أعمدة × الفترات */}
      <div className="hidden overflow-x-auto sm:block">
        <table className="w-full min-w-[52rem] border-separate border-spacing-1 text-sm">
          <thead>
            <tr>
              <th className="w-16" />
              {WEEK_DAYS.map((weekDay) => (
                <th key={weekDay.value} className="px-1 pb-1 text-xs font-medium text-muted-foreground">
                  {weekDay.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((period) => (
              <tr key={period.value}>
                <th className="px-1 align-top text-xs font-medium text-muted-foreground">{period.label}</th>
                {WEEK_DAYS.map((weekDay) => (
                  <td key={weekDay.value} className="align-top">
                    <div className="min-h-10 space-y-1 rounded-xl bg-muted/40 p-1">
                      {(byCell.get(cellKey(weekDay.value, period.value)) ?? []).map((slot) => (
                        <SlotChip key={slot.id} slot={slot} onEdit={onEdit} />
                      ))}
                      {onAdd && (
                        <button
                          type="button"
                          onClick={() => onAdd(weekDay.value, period.value)}
                          className="w-full cursor-pointer rounded-lg px-1 py-0.5 text-center text-xs text-muted-foreground transition-colors duration-200 hover:bg-muted hover:text-primary"
                        >
                          + إضافة
                        </button>
                      )}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* الجوال: تبويب يوم ثم قائمة فتراته */}
      <div className="space-y-3 sm:hidden">
        <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-full bg-muted p-1">
          {WEEK_DAYS.map((weekDay) => (
            <button
              key={weekDay.value}
              type="button"
              onClick={() => setDay(weekDay.value)}
              className={`shrink-0 cursor-pointer rounded-full px-3 py-1 text-sm transition-colors duration-200 ${
                day === weekDay.value ? "bg-surface font-semibold shadow-sm" : "text-muted-foreground"
              }`}
            >
              {weekDay.label}
            </button>
          ))}
        </div>

        {PERIODS.map((period) => {
          const cellSlots = byCell.get(cellKey(day, period.value)) ?? [];
          return (
            <div key={period.value}>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground">{period.label}</p>
                {onAdd && (
                  <button
                    type="button"
                    onClick={() => onAdd(day, period.value)}
                    className="cursor-pointer text-xs text-primary hover:underline"
                  >
                    + إضافة
                  </button>
                )}
              </div>
              <div className="mt-1 space-y-1">
                {cellSlots.length === 0 ? (
                  <p className="rounded-xl bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground/70">لا برامج</p>
                ) : (
                  cellSlots.map((slot) => <SlotChip key={slot.id} slot={slot} onEdit={onEdit} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function SlotChip({ slot, onEdit }: { slot: ScheduleSlot; onEdit?: (slot: ScheduleSlot) => void }) {
  const body = (
    <>
      <p className="text-sm font-medium leading-5">{slot.title}</p>
      <p className="tabular text-xs leading-4 text-muted-foreground">
        {slot.startTime && <span>{slot.startTime} · </span>}
        {programKindLabel(slot.programKind)}
        {slot.location && <span> · {slot.location}</span>}
      </p>
    </>
  );

  return onEdit ? (
    <button
      type="button"
      onClick={() => onEdit(slot)}
      title={slot.notes || undefined}
      className="w-full cursor-pointer rounded-xl border border-border bg-surface p-2 text-start transition-colors duration-200 hover:border-border-strong"
    >
      {body}
    </button>
  ) : (
    <div title={slot.notes || undefined} className="rounded-xl border border-border bg-surface p-2 text-start">
      {body}
    </div>
  );
}
