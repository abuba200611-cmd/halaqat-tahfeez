/*
  سجل الموصّلات (Connectors): بيانات وصفية وبطاقات واجهة فقط. لا موصّل منها
  منفَّذ بعد — كلها تتطلب بيانات ربط (واجهة/اعتماد) من المزوّد نفسه، ولا نخمّن
  واجهاتهم. الحالة الوحيدة المتاحة اليوم: "needs_provider_credentials".
*/

export const CONNECTOR_STATUS_AR = "يتطلب بيانات الربط من المزوّد";

export type ConnectorStatus = "needs_provider_credentials";

export type Connector = {
  key: string;
  nameAr: string;
  nameEn: string;
  descriptionAr: string;
  status: ConnectorStatus;
  statusAr: string;
};

export const CONNECTORS: readonly Connector[] = [
  {
    key: "classera",
    nameAr: "كلاسيرا",
    nameEn: "Classera",
    descriptionAr: "منصة إدارة التعلّم — مزامنة الطلاب والحلقات والحضور مع منصة المدرسة.",
    status: "needs_provider_credentials",
    statusAr: CONNECTOR_STATUS_AR,
  },
  {
    key: "khairkum",
    nameAr: "خيركم",
    nameEn: "Khairkum",
    descriptionAr: "منصة خيركم لتحفيظ القرآن — تبادل بيانات الطلاب وتقدّم الحفظ.",
    status: "needs_provider_credentials",
    statusAr: CONNECTOR_STATUS_AR,
  },
  {
    key: "google_sheets",
    nameAr: "جداول جوجل",
    nameEn: "Google Sheets",
    descriptionAr: "تصدير الحضور والتقدّم إلى جدول جوجل يُحدَّث دورياً.",
    status: "needs_provider_credentials",
    statusAr: CONNECTOR_STATUS_AR,
  },
];

export function getConnector(key: string): Connector | undefined {
  return CONNECTORS.find((c) => c.key === key);
}
