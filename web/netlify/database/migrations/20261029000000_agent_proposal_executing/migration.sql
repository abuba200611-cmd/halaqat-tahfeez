-- M6 — حالة executing لمقترحات الإيجنت: يُحجز المقترح ذرّياً (pending → executing)
-- قبل التنفيذ فلا ينفَّذ مرتين عند الضغط المزدوج. idempotent: يبحث عن قيد CHECK
-- على عمود status (اسمه تلقائي من الإنشاء المضمّن) ويستبدله، ويتجاوز إن كان محدَّثاً.

DO $$
DECLARE
  con RECORD;
  has_executing BOOLEAN := FALSE;
BEGIN
  FOR con IN
    SELECT c.conname, pg_get_constraintdef(c.oid) AS def
    FROM pg_constraint c
    WHERE c.conrelid = 'agent_proposals'::regclass
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) ILIKE '%status%'
  LOOP
    IF con.def ILIKE '%executing%' THEN
      has_executing := TRUE;
    ELSE
      EXECUTE format('ALTER TABLE agent_proposals DROP CONSTRAINT %I', con.conname);
    END IF;
  END LOOP;

  IF NOT has_executing THEN
    ALTER TABLE agent_proposals
      ADD CONSTRAINT agent_proposals_status_check
      CHECK (status IN ('pending', 'executing', 'approved', 'rejected', 'failed'));
  END IF;
END
$$;
