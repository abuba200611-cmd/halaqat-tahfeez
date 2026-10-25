import type { Metadata } from "next";
import { RegisterAssociationForm } from "@/components/register-association-form";

export const metadata: Metadata = {
  title: "تسجيل جمعية — السلام",
  description: "أرسل طلب تسجيل جمعيتك في منصة السلام لتتابع جوامعها في لوحة واحدة.",
};

export default function RegisterAssociationPage() {
  return <RegisterAssociationForm />;
}
