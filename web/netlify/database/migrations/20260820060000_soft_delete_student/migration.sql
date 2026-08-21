-- حذف ناعم للطالب: يبقى السطر بالقاعدة ٢٤ ساعة قابلاً للاسترجاع بدل
-- الحذف الفوري النهائي، تفادياً لضغطة خطأ.
ALTER TABLE students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
