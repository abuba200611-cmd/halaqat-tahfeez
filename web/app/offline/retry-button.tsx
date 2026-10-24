"use client";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="cursor-pointer rounded-xl bg-sand px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sand"
    >
      إعادة المحاولة
    </button>
  );
}
