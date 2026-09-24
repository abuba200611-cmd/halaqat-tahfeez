/**
 * الغلاف البصري المشترك لصفحات الدخول/إنشاء الحساب/استرجاع كلمة المرور
 * (STEP 43 — يطابق مرجع "بطاقة زجاجية فوق خلفية داكنة بكرات متدرّجة").
 * شكل فقط: لا منطق مصادقة هنا، فقط الخلفية + إطار البطاقة الزجاجية.
 */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden px-4 py-10" style={{ backgroundColor: "#0B0B0F" }}>
      <AuthBackground />
      <div className="relative z-10 w-full max-w-sm">{children}</div>
    </div>
  );
}

export function AuthCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden rounded-[32px] border border-white/15 p-6 shadow-2xl backdrop-blur-2xl sm:p-8"
      style={{
        background:
          "linear-gradient(165deg, rgba(124,58,237,0.22) 0%, rgba(20,14,32,0.55) 45%, rgba(11,11,15,0.75) 100%)",
        boxShadow: "0 30px 80px -20px rgba(0,0,0,0.6)",
      }}
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "radial-gradient(1px 1px at 15% 20%, rgba(255,255,255,0.5), transparent), radial-gradient(1px 1px at 75% 15%, rgba(255,255,255,0.4), transparent), radial-gradient(1.5px 1.5px at 40% 45%, rgba(255,255,255,0.35), transparent), radial-gradient(1px 1px at 85% 60%, rgba(255,255,255,0.3), transparent), radial-gradient(1px 1px at 25% 75%, rgba(255,255,255,0.4), transparent), radial-gradient(1.5px 1.5px at 60% 85%, rgba(255,255,255,0.3), transparent), radial-gradient(1px 1px at 90% 90%, rgba(255,255,255,0.35), transparent)",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

function Blob({
  size,
  top,
  bottom,
  left,
  right,
  gradient,
  blur,
  opacity = 1,
  duration,
  delay = "0s",
}: {
  size: number;
  top?: string;
  bottom?: string;
  left?: string;
  right?: string;
  gradient: string;
  blur: number;
  opacity?: number;
  duration: string;
  delay?: string;
}) {
  return (
    <span
      className="absolute rounded-full"
      style={{
        width: size,
        height: size,
        top,
        bottom,
        left,
        right,
        background: gradient,
        filter: `blur(${blur}px)`,
        opacity,
        animation: `auth-float ${duration} ease-in-out ${delay} infinite alternate`,
      }}
    />
  );
}

function AuthBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{`
        @keyframes auth-float {
          from { transform: translateY(0px); }
          to { transform: translateY(-22px); }
        }
      `}</style>
      <Blob size={420} top="-140px" left="-160px" gradient="linear-gradient(135deg, #7C3AED, #A855F7)" blur={70} opacity={0.55} duration="9s" />
      <Blob size={340} bottom="-140px" right="-120px" gradient="linear-gradient(135deg, #F97316, #EF4444)" blur={80} opacity={0.5} duration="11s" delay="1.5s" />
      <Blob size={70} top="14%" right="8%" gradient="linear-gradient(135deg, #A855F7, #7C3AED)" blur={4} opacity={0.85} duration="7s" delay="0.5s" />
      <Blob size={40} bottom="12%" left="7%" gradient="linear-gradient(135deg, #D97706, #92400E)" blur={2} opacity={0.85} duration="8s" delay="2s" />
    </div>
  );
}
