"use client";

import { useEffect, useRef } from "react";

export type LightboxItem = { src: string; alt: string };

/**
 * عارض صور بملء الشاشة: لوحة المفاتيح (Esc للإغلاق، ←/→ للتنقل — الاتجاه
 * معكوس لأن الواجهة RTL) واللمس (سحب أفقي). يُعرض فقط حين index ليس null.
 */
export function Lightbox({
  items,
  index,
  onChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number | null;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const touchStartX = useRef<number | null>(null);
  const open = index !== null && items.length > 0;
  const current = index ?? 0;

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft") onChange((current + 1) % items.length);
      else if (event.key === "ArrowRight") onChange((current - 1 + items.length) % items.length);
    }
    window.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, current, items.length, onChange, onClose]);

  if (!open) return null;
  const item = items[Math.min(current, items.length - 1)];

  function onTouchEnd(event: React.TouchEvent) {
    const start = touchStartX.current;
    touchStartX.current = null;
    if (start === null) return;
    const delta = event.changedTouches[0].clientX - start;
    if (Math.abs(delta) < 50) return;
    // سحب لليسار = التالي (اتجاه RTL)
    onChange(delta < 0 ? (current + 1) % items.length : (current - 1 + items.length) % items.length);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="عارض الصور"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
      onClick={onClose}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0].clientX;
      }}
      onTouchEnd={onTouchEnd}
    >
      <button
        type="button"
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute top-4 end-4 cursor-pointer rounded-full bg-white/15 px-3 py-1 text-lg text-white hover:bg-white/25"
      >
        ✕
      </button>
      {items.length > 1 && (
        <>
          <button
            type="button"
            aria-label="السابق"
            onClick={(e) => {
              e.stopPropagation();
              onChange((current - 1 + items.length) % items.length);
            }}
            className="absolute start-3 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-full bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/25 sm:block"
          >
            ›
          </button>
          <button
            type="button"
            aria-label="التالي"
            onClick={(e) => {
              e.stopPropagation();
              onChange((current + 1) % items.length);
            }}
            className="absolute end-3 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-full bg-white/15 px-3 py-2 text-xl text-white hover:bg-white/25 sm:block"
          >
            ‹
          </button>
        </>
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.src}
        alt={item.alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90vh] max-w-[95vw] object-contain"
      />
      <p className="tabular absolute bottom-4 text-sm text-white/80">
        {current + 1} / {items.length}
      </p>
    </div>
  );
}
