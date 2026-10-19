"use client";

import { TeacherAuthScreen } from "./teacher-auth";

/*
  صفحة /signup العامة — نفس شاشة دخول/تسجيل المعلّم بوضع "حساب جديد"
  افتراضياً (دعوة الزميل ?join= تعمل هنا كما كانت على "/"). بعد النجاح:
  تحميل كامل لـ"/" حيث الجلسة مضبوطة فتُفتح لوحة المعلّم مباشرة.
*/
export function SignupForm() {
  return (
    <TeacherAuthScreen
      initialMode="register"
      onAuthenticated={() => {
        window.location.href = "/";
      }}
    />
  );
}
