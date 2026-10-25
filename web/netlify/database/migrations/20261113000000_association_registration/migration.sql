-- D1 — طلبات تسجيل الجمعيات العامة + موافقات سياسة الخصوصية + طلبات حذف
-- البيانات + ربط الجوامع بالجمعيات. إضافي بحت: CREATE ... IF NOT EXISTS فقط،
-- لا تعديل على جدول قائم ولا حذف بيانات. كلمات المرور تُخزَّن مجزّأة (scrypt).

-- ————— طلبات تسجيل الجمعيات (/register-association) —————
-- مثل mosque_registration_requests: pending حتى يوافق المطوّر من
-- /dev/association-requests (ترانزاكشن واحدة تنشئ الجمعية ومديرها) أو
-- يرفضه بسبب يظهر لمقدّم الطلب عند محاولة الدخول.
CREATE TABLE IF NOT EXISTS association_registration_requests (
  id                 SERIAL      PRIMARY KEY,
  association_name   TEXT        NOT NULL,
  registration_number TEXT       NOT NULL DEFAULT '',
  region             TEXT        NOT NULL DEFAULT '',
  applicant_name     TEXT        NOT NULL,
  phone              TEXT        NOT NULL,
  email              TEXT        NOT NULL,
  username           TEXT        NOT NULL,
  password_hash      TEXT        NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason      TEXT,
  association_id     INTEGER     REFERENCES associations(id) ON DELETE SET NULL,
  admin_id           INTEGER     REFERENCES association_admins(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at         TIMESTAMPTZ
);

-- اسم المستخدم فريد بين الطلبات المعلّقة (المرفوض يُفرج عن اسمه)، وكذلك
-- لا يتاح اسم مستخدم محجوزاً لمدير جمعية قائم (يُفحص استعلامياً بالكود).
CREATE UNIQUE INDEX IF NOT EXISTS association_registration_requests_pending_username_key
  ON association_registration_requests (username) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS association_registration_requests_status_idx
  ON association_registration_requests (status, created_at DESC);

-- ————— موافقات سياسة الخصوصية —————
-- سطر واحد لكل منشئ حساب/مقدّم طلب لحظة موافقته الصريحة على السياسة:
-- subject_ref معرّف الدور بصيغته الخاصة (الطالب نص) — يكفي للإثبات والاستعلام.
CREATE TABLE IF NOT EXISTS privacy_consents (
  id            SERIAL      PRIMARY KEY,
  subject_kind  TEXT        NOT NULL
                CHECK (subject_kind IN ('teacher', 'parent', 'student', 'mosque_request', 'association_request')),
  subject_ref   TEXT        NOT NULL,
  policy_version TEXT       NOT NULL DEFAULT '2026-11',
  ip            TEXT        NOT NULL DEFAULT '',
  consented_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_kind, subject_ref)
);

-- ————— طلبات حذف البيانات —————
-- يرفعها المستخدم من إعدادات دوره («طلب حذف بياناتي») وتُعرض على المطوّر
-- في /dev/data-requests. requester_ref معرّف الدور بصيغته الخاصة.
CREATE TABLE IF NOT EXISTS data_deletion_requests (
  id             SERIAL      PRIMARY KEY,
  requester_kind TEXT        NOT NULL
                 CHECK (requester_kind IN ('teacher', 'parent', 'student', 'mosque_admin', 'association_admin')),
  requester_ref  TEXT        NOT NULL,
  display_name   TEXT        NOT NULL DEFAULT '',
  note           TEXT        NOT NULL DEFAULT '',
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'done', 'rejected')),
  decision_note  TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS data_deletion_requests_status_idx
  ON data_deletion_requests (status, created_at DESC, id DESC);

-- فهرس يمنع تكرار طلب معلّق لنفس المستخدم (المرفوض/المنجز يفتح باباً جديداً)
CREATE UNIQUE INDEX IF NOT EXISTS data_deletion_requests_pending_unique
  ON data_deletion_requests (requester_kind, requester_ref) WHERE status = 'pending';

-- ————— ربط الجوامع بالجمعيات —————
-- طلب ربط بين جامع وجمعية من أحد الطرفين يبقى pending حتى يوافقه الطرف
-- الآخر: الجمعية ترسل لمسجد قائم فيقرره مدير الجامع من إعداداته، والجامع
-- الجديد يختار جمعيته عند التسجيل فتقرره الجمعية من لوحتها. الموافقة تربط
-- mosques.association_id فعلياً؛ الرفض/الاعتذار يحفظ القرار للتاريخ فقط.
CREATE TABLE IF NOT EXISTS mosque_association_links (
  id             SERIAL      PRIMARY KEY,
  mosque_id      INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  association_id INTEGER     NOT NULL REFERENCES associations(id) ON DELETE CASCADE,
  requested_by   TEXT        NOT NULL CHECK (requested_by IN ('mosque', 'association')),
  status         TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'declined')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at     TIMESTAMPTZ,
  UNIQUE (mosque_id, association_id)
);

CREATE INDEX IF NOT EXISTS mosque_association_links_association_idx
  ON mosque_association_links (association_id, status);

CREATE INDEX IF NOT EXISTS mosque_association_links_mosque_idx
  ON mosque_association_links (mosque_id, status);

-- ————— جمعية يختارها الجامع عند تسجيله —————
-- ADD COLUMN IF NOT EXISTS إضافي بحت (عمود اختياري بلا قيمة افتراضية ولا قيد):
-- عند موافقة المطوّر على الطلب يُنشأ ربط معلّق (requested_by = 'mosque')
-- تقرره الجمعية من لوحتها.
ALTER TABLE mosque_registration_requests
  ADD COLUMN IF NOT EXISTS requested_association_id INTEGER;
