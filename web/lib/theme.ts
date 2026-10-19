/*
  المظهر (فاتح/داكن/تلقائي) — يُخزَّن بـlocalStorage داخل try/catch، ويُطبَّق
  بضبط data-theme على <html>. «تلقائي» = بلا سمة، فيحكم prefers-color-scheme
  من globals.css. THEME_INIT_SCRIPT سكربت مضمّن صغير بالتخطيط الجذري ينفّذ
  قبل أول رسم فلا يومض المظهر الخاطئ.
*/

export type ThemeChoice = "light" | "dark" | "auto";

export const THEME_KEY = "halaqa-theme";

export const THEME_OPTIONS: { value: ThemeChoice; label: string }[] = [
  { value: "light", label: "فاتح" },
  { value: "dark", label: "داكن" },
  { value: "auto", label: "تلقائي" },
];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "auto";
}

/** يقرأ الاختيار المحفوظ؛ أي فشل (وضع خاص/حجب التخزين) = تلقائي */
export function readStoredTheme(): ThemeChoice {
  try {
    const value = window.localStorage.getItem(THEME_KEY);
    return isThemeChoice(value) ? value : "auto";
  } catch {
    return "auto";
  }
}

/** يطبّق الاختيار على <html> ويحفظه (الحفظ اختياري: فشله لا يمنع التطبيق) */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === "auto") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  try {
    if (choice === "auto") window.localStorage.removeItem(THEME_KEY);
    else window.localStorage.setItem(THEME_KEY, choice);
  } catch {
    // التخزين غير متاح — المظهر مطبّق لهذه الجلسة فقط
  }
}

/** نص السكربت المضمّن (يُحقن كما هو بالتخطيط الجذري — لا يعتمد على أي شيء خارجه) */
export const THEME_INIT_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;
