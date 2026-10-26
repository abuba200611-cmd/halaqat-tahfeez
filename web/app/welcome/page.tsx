import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  BellIcon,
  BookIcon,
  CalendarIcon,
  ChartIcon,
  CheckCircleIcon,
  HomeIcon,
  MailIcon,
  SproutIcon,
  StarIcon,
  UserIcon,
  UsersIcon,
} from "@/components/icons";
import { CTA_GHOST, CTA_PRIMARY } from "@/components/landing/cta";
import {
  HeroTitle,
  IntroCookie,
  LandingMotion,
  LandingNav,
  Lift,
  NextBanner,
  Reveal,
  SignupCta,
} from "@/components/landing/client";
import { ProductPreview } from "@/components/landing/preview";
import { FAQ, TOUR_GROUPS } from "@/components/landing/tour";
import "@/components/landing/landing.css";

/* الصفحة الترحيبية العامة — ثابتة (SSG): next/كوكي mos_intro تتولاها مكوّنات العميل. */

const TITLE = "السلام — نظام تشغيل الجامع (MOS)";
const DESCRIPTION =
  "منصة السلام تجمع الحلقات والحضور والحفظ والمراجعة وأولياء الأمور وإدارة الجامع في مكان واحد، بوضوح وسهولة.";

const SITE =
  process.env.URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ar",
    siteName: "السلام — MOS",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/brand/icons/icon-512.png", width: 512, height: 512, alt: "شعار السلام" }],
  },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION, images: ["/brand/icons/icon-512.png"] },
};

const HERO_WORDS = ["جامعك", "كلّه…", "على", "منصة", "واحدة"];
const KEYWORDS = ["الحلقات", "الحضور والغياب", "الحفظ", "المراجعة", "أولياء الأمور", "الاختبارات", "الشهادات", "لوحة الشرف", "التقارير"];

const ROLES = [
  { title: "المعلّم", text: "يسجّل الحفظ والمراجعة والحضور في دقائق، ويرى كل طالب أمامه.", icon: UserIcon, span: "md:col-span-3" },
  { title: "الطالب", text: "يتابع تقدّمه ويسجّل ورده ويعرف ما عليه اليوم.", icon: SproutIcon, span: "md:col-span-3" },
  { title: "وليّ الأمر", text: "يطمئن على ابنه بتقرير واضح ورسائل مباشرة.", icon: HomeIcon, span: "md:col-span-2" },
  { title: "مدير الجامع", text: "يدير الحلقات والمعلّمين والجداول من لوحة واحدة.", icon: UsersIcon, span: "md:col-span-2" },
  { title: "الجمعية", text: "تقارير مجمّعة لكل جوامعها وصورة كاملة للأثر.", icon: ChartIcon, span: "md:col-span-2" },
];

const STEPS = [
  { n: "١", title: "سجّل جامعك", text: "أرسل طلب تسجيل جامعك، وبعد الموافقة تدخل بحساب مدير الجامع. وإن كنت معلّماً فأنشئ حسابك مباشرة." },
  { n: "٢", title: "أضف الحلقات وشارك الرابط", text: "أنشئ الحلقات وأرسل رابط الانضمام لمعلّميك." },
  { n: "٣", title: "تابع كل شيء من لوحة واحدة", text: "الحفظ والحضور والتقارير أمامك، محدّثة لحظة بلحظة." },
];

function SectionHead({ eyebrow, title, dark = false }: { eyebrow: string; title: string; dark?: boolean }) {
  return (
    <div className="max-w-2xl">
      <p className={`text-sm font-bold tracking-wide ${dark ? "text-[#AD7D56]" : "text-[#7F5636]"}`}>{eyebrow}</p>
      <h2 className={`font-display mt-3 text-4xl leading-[1.35] sm:text-5xl ${dark ? "text-white" : "text-black"}`}>{title}</h2>
    </div>
  );
}

const card = "rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 backdrop-blur-sm transition-colors hover:border-[#AD7D56]/50";

export default function WelcomePage() {
  return (
    <LandingMotion>
      <IntroCookie />
      <NextBanner />
      <LandingNav />

      <main className="overflow-x-clip">
        {/* ————— الهيرو ————— */}
        <section className="relative isolate overflow-hidden bg-black">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
            <div className="lp-orb-a absolute -right-24 -top-24 h-[34rem] w-[34rem] rounded-full bg-[#AD7D56]/35 blur-[110px]" />
            <div className="lp-orb-b absolute -bottom-32 -left-20 h-[30rem] w-[30rem] rounded-full bg-[#CDB49E]/20 blur-[110px]" />
            <div className="lp-dots absolute inset-0" />
            <div className="lp-grain absolute inset-0" />
          </div>

          <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-14 sm:px-8 sm:pb-32 sm:pt-20 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[1.1fr_0.9fr] lg:gap-10 lg:py-24">
            <div>
              <Reveal y={12}>
                <p className="inline-flex items-center gap-2.5 rounded-full border border-[#AD7D56]/40 bg-[#AD7D56]/10 px-4 py-1.5 text-sm font-semibold text-[#CDB49E]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#AD7D56]" aria-hidden />
                  MOS — نظام تشغيل الجامع
                </p>
              </Reveal>

              <div className="mt-7">
                <HeroTitle words={HERO_WORDS} accentFrom={3} />
              </div>

              <Reveal delay={0.7} y={20}>
                <p className="mt-7 max-w-xl text-lg leading-[1.9] text-[#CDB49E] sm:text-xl">
                  السلام نظام تشغيل الجامع: الحلقات والحضور والحفظ والمراجعة وأولياء الأمور والإدارة — بوضوح وسهولة.
                </p>
              </Reveal>

              <Reveal delay={0.85} y={20}>
                <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                  <SignupCta label="ابدأ تسجيل جامعك" className={`${CTA_PRIMARY} w-full sm:w-auto`} />
                  <Link href="/signup" className={`${CTA_GHOST} w-full sm:w-auto`}>
                    أنا معلّم — أنشئ حسابك
                  </Link>
                  <Link href="/login" className={`${CTA_GHOST} w-full sm:w-auto`}>
                    دخول المنصة
                  </Link>
                </div>
                <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[#CDB49E]/85">
                  <Link href="/student-join" className="font-semibold text-white underline decoration-[#AD7D56] decoration-2 underline-offset-[6px] hover:text-[#CDB49E]">
                    أنا طالب
                  </Link>
                  <span aria-hidden className="text-[#AD7D56]">
                    •
                  </span>
                  <Link href="/parent/login#how-to" className="font-semibold text-white underline decoration-[#AD7D56] decoration-2 underline-offset-[6px] hover:text-[#CDB49E]">
                    أنا ولي أمر
                  </Link>
                </p>
              </Reveal>
            </div>

            <Reveal delay={0.5} y={36} className="pb-8 sm:pb-16">
              <ProductPreview />
            </Reveal>
          </div>
        </section>

        {/* ————— شريط الكلمات ————— */}
        <div className="lp-marquee overflow-hidden border-y border-black/10 bg-[#CDB49E] py-4" dir="ltr" aria-hidden>
          <div className="lp-marquee-track flex w-max items-center gap-10 whitespace-nowrap">
            {[0, 1].map((k) => (
              <div key={k} className="flex items-center gap-10" dir="rtl">
                {KEYWORDS.map((w) => (
                  <span key={`${k}-${w}`} className="flex items-center gap-10 font-display text-xl text-black">
                    {w}
                    <span className="h-2 w-2 rotate-45 bg-black/70" />
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ————— لمن المنصة ————— */}
        <section id="roles" className="scroll-mt-16 bg-[#F3EDE6] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal>
              <SectionHead eyebrow="لمن المنصة" title="لكل من في الجامع، مكانه الواضح" />
            </Reveal>
            <div className="mt-14 grid gap-4 md:grid-cols-6 md:gap-5">
              {ROLES.map((r, i) => (
                <Reveal key={r.title} delay={(i % 3) * 0.08} className={r.span}>
                  <Lift className="h-full">
                    <article
                      className={`group flex h-full flex-col rounded-3xl border p-7 sm:p-8 ${
                        i === 0
                          ? "border-black bg-black text-white"
                          // force-light: التصميم ثابت الألوان حرفياً، ودونها تنقلب
                          // البطاقة سطحاً داكناً في الوضع الداكن ويبقى نصها أسود
                          : "force-light border-[#E2D6C3] bg-white text-black shadow-[0_1px_0_rgba(255,255,255,0.9)_inset]"
                      }`}
                    >
                      <span
                        className={`grid h-12 w-12 place-items-center rounded-2xl ${
                          i === 0 ? "bg-[#AD7D56] text-black" : "bg-[#F0E4D2] text-[#7F5636]"
                        }`}
                      >
                        <r.icon size={24} />
                      </span>
                      <h3 className="font-display mt-6 text-3xl leading-snug">{r.title}</h3>
                      <p className={`mt-3 text-base leading-[1.9] ${i === 0 ? "text-[#CDB49E]" : "text-[#5F5344]"}`}>{r.text}</p>
                    </article>
                  </Lift>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ————— المزايا (بينتو) ————— */}
        <section id="features" className="relative scroll-mt-16 overflow-hidden bg-black py-24 sm:py-32">
          <div aria-hidden className="pointer-events-none absolute -top-40 left-1/2 h-96 w-[60rem] -translate-x-1/2 rounded-full bg-[#AD7D56]/15 blur-[120px]" />
          <div className="relative mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal>
              <SectionHead dark eyebrow="المزايا" title="كل ما تحتاجه الحلقة، دون تعقيد" />
            </Reveal>

            <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-6 lg:gap-5">
              {/* الحفظ والمراجعة — البطاقة الكبرى */}
              <Reveal className="md:col-span-2 lg:col-span-4 lg:row-span-2">
                <Lift className="h-full">
                  <article className={`${card} flex h-full flex-col justify-between bg-gradient-to-br from-[#AD7D56]/20 via-white/[0.04] to-transparent`}>
                    <div>
                      <BookIcon size={28} className="text-[#AD7D56]" />
                      <h3 className="font-display mt-5 text-3xl leading-snug text-white sm:text-4xl">متابعة الحفظ والمراجعة</h3>
                      <p className="mt-3 max-w-lg text-base leading-[1.9] text-[#CDB49E]">
                        سجّل ما حفظه الطالب وما راجعه في لحظته، بتقسيم واضح يعرفه كل معلّم.
                      </p>
                    </div>
                    <div className="mt-8 grid gap-3 sm:grid-cols-3">
                      {[
                        { k: "حفظ جديد", d: "ما يحفظه الطالب اليوم", w: "w-3/4" },
                        { k: "الكبرى", d: "المراجعة بعد الحفظ مباشرة", w: "w-2/3" },
                        { k: "الصغرى", d: "ما بعد الكبرى من المحفوظ", w: "w-1/2" },
                      ].map((p) => (
                        <div key={p.k} className="rounded-2xl border border-white/10 bg-black/40 p-4">
                          <p className="font-display text-2xl text-white">{p.k}</p>
                          <p className="mt-1 text-xs text-[#CDB49E]">{p.d}</p>
                          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
                            <div className={`h-full rounded-full bg-gradient-to-l from-[#AD7D56] to-[#CDB49E] ${p.w}`} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </article>
                </Lift>
              </Reveal>

              <Reveal delay={0.08} className="lg:col-span-2">
                <Lift className="h-full">
                  <article className={`${card} h-full`}>
                    <CalendarIcon size={26} className="text-[#AD7D56]" />
                    <h3 className="font-display mt-5 text-2xl text-white">الحضور والغياب</h3>
                    <p className="mt-2 text-sm leading-[1.9] text-[#CDB49E]">تسجيل بنقرة، وملخّص أسبوعي لكل طالب.</p>
                    <div className="mt-6 flex gap-2" aria-hidden>
                      {[1, 1, 1, 0, 1, 1, 1].map((v, i) => (
                        <span key={i} className={`h-7 flex-1 rounded-md ${v ? "bg-[#AD7D56]" : "bg-white/10"}`} />
                      ))}
                    </div>
                  </article>
                </Lift>
              </Reveal>

              <Reveal delay={0.16} className="lg:col-span-2">
                <Lift className="h-full">
                  <article className={`${card} h-full`}>
                    <CheckCircleIcon size={26} className="text-[#AD7D56]" />
                    <h3 className="font-display mt-5 text-2xl text-white">الاختبارات والشهادات</h3>
                    <p className="mt-2 text-sm leading-[1.9] text-[#CDB49E]">جلسات اختبار منظّمة وشهادة جاهزة للطباعة.</p>
                    <div className="mt-6 rounded-xl border border-dashed border-[#AD7D56]/60 bg-black/40 px-4 py-3 text-center" aria-hidden>
                      <p className="font-display text-lg text-[#CDB49E]">شهادة إتمام</p>
                    </div>
                  </article>
                </Lift>
              </Reveal>

              <Reveal className="lg:col-span-3">
                <Lift className="h-full">
                  <article className={`${card} h-full`}>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <MailIcon size={26} className="text-[#AD7D56]" />
                        <h3 className="font-display mt-5 text-2xl text-white">رسائل وإشعارات لأولياء الأمور</h3>
                        <p className="mt-2 max-w-sm text-sm leading-[1.9] text-[#CDB49E]">يصل وليّ الأمر ما يخص ابنه فور تسجيله.</p>
                      </div>
                      <BellIcon size={22} className="shrink-0 text-[#CDB49E]" />
                    </div>
                    <div className="mt-6 space-y-2" aria-hidden>
                      <p className="w-4/5 rounded-2xl rounded-tr-sm bg-white/10 px-4 py-2.5 text-sm text-white">أتمّ يوسف حفظ صفحة اليوم.</p>
                      <p className="ms-auto w-3/5 rounded-2xl rounded-tl-sm bg-[#AD7D56] px-4 py-2.5 text-sm font-semibold text-black">جزاكم الله خيراً.</p>
                    </div>
                  </article>
                </Lift>
              </Reveal>

              <Reveal delay={0.08} className="lg:col-span-3">
                <Lift className="h-full">
                  <article className={`${card} h-full`}>
                    <ChartIcon size={26} className="text-[#AD7D56]" />
                    <h3 className="font-display mt-5 text-2xl text-white">تقارير الجامع والجمعية</h3>
                    <p className="mt-2 max-w-sm text-sm leading-[1.9] text-[#CDB49E]">أرقام الأثر مجمّعة بلا جداول يدوية.</p>
                    <div className="mt-6 flex h-20 items-end gap-2" aria-hidden>
                      {[40, 62, 48, 80, 66, 94].map((h, i) => (
                        <span key={i} style={{ height: `${h}%` }} className="flex-1 rounded-t-md bg-gradient-to-t from-[#7F5636] to-[#CDB49E]" />
                      ))}
                    </div>
                  </article>
                </Lift>
              </Reveal>

              <Reveal className="md:col-span-2 lg:col-span-6">
                <Lift>
                  <article className={`${card} flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between`}>
                    <div>
                      <StarIcon size={26} className="text-[#AD7D56]" />
                      <h3 className="font-display mt-5 text-3xl text-white">لوحة الشرف</h3>
                      <p className="mt-2 max-w-md text-sm leading-[1.9] text-[#CDB49E]">تحفيز يومي يُبرز المجتهدين ويرفع همّة الحلقة كلها.</p>
                    </div>
                    <div className="flex items-end justify-center gap-3" aria-hidden>
                      {[
                        { h: "h-16", t: "٢" },
                        { h: "h-24", t: "١" },
                        { h: "h-12", t: "٣" },
                      ].map((p) => (
                        <span
                          key={p.t}
                          className={`font-display grid w-16 place-items-center rounded-t-xl bg-gradient-to-t from-[#7F5636] to-[#AD7D56] text-2xl text-black ${p.h}`}
                        >
                          {p.t}
                        </span>
                      ))}
                    </div>
                  </article>
                </Lift>
              </Reveal>
            </div>
          </div>
        </section>

        {/* ————— كل المزايا (مجمّعة بالجمهور) ————— */}
        <section id="all-features" className="scroll-mt-16 bg-[#F3EDE6] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal>
              <SectionHead eyebrow="كل المزايا" title="كل ما تفعله المنصة، جمهوراً بجمهور" />
            </Reveal>
            <div className="mt-14 space-y-14">
              {TOUR_GROUPS.map((group) => (
                <Reveal key={group.id}>
                  <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h3 className="font-display text-2xl leading-snug text-black sm:text-3xl">{group.title}</h3>
                    <p className="text-sm font-semibold text-[#7F5636]">{group.blurb}</p>
                  </div>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:gap-4">
                    {group.items.map((item) => (
                      <li
                        key={`${group.id}-${item.title}`}
                        className="force-light flex gap-3 rounded-2xl border border-[#E2D6C3] bg-white p-4"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#F0E4D2] text-[#7F5636]">
                          <item.icon size={18} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-black">{item.title}</p>
                          <p className="mt-1 text-xs leading-[1.8] text-[#5F5344]">{item.text}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ————— الأسئلة الشائعة ————— */}
        <section id="faq" className="force-light scroll-mt-16 bg-white py-24 sm:py-32">
          <div className="mx-auto max-w-3xl px-5 sm:px-8">
            <Reveal>
              <SectionHead eyebrow="الأسئلة الشائعة" title="أسئلة يطرحها الجميع" />
            </Reveal>
            <div className="mt-12 space-y-3">
              {FAQ.map((f) => (
                <Reveal key={f.q}>
                  <details className="force-light group rounded-2xl border border-[#E2D6C3] bg-[#F3EDE6] px-5 py-4">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-black [&::-webkit-details-marker]:hidden">
                      {f.q}
                      <span aria-hidden className="text-xl leading-none text-[#7F5636] transition-transform duration-200 group-open:rotate-45">
                        +
                      </span>
                    </summary>
                    <p className="mt-3 text-sm leading-[1.9] text-[#5F5344]">
                      {f.a}{" "}
                      {f.link && (
                        <Link href={f.link.href} className="font-bold text-[#7F5636] underline decoration-2 underline-offset-4">
                          {f.link.label}
                        </Link>
                      )}
                    </p>
                  </details>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ————— كيف تبدأ ————— */}
        <section id="how" className="scroll-mt-16 bg-[#F3EDE6] py-24 sm:py-32">
          <div className="mx-auto max-w-7xl px-5 sm:px-8">
            <Reveal>
              <SectionHead eyebrow="كيف تبدأ" title="ثلاث خطوات وتكون جاهزاً" />
            </Reveal>
            <ol className="mt-14 grid gap-5 md:grid-cols-3">
              {STEPS.map((s, i) => (
                <li key={s.n}>
                  <Reveal delay={i * 0.1} className="h-full">
                    <div className="force-light relative h-full overflow-hidden rounded-3xl border border-[#E2D6C3] bg-white p-7 sm:p-8">
                      <span aria-hidden className="font-display absolute -left-2 -top-6 select-none text-[9rem] leading-none text-[#F0E4D2]">
                        {s.n}
                      </span>
                      <div className="relative">
                        <span className="grid h-11 w-11 place-items-center rounded-full bg-black font-display text-2xl text-[#CDB49E]">{s.n}</span>
                        <h3 className="font-display mt-8 text-2xl leading-snug">{s.title}</h3>
                        <p className="mt-3 text-base leading-[1.9] text-[#5F5344]">{s.text}</p>
                      </div>
                    </div>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ————— للجمعيات ————— */}
        <section className="relative overflow-hidden bg-black py-20 sm:py-24">
          <div aria-hidden className="pointer-events-none absolute inset-x-0 -top-24 h-64 bg-[#AD7D56]/10 blur-[110px]" />
          <div className="relative mx-auto max-w-4xl px-5 sm:px-8">
            <Reveal>
              <div className="rounded-3xl border border-[#AD7D56]/40 bg-[#AD7D56]/10 p-8 text-center sm:p-12">
                <p className="text-sm font-bold tracking-wide text-[#AD7D56]">للجمعيات الخيرية</p>
                <h2 className="font-display mt-4 text-3xl leading-[1.35] text-white sm:text-4xl">
                  جمعية تدير جوامع؟ شوفوا أثركم كله في لوحة واحدة
                </h2>
                <p className="mx-auto mt-4 max-w-xl text-base leading-[1.9] text-[#CDB49E]">
                  سجّلوا جمعيتكم، اربطوا جوامعكم بطلب وموافقة، وتابعوا الحفظ والحضور والاختبارات لكل جامع بتقارير مجمّعة.
                </p>
                <Link
                  href="/register-association"
                  className="mt-8 inline-flex items-center justify-center rounded-full bg-[#AD7D56] px-8 py-4 text-base font-bold text-black transition-colors hover:bg-[#c08d66] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#CDB49E]"
                >
                  سجّل جمعيتك
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* ————— الدعوة الأخيرة ————— */}
        <section className="bg-[#AD7D56] py-20 sm:py-28">
          <div className="mx-auto max-w-4xl px-5 text-center sm:px-8">
            <Reveal>
              <h2 className="font-display text-4xl leading-[1.35] text-black sm:text-6xl">ابدأ اليوم، وانظر جامعك في مكان واحد</h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-[1.9] text-black/80">
                التسجيل سريع، وبعده تضيف حلقاتك وتشارك الرابط مع معلّميك.
              </p>
              <div className="mt-9 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
                <SignupCta
                  label="ابدأ تسجيل جامعك"
                  className="relative inline-flex items-center justify-center gap-2.5 rounded-full bg-black px-8 py-4 text-base font-bold text-white transition-colors hover:bg-[#241b12] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
                />
                <Link
                  href="/signup"
                  className="inline-flex items-center justify-center rounded-full border-2 border-black px-8 py-4 text-base font-bold text-black transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
                >
                  أنا معلّم — أنشئ حسابك
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center justify-center rounded-full border-2 border-black px-8 py-4 text-base font-bold text-black transition-colors hover:bg-black/10 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-black"
                >
                  دخول المنصة
                </Link>
              </div>
            </Reveal>
          </div>
        </section>
      </main>

      {/* ————— التذييل ————— */}
      <footer className="bg-black">
        <div className="mx-auto flex max-w-7xl flex-col gap-10 px-5 py-14 sm:px-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Image src="/brand/logo-light.png" alt="شعار السلام" width={44} height={47} />
            <div>
              <p className="font-display text-2xl leading-none text-white">السلام</p>
              <p className="mt-1.5 text-xs text-[#CDB49E]">MOS — نظام تشغيل الجامع</p>
            </div>
          </div>
          <nav aria-label="روابط التذييل" className="flex flex-wrap gap-x-7 gap-y-3 text-sm font-semibold text-[#CDB49E]">
            <Link href="/privacy" className="hover:text-white">
              سياسة الخصوصية
            </Link>
            <Link href="/login" className="hover:text-white">
              دخول
            </Link>
            <Link href="/register-mosque" className="hover:text-white">
              تسجيل جامع
            </Link>
            <Link href="/register-association" className="hover:text-white">
              تسجيل جمعية
            </Link>
            <Link href="/signup" className="hover:text-white">
              حساب معلّم
            </Link>
            <Link href="/mosque-login" className="hover:text-white">
              دخول مدير الجامع
            </Link>
            <Link href="/student-join" className="hover:text-white">
              أنا طالب
            </Link>
            <Link href="/parent/login#how-to" className="hover:text-white">
              أنا ولي أمر
            </Link>
          </nav>
        </div>
        <div className="border-t border-white/10 py-6 text-center text-xs text-[#CDB49E]/80">© السلام — جميع الحقوق محفوظة</div>
      </footer>
    </LandingMotion>
  );
}
