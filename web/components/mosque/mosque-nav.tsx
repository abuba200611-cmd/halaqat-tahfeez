import type { ReactNode } from "react";
import { MessagesBadge } from "@/components/messages-badge";
import { AwardIcon, BookIcon, BrainIcon, CalendarIcon, ChartIcon, ClipboardIcon, HomeIcon, ImageIcon, MessageIcon, SettingsIcon, ShieldIcon, StarIcon, TrophyIcon, UsersIcon } from "./icons";

export type NavItem = { href: string; label: string; icon: ReactNode; active?: boolean; badge?: ReactNode; group?: "top" | "features" | "bottom" };

/**
 * عناصر سايدبار الجامع المشتركة بين صفحات /mosque/[id] — عنصر كل ميزة
 * ذات صفحات (الدماغ، الأسر، اللجان، التقييم الأسبوعي) يظهر فقط إن كانت مفعّلة لهذا الجامع،
 * والإعدادات دائماً. لإضافة ميزة جديدة بسايدبار: سطرها هنا + صفحاتها.
 */
export function mosqueNavItems(opts: {
  mosqueId: number;
  mosqueName: string;
  features: Record<string, boolean>;
  isSuper: boolean;
  activeHref?: string;
  /** عنصر إضافي للسياق الحالي (مثل الحلقة المفتوحة) — يُدرج قبل الإعدادات */
  extra?: NavItem;
}): NavItem[] {
  const { mosqueId, mosqueName, features, isSuper, activeHref, extra } = opts;
  const items: NavItem[] = [];

  if (isSuper) items.push({ href: "/mosque", label: "كل الجوامع", icon: <HomeIcon /> });

  items.push({
    href: `/mosque/${mosqueId}`,
    label: mosqueName,
    icon: <ShieldIcon />,
    active: activeHref === `/mosque/${mosqueId}`,
  });

  if (features.brain) {
    items.push({
      href: `/mosque/${mosqueId}/brain`,
      label: "الدماغ",
      icon: <BrainIcon />,
      active: activeHref === `/mosque/${mosqueId}/brain`,
    });
  }

  /** عنصر لكل ميزة ذات صفحات — النشط إن كان المسار الحالي هو الصفحة أو أحد أبنائها */
  const feature = (key: string, path: string, label: string, icon: ReactNode) => {
    if (!features[key]) return;
    const href = `/mosque/${mosqueId}/${path}`;
    items.push({ href, label, icon, active: activeHref === href || activeHref?.startsWith(`${href}/`) });
  };
  feature("families", "families", "الأسر", <UsersIcon />);
  feature("committees", "committees", "اللجان", <ClipboardIcon />);
  feature("weekly_evaluation", "evaluation", "التقييم الأسبوعي", <StarIcon />);
  feature("exams", "exams", "الاختبارات والشهادات", <BookIcon />);
  feature("badges", "badges", "الأوسمة", <AwardIcon />);
  feature("weekly_schedule", "schedule", "الجدول الأسبوعي", <CalendarIcon />);
  feature("reports", "reports", "التقارير", <ChartIcon />);
  feature("honor_board", "honor-board", "لوحة الشرف", <TrophyIcon />);
  feature("archive", "archive", "أرشيف الأنشطة", <ImageIcon />);
  feature("discipline", "discipline", "الانضباط والمتابعة", <ShieldIcon />);
  feature("permits", "permits", "تصاريح الحلقات", <ClipboardIcon />);
  feature("teacher_eval", "teacher-eval", "تقييم المعلّمين والحوافز", <AwardIcon />);
  feature("supervisor_visits", "supervisor-visits", "زيارات المشرف التربوي", <ShieldIcon />);
  feature("fees", "fees", "الرسوم والاشتراكات", <ClipboardIcon />);
  feature("auto_assign", "enrollment", "التوزيع الآلي والانتظار", <UsersIcon />);
  feature("student_import", "import", "استيراد الطلاب", <ClipboardIcon />);
  feature("error_grading", "error-grading", "تقييم الورد بالنقاط", <StarIcon />);

  if (features.messaging) {
    const href = `/mosque/${mosqueId}/messages`;
    items.push({
      href,
      label: "الرسائل",
      icon: <MessageIcon />,
      active: activeHref === href,
      // مدير الجامع وحده له صندوق وارد؛ المشرف العام لا هوية رسائل له
      badge: isSuper ? undefined : <MessagesBadge role="mosque_admin" />,
    });
  }

  if (extra) items.push(extra);

  // بلاغ إلى المطوّر — ليس ميزة جامع بل منفذ منصة لكل الأدوار (dev split)
  items.push({
    href: `/mosque/${mosqueId}/suggest`,
    label: "اقتراح / بلاغ",
    icon: <MessageIcon />,
    active: activeHref === `/mosque/${mosqueId}/suggest`,
  });

  items.push({
    href: `/mosque/${mosqueId}/settings`,
    label: "الإعدادات",
    icon: <SettingsIcon />,
    active: activeHref === `/mosque/${mosqueId}/settings`,
  });

  // التجميع: أول عنصرين/ثلاثة أعلى، السياق الإضافي والمزايا في الوسط، واقتراح/إعدادات مثبّتة بالأسفل
  return items.map((i) => {
    if (i.href.endsWith("/suggest") || i.href.endsWith("/settings")) return { ...i, group: "bottom" as const };
    if (i.href === "/mosque" || i.href === `/mosque/${mosqueId}` || i.href.endsWith("/brain") || i.href.endsWith("/messages")) return { ...i, group: "top" as const };
    return { ...i, group: "features" as const };
  });
}
