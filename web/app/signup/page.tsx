import type { Metadata } from "next";
import { SignupForm } from "@/components/signup-form";

export const metadata: Metadata = {
  title: "إنشاء حساب معلّم — السلام",
  description: "أنشئ حسابك وابدأ إدارة حلقتك في منصة السلام — نظام تشغيل الجامع.",
};

export default function SignupPage() {
  return <SignupForm />;
}
