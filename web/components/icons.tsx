/**
 * أيقونات خطّية بسيطة (SVG inline، بلا مكتبة خارجية) — تُستخدم بلوحة
 * المعلّم (STEP 40) وأي مكان آخر يحتاجها لاحقاً. كل أيقونة 24×24 بخط
 * موحّد (stroke) يرث لونه من currentColor.
 */
type IconProps = { className?: string; size?: number };

function base(paths: React.ReactNode, { className = "", size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return base(
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M2.5 20c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M15.5 14.2c2.7.3 4.9 2.4 4.9 5.3" />
    </>,
    props,
  );
}

export function BookIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 5.5c0-1 .8-1.5 2-1.5h6v15H6c-1.2 0-2 .5-2 1.5v-15z" />
      <path d="M20 5.5c0-1-.8-1.5-2-1.5h-6v15h6c1.2 0 2 .5 2 1.5v-15z" />
    </>,
    props,
  );
}

export function CalendarIcon(props: IconProps) {
  return base(
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v3.5M16 3v3.5" />
    </>,
    props,
  );
}

export function FlameIcon(props: IconProps) {
  return base(
    <path d="M12 2.5c1 2 .5 3.4-.5 4.6C10.3 8.3 9 9.6 9 12a3 3 0 0 0 3 3 2.6 2.6 0 0 0 2.6-2.6c0-.9-.3-1.5-.8-2.2 1.7 1 3.2 3 3.2 5.3A5.8 5.8 0 0 1 11 21a5.8 5.8 0 0 1-5.8-6.3c.3-3.8 2.6-6 4.2-8C10.4 5.2 11.4 4 12 2.5z" />,
    props,
  );
}

export function PlusIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>,
    props,
  );
}

export function ShuffleIcon(props: IconProps) {
  return base(
    <>
      <path d="M3 6h3.5c2.5 0 3.8 1.5 5 3.5L15 15c1.2 2 2.5 3.5 5 3.5H21" />
      <path d="M17.5 3.5 21 6l-3.5 2.5" />
      <path d="M3 18h3.5c1.4 0 2.4-.5 3.3-1.4" />
      <path d="M13.4 8.4c.9-.9 1.9-1.4 3.3-1.4H21" />
      <path d="M17.5 20.5 21 18l-3.5-2.5" />
    </>,
    props,
  );
}

export function ChartIcon(props: IconProps) {
  return base(
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M22 20H2" />
    </>,
    props,
  );
}

export function MailIcon(props: IconProps) {
  return base(
    <>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M3.5 6.5 12 13l8.5-6.5" />
    </>,
    props,
  );
}

export function StarIcon(props: IconProps) {
  return base(
    <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8L6.7 20l1-6-4.3-4.2L9.4 9 12 3.5z" />,
    props,
  );
}

export function ArrowUpIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 19V5" />
      <path d="M6 11l6-6 6 6" />
    </>,
    props,
  );
}

export function ArrowDownIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 5v14" />
      <path d="M18 13l-6 6-6-6" />
    </>,
    props,
  );
}

export function SproutIcon(props: IconProps) {
  return base(
    <>
      <path d="M12 21v-8" />
      <path d="M12 13c0-3.5-2.3-5.5-6-5.5C6 11.2 8.3 13 12 13z" />
      <path d="M12 10c0-3 2-4.7 5-4.7 0 3-2 4.7-5 4.7z" />
    </>,
    props,
  );
}

export function PlayIcon(props: IconProps) {
  return base(<path d="M7 4.5v15l13-7.5-13-7.5z" />, props);
}

export function CheckCircleIcon(props: IconProps) {
  return base(
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 12.3l2.3 2.3 4.7-5" />
    </>,
    props,
  );
}
