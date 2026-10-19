-- طلبات تسجيل الجوامع العامة (/register-mosque). إضافي بحت: جدول جديد فقط،
-- بلا أي تعديل على جداول قائمة. يمرّ الطلب بحالة pending حتى يوافق عليه
-- المطوّر من /dev/mosque-requests (ينشئ الجامع ومديره بترانزاكشن واحدة) أو
-- يرفضه بسبب. كلمة المرور تُخزَّن مجزّأة (scrypt) ولا تُخزَّن خاماً أبداً.

CREATE TABLE IF NOT EXISTS mosque_registration_requests (
  id               SERIAL      PRIMARY KEY,
  mosque_name      TEXT        NOT NULL,
  city             TEXT        NOT NULL DEFAULT '',
  applicant_name   TEXT        NOT NULL,
  phone            TEXT        NOT NULL,
  email            TEXT        NOT NULL,
  username         TEXT        NOT NULL,
  password_hash    TEXT        NOT NULL,
  association_name TEXT        NOT NULL DEFAULT '',
  status           TEXT        NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  reject_reason    TEXT,
  mosque_id        INTEGER     REFERENCES mosques(id) ON DELETE SET NULL,
  association_id   INTEGER     REFERENCES associations(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at       TIMESTAMPTZ
);

-- اسم المستخدم فريد بين الطلبات المعلّقة (المرفوض يُفرج عن اسمه)
CREATE UNIQUE INDEX IF NOT EXISTS mosque_registration_requests_pending_username_key
  ON mosque_registration_requests (username) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS mosque_registration_requests_status_idx
  ON mosque_registration_requests (status, created_at DESC);
