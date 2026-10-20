/*
  بريد رمز استرجاع كلمة المرور — عربي بهوية «السلام»، بلا أي رابط.
  البريد لا يقرأ متغيرات CSS، فالألوان هنا قيم حرفية من رموز الهوية في globals.css
  (primary #000، accent-ink #7f5636، accent-soft #f0e4d2، background #f3ede6، border #e2d6c3).
*/

export const RESET_CODE_SUBJECT = "رمز استعادة كلمة المرور — السلام";

export function resetCodeEmailHtml(code: string): string {
  const spaced = code.split("").join(" ");
  return `<div dir="rtl" style="background:#f3ede6;padding:24px 12px;font-family:Tahoma,Arial,sans-serif;color:#000">
<div style="max-width:420px;margin:0 auto;background:#fff;border:1px solid #e2d6c3;border-radius:16px;padding:24px;text-align:center">
<p style="margin:0 0 4px;font-size:20px;font-weight:bold;color:#000">السلام</p>
<p style="margin:0 0 16px;font-size:14px;color:#5f5344">رمز استعادة كلمة المرور</p>
<p style="margin:0 0 8px;font-size:14px">اكتب هذا الرمز في صفحة الاسترجاع:</p>
<p dir="ltr" style="margin:12px 0;font-size:36px;font-weight:bold;letter-spacing:6px;color:#7f5636;background:#f0e4d2;border-radius:12px;padding:14px 8px">${spaced}</p>
<p style="margin:0 0 8px;font-size:14px">صالح لمدة ١٠ دقائق</p>
<p style="margin:0;font-size:12px;color:#5f5344">إذا ما طلبته تجاهل الرسالة</p>
</div></div>`;
}
