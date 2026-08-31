-- MVP Migration Foundation — الخطوة ١: الجداول المستقلة كلياً.
-- إنشاء صرف فقط — صفر ALTER على أي جدول موجود (teachers, halaqahs,
-- students, ward_logs...). لا شيء هنا يُقرأ أو يُكتَب من أي كود حالي بعد.

-- جامع — الطبقة التنظيمية فوق الحلقات. لا يوجد بعد أي عمود يربطها
-- بـ halaqahs (تلك خطوة ٢ منفصلة تماماً).
CREATE TABLE mosques (
  id         SERIAL PRIMARY KEY,
  name       TEXT NOT NULL,
  city       TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- مدير جامع — حساب دخول مستقل تماماً عن teachers، مرتبط بجامع واحد.
CREATE TABLE mosque_admins (
  id            SERIAL PRIMARY KEY,
  mosque_id     INTEGER NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- مشرف عام على كل المنظومة — يستبدل ADMIN_SECRET الثابت لاحقاً بحسابات
-- حقيقية متعددة. لا علاقة له بـ /admin الحالية (صندوق الاقتراحات).
CREATE TABLE super_admins (
  id            SERIAL PRIMARY KEY,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
