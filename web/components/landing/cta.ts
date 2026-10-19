/* أصناف الأزرار المشتركة — ملف عادي (لا "use client") كي تُستورد نصوصاً من الخادم. */
const ctaBase =
  "relative inline-flex items-center justify-center gap-2.5 overflow-hidden rounded-full font-bold transition-[transform,background-color] duration-300 active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#CDB49E]";

export const CTA_PRIMARY = `${ctaBase} lp-shimmer bg-[#AD7D56] text-black hover:bg-[#c08d66] px-7 py-4 text-base`;
export const CTA_GHOST = `${ctaBase} border border-white/25 text-white hover:border-[#CDB49E] hover:bg-white/5 px-7 py-4 text-base`;

