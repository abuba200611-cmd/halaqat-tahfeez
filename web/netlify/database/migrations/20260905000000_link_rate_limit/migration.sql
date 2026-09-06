-- STEP 29 (F-02 Tier 1) — حماية المسارات الستة تحت /api/link من الفيضان
-- (invite-info, add-student, join, notify, roster, stats). جدول مستقل
-- تماماً عن register_attempts/student_link_attempts/login_attempts/
-- admin_login_attempts — لا يشارك عدّاده مع أي منها.
--
-- العدّ على ip وحده لا على (ip, endpoint): المستدعي الشرعي لا يُسجَّل
-- عليه صف إطلاقاً (يحمل السرّ الصحيح دائماً)، فلا يوجد false positive
-- نحميه بتفريق الحصص حسب المسار. أما المهاجم بلا سرّ فلا يهمّه أي مسار
-- يقصف، فتفريق الحصص كان سيمنحه ٦× الميزانية من نفس الـIP مقابل صفر
-- مكسب دفاعي. عمود endpoint يبقى لغرض تحقيقي فقط (أي مسار استُهدف)،
-- ويُكتب بكل صف، لكنه لا يدخل حساب العدّ ولا الفهرس.
--
-- يُسجَّل صف هنا فقط عند فشل مطابقة السرّ، وفقط طالما لم يتجاوز الـIP
-- الحدّ بعد — بمجرد التجاوز يُرجَع 429 مباشرة بلا أي INSERT إضافي. نداء
-- شرعي يحمل السرّ الصحيح لا يُستهلك من الحصة إطلاقاً ولا يُسجَّل — بهذا
-- يستحيل أن يحجب هذا الحدّ أياً من المستدعيين الشرعيين (tasjeel-tullab
-- أو masjid-idara)، حتى لو استدعيا المسار بالتوازي مرات كثيرة. الجدول
-- محدود النمو عملياً (~الحدّ من الصفوف لكل IP لكل نافذة) لأننا نتوقف عن
-- الإدراج بعد التجاوز — لا لأن الفشل نادر — فلا يحتاج retention في
-- الوضع الطبيعي حتى تحت فيضان فعلي.
CREATE TABLE IF NOT EXISTS link_attempts (
  id         SERIAL      PRIMARY KEY,
  ip         TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_link_attempts_ip_time
  ON link_attempts (ip, created_at);
