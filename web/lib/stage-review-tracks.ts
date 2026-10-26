/*
  الكبرى/الصغرى حسب الفئة (001 US6، FR-011): التصنيف يظهر فقط إذا كان
  مفعّلاً في الجامع والفئة تستخدمه. إعداد الجامع يتقدّم — جامع معطّل
  يخفيه لكل الفئات؛ جامع مفعّل وحلقة مستقلة بلا جامع تتبعان افتراض
  الفئة من ملفها (الابتدائي مخفي افتراضاً، legacy ظاهر كما اليوم).
*/
import type { StageProfile } from "./halaqah-stage";

/**
 * هل يظهر تصنيف الكبرى/الصغرى لهذه الحلقة؟ mosqueEnabled: null = حلقة
 * مستقلة بلا جامع (الافتراضيات) — تعطيل الجامع يحجب مهما كانت الفئة.
 */
export function reviewTracksVisible(profile: StageProfile, mosqueEnabled: boolean | null): boolean {
  if (mosqueEnabled === false) return false;
  return profile.reviewTracksDefault;
}
