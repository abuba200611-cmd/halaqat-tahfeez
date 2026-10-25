-- D2 — إطار التكاملات: مفاتيح API للقراءة، ونقاط ويب هوكس موقَّعة، وصندوق
-- صادر للتسليم مع إعادة المحاولة. إضافي بحت: CREATE ... IF NOT EXISTS فقط،
-- لا تعديل على جدول قائم ولا حذف بيانات. الميزة نفسها مغلقة افتراضياً
-- (مفتاح "integrations" في سجل المزايا) فلا تُلمَس هذه الجداول قبل تفعيلها.

-- ————— مفاتيح API —————
-- المفتاح الصريح يُعرض مرة واحدة عند الإنشاء ولا يُخزَّن: نحفظ بادئته
-- (للبحث والعرض) وSHA-256 فقط. scopes نطاقات القراءة الممنوحة.
CREATE TABLE IF NOT EXISTS mosque_api_keys (
  id           SERIAL      PRIMARY KEY,
  mosque_id    INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  key_prefix   TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL,
  scopes       TEXT[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS mosque_api_keys_prefix_idx
  ON mosque_api_keys (key_prefix) WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mosque_api_keys_mosque_idx
  ON mosque_api_keys (mosque_id, created_at DESC);

-- ————— نقاط الويب هوكس —————
-- secret سرّ توقيع HMAC (يلزم نصاً صريحاً للتوقيع عند كل تسليم، ويُعرض مرة
-- واحدة لمدير الجامع عند الإنشاء). events قائمة الأحداث المشترَك بها.
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id         SERIAL      PRIMARY KEY,
  mosque_id  INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  url        TEXT        NOT NULL,
  secret     TEXT        NOT NULL,
  events     TEXT[]      NOT NULL DEFAULT '{}',
  active     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS webhook_endpoints_mosque_idx
  ON webhook_endpoints (mosque_id, active);

-- ————— صندوق التسليم الصادر —————
-- status: pending | delivered | failed. next_attempt_at موعد المحاولة
-- التالية (يُدفع للأمام عند الحجز وعند الفشل بتراجع أُسّي).
CREATE TABLE IF NOT EXISTS webhook_outbox (
  id              SERIAL      PRIMARY KEY,
  endpoint_id     INTEGER     NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event           TEXT        NOT NULL,
  payload         JSONB       NOT NULL,
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts        INTEGER     NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_error      TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS webhook_outbox_due_idx
  ON webhook_outbox (next_attempt_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS webhook_outbox_endpoint_idx
  ON webhook_outbox (endpoint_id, created_at DESC);
