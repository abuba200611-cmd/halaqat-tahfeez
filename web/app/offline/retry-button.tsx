"use client";

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="cursor-pointer rounded-xl bg-[#CDB49E] px-6 py-2.5 text-sm font-semibold text-black transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#CDB49E]"
    >
      إعادة المحاولة
    </button>
  );
}
