-- B1 — إشعارات واتساب لأولياء الأمور.
-- إضافي بالكامل وقابل للتشغيل المتكرر: CREATE/ADD COLUMN IF NOT EXISTS فقط،
-- ولا تعديل لبيانات قائمة ولا حذف.
--
-- الأرقام (سقف الإرسال اليومي لكل جامع ولكل رقم) ليست هنا: إعدادات لكل
-- جامع في mosque_settings (مفتاح "whatsapp") بافتراضيات بالكود
-- (lib/notify/outbox.ts). المخزَّن هنا الأعمدة وصندوق الصادر فقط.

-- ————— ولي الأمر: رقم الجوال والموافقة الصريحة —————
-- phone بصيغة E.164 للجوال السعودي (9665XXXXXXXX) أو NULL. الموافقة
-- whatsapp_opt_in صريحة من لوحة ولي الأمر فقط، وتغيير الرقم يُسقطها
-- (الكود يطلبها من جديد)، وكلمة «إيقاف» عبر الويبهوك تسقطها كذلك.
ALTER TABLE parents ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS whatsapp_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE parents ADD COLUMN IF NOT EXISTS whatsapp_opt_in_at TIMESTAMPTZ;

-- ————— صندوق الصادر —————
-- كل إرسالة واتساب تمرّ من هنا (queued ← sent/failed/skipped). ref مفتاح
-- التكرار الآمن لكل (حدث، مستلم) — الفهرس الفريد الجزئي يجعل إعادة تشغيل
-- الحدث نفسه لا تُنشئ رسالة ثانية. إعادة الإرسال اليدوي من لوحة المطوّر
-- تعيد استخدام الصف نفسه فلا يحتاج ref جديداً (ref = NULL للحالات اليدوية
-- إن وُجدت لاحقاً). صفوف skipped (تجاوز سقف / مزوّد غير مهيأ / رقم غير
-- صالح) لا تُحسَب في السقف اليومي — السقف يعدّ المحاولات الفعلية فقط.
CREATE TABLE IF NOT EXISTS notifications_outbox (
  id         SERIAL      PRIMARY KEY,
  channel    TEXT        NOT NULL DEFAULT 'whatsapp' CHECK (channel IN ('whatsapp')),
  to_phone   TEXT        NOT NULL,
  template   TEXT        NOT NULL,
  params     JSONB       NOT NULL DEFAULT '{}',
  status     TEXT        NOT NULL DEFAULT 'queued'
             CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  error      TEXT        NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at    TIMESTAMPTZ,
  mosque_id  INTEGER     REFERENCES mosques(id) ON DELETE CASCADE,
  ref        TEXT
);

-- عدّ السقف اليومي (جامع/رقم) وتصفية اللوحة كلاهما على (المالك، الوقت)
CREATE INDEX IF NOT EXISTS notifications_outbox_mosque_day_idx
  ON notifications_outbox (mosque_id, created_at DESC) WHERE status != 'skipped';
CREATE INDEX IF NOT EXISTS notifications_outbox_phone_day_idx
  ON notifications_outbox (to_phone, created_at DESC) WHERE status != 'skipped';
CREATE INDEX IF NOT EXISTS notifications_outbox_status_idx
  ON notifications_outbox (status, created_at DESC, id DESC);

-- تكرار آمن: حدث واحد لا يرسل لرسالة ثانية لنفس المستلم مهما أُعيد
CREATE UNIQUE INDEX IF NOT EXISTS notifications_outbox_ref_uidx
  ON notifications_outbox (ref) WHERE ref IS NOT NULL;
