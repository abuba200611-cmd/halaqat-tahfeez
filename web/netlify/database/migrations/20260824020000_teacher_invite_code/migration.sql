-- رمز دعوة قصير فريد لكل معلّم — يبني رابط تسجيل مباشر يشاركه مع طلابه
-- عبر أي وسيلة (واتساب مثلاً)، ينضمون منه لحلقته بدون أي إدخال يدوي.
ALTER TABLE teachers ADD COLUMN IF NOT EXISTS invite_code TEXT UNIQUE;
