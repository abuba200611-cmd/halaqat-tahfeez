import type { Metadata } from "next";
import { RegisterMosqueForm } from "@/components/register-mosque-form";

export const metadata: Metadata = {
  title: "تسجيل جامع — السلام",
  description: "أرسل طلب تسجيل جامعك في منصة السلام — نظام تشغيل الجامع.",
};

export default function RegisterMosquePage() {
  return <RegisterMosqueForm />;
}
