import type { ReactNode } from "react";
import { AwardIcon, BrainIcon, CalendarIcon, ChartIcon, ClipboardIcon, HomeIcon, ImageIcon, SettingsIcon, ShieldIcon, StarIcon, TrophyIcon, UsersIcon } from "./icons";

export type NavItem = { href: string; label: string; icon: ReactNode; active?: boolean };

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

  if (isSuper) items.push({ href: "/", label: "كل الجوامع", icon: <HomeIcon /> });

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
  feature("badges", "badges", "الأوسمة", <AwardIcon />);
  feature("weekly_schedule", "schedule", "الجدول الأسبوعي", <CalendarIcon />);
  feature("reports", "reports", "التقارير", <ChartIcon />);
  feature("honor_board", "honor-board", "لوحة الشرف", <TrophyIcon />);
  feature("archive", "archive", "أرشيف الأنشطة", <ImageIcon />);

  if (extra) items.push(extra);

  items.push({
    href: `/mosque/${mosqueId}/settings`,
    label: "الإعدادات",
    icon: <SettingsIcon />,
    active: activeHref === `/mosque/${mosqueId}/settings`,
  });

  return items;
}
