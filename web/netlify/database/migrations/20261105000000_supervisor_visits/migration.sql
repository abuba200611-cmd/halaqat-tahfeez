-- B4 — زيارات المشرف التربوي. إضافي بالكامل وقابل للتشغيل المتكرر:
-- CREATE TABLE/INDEX IF NOT EXISTS فقط، ولا تعديل لبيانات قائمة ولا حذف.
-- المعايير لا تُخزَّن هنا: قائمتها بالكود (lib/supervisor-visits.ts) وقابلة
-- للضبط لكل جامع من مفتاح "visit_criteria" في mosque_settings. المخزَّن هنا
-- الزيارات ودرجات معاييرها فقط.

-- زيارة واحدة مجدولة لحلقة، يسجّلها مشرف جمعية (association_id يُملأ) أو
-- مدير جامع (association_id فارغ). status: scheduled | done | cancelled.
-- visited_at تُملأ عند الإنهاء، وoverall_score (٠..١٠٠) تُحسب بالكود من
-- درجات المعايير (كل معيار ٠..٥) وتُخزَّن لقطةً — فلا تُقبل من العميل.
CREATE TABLE IF NOT EXISTS supervisor_visits (
  id              SERIAL      PRIMARY KEY,
  association_id  INTEGER     REFERENCES associations(id) ON DELETE SET NULL,
  mosque_id       INTEGER     NOT NULL REFERENCES mosques(id) ON DELETE CASCADE,
  halaqah_id      INTEGER     NOT NULL REFERENCES halaqahs(id) ON DELETE CASCADE,
  visitor_kind    TEXT        NOT NULL
                  CHECK (visitor_kind IN ('association_admin', 'mosque_admin')),
  visitor_id      INTEGER,
  visitor_name    TEXT        NOT NULL DEFAULT '',
  scheduled_for   DATE        NOT NULL,
  visited_at      TIMESTAMPTZ,
  status          TEXT        NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled', 'done', 'cancelled')),
  overall_score   INTEGER     CHECK (overall_score BETWEEN 0 AND 100),
  notes           TEXT        NOT NULL DEFAULT '',
  recommendations TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supervisor_visits_mosque_idx ON supervisor_visits (mosque_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS supervisor_visits_halaqah_idx ON supervisor_visits (halaqah_id, status);
CREATE INDEX IF NOT EXISTS supervisor_visits_association_idx ON supervisor_visits (association_id) WHERE association_id IS NOT NULL;

-- درجة كل معيار (٠..٥) بزيارة واحدة — المفتاح (الزيارة، المعيار). سُمّيت
-- بالمفتاح لا بمعرّف قائمة المعايير لأن القائمة قابلة للضبط لكل جامع
-- وتتغيّر مفاتيحها بالإعدادات، والدرجات المخزَّنة تبقى كما سُجّلت.
CREATE TABLE IF NOT EXISTS visit_criteria_scores (
  visit_id       INTEGER NOT NULL REFERENCES supervisor_visits(id) ON DELETE CASCADE,
  criterion_key  TEXT    NOT NULL,
  score          INTEGER NOT NULL CHECK (score BETWEEN 0 AND 5),
  note           TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (visit_id, criterion_key)
);
