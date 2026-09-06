-- STEP 33 (F-05 — الجزء الداخلي من الخيار G + F-12) — حماية مسارَي
-- تخمين رموز الدعوة اللذين يسمحان بذلك بلا LINK_SECRET إطلاقاً:
--   POST /api/student-auth/google/complete-invite  (invite_code، ٤٠ بت)
--   GET  /api/teacher/join-info                    (teacher_invite_code، ٤٠ بت)
-- جدول مستقل تماماً عن register_attempts/student_link_attempts/
-- login_attempts/admin_login_attempts/link_attempts — لا يشارك عدّاده
-- مع أي منها، ولا يُعاد استخدام أي جدول قائم.
--
-- العدّ على ip وحده لا (ip, endpoint): كلا المسارين يخمّن نفس نوع
-- الغرض (رمز دعوة ٤٠ بت)، وتفريق الحصة بينهما يمنح المهاجم ضِعف
-- الميزانية من نفس الـIP بلا أي مكسب دفاعي. عمود endpoint يبقى لغرض
-- تحقيقي فقط (أي مسار استُهدف)، لا يدخل حساب العدّ ولا الفهرس.
--
-- يُسجَّل صف هنا فقط عند فشل رمز الدعوة (لا عند مدخلات ناقصة/جلسة
-- منتهية — تلك ليست تخميناً)، وفقط طالما لم يتجاوز الـIP الحدّ بعد —
-- بمجرد التجاوز يُرجَع 429 مباشرة بلا أي INSERT إضافي (نفس نمط
-- link_attempts، STEP 29). خلافاً لـlink_attempts، مستخدم شرعي *يمكن*
-- أن يفشل هنا فعلاً (خطأ طباعي، أو رابط دعوة معلّم قديم) — العتبة يجب
-- أن تستوعب ذلك، لا أن تفترض استحالته.
--
-- ويُحسب كذلك فرع الاستثناء (٥٠٠) في complete-invite، لا لأنه فشل رمز
-- بل لعكس ذلك تماماً: بلوغه يعني أن رمز الدعوة كان صحيحاً وأن الفشل جاء
-- بعده (مثل تكرار provider_subject تحت UNIQUE). فلو أُعفي من العدّ لصار
-- الفرع الأكثر كشفاً هو الوحيد بلا سقف — ومهاجم حسابه مربوط أصلاً يرى
-- ٤٠٤ للرمز الخاطئ و٥٠٠ للصحيح، فيعدّد الرموز الصحيحة بلا حدّ.
--
-- الجدول محدود النمو عملياً (~الحدّ من الصفوف لكل IP لكل نافذة) لأننا
-- نتوقف عن الإدراج بعد التجاوز — لا لأن الفشل نادر — فلا يحتاج
-- retention في الوضع الطبيعي حتى تحت فيضان فعلي.
CREATE TABLE IF NOT EXISTS invite_attempts (
  id         SERIAL      PRIMARY KEY,
  ip         TEXT        NOT NULL,
  endpoint   TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invite_attempts_ip_time
  ON invite_attempts (ip, created_at);
