/*
  منطق نقي لتجميع عناصر القوائم الجانبية (على نمط يوتيوب): أقسام بعناوين
  قابلة للطيّ، و«عرض المزيد» للقسم الطويل. بلا React ولا DOM حتى يُختبر مباشرة.
*/

export type NavGroup<T> = {
  /** معرّف ثابت لحفظ حالة الطيّ؛ يُستنتج من العنوان إن غاب */
  id?: string;
  /** عنوان القسم؛ غيابه = عناصر بلا رأس (أعلى القائمة) */
  title?: string;
  items: T[];
  /** يظهر السهم ويمكن طيّ القسم كله (يتطلب عنواناً) */
  collapsible?: boolean;
  /** عدد العناصر الظاهرة قبل «عرض المزيد» */
  initialVisible?: number;
  /** قسم مثبّت أسفل القائمة فوق بطاقة المستخدم، ظاهر دائماً */
  pinned?: boolean;
};

export type GroupState = { collapsed?: boolean; expanded?: boolean };
export type NavState = Record<string, GroupState>;

export function groupKey<T>(group: NavGroup<T>, index: number): string {
  return group.id ?? group.title ?? `group-${index}`;
}

export function flattenNav<T>(groups: NavGroup<T>[]): T[] {
  return groups.flatMap((g) => g.items);
}

export type VisibleGroup<T> = {
  /** العناصر التي تُرسم الآن */
  items: T[];
  /** هل القسم مطويّ بالكامل (العنوان فقط) */
  collapsed: boolean;
  /** عدد العناصر المخفية خلف «عرض المزيد» */
  hiddenCount: number;
  /** هل يظهر زر «عرض المزيد/أقل» */
  showToggle: boolean;
  expanded: boolean;
};

/**
 * يحسب ما يُرسم لقسم واحد. العنصر النشط لا يُخفى أبداً: إن كان داخل الجزء
 * المخفي أو القسم مطويّ فالقسم يُعرض به حتى لا يضيع المستخدم.
 */
export function computeVisible<T>(
  group: NavGroup<T>,
  state: GroupState | undefined,
  isActive: (item: T) => boolean = () => false,
): VisibleGroup<T> {
  const canCollapse = Boolean(group.collapsible && group.title && !group.pinned);
  const hasActive = group.items.some(isActive);
  const collapsed = canCollapse && Boolean(state?.collapsed) && !hasActive;

  const limit = group.initialVisible;
  const limited = typeof limit === "number" && limit > 0 && group.items.length > limit && !group.pinned;
  const expanded = !limited || Boolean(state?.expanded);

  if (collapsed) {
    return { items: [], collapsed: true, hiddenCount: 0, showToggle: false, expanded };
  }
  if (!limited || expanded) {
    return { items: group.items, collapsed: false, hiddenCount: 0, showToggle: limited, expanded };
  }
  const shown = group.items.filter((item, i) => i < limit! || isActive(item));
  return {
    items: shown,
    collapsed: false,
    hiddenCount: group.items.length - shown.length,
    showToggle: true,
    expanded: false,
  };
}

/** يقرأ الحالة المخزّنة بأمان — أي شكل غير متوقع يُهمل */
export function parseNavState(raw: string | null | undefined): NavState {
  if (!raw) return {};
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return {};
    const out: NavState = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!value || typeof value !== "object") continue;
      const v = value as Record<string, unknown>;
      out[key] = { collapsed: v.collapsed === true, expanded: v.expanded === true };
    }
    return out;
  } catch {
    return {};
  }
}

export function toggleCollapsed(state: NavState, key: string): NavState {
  return { ...state, [key]: { ...state[key], collapsed: !state[key]?.collapsed } };
}

export function toggleExpanded(state: NavState, key: string): NavState {
  return { ...state, [key]: { ...state[key], expanded: !state[key]?.expanded } };
}

/** يقسّم قائمة مسطّحة إلى أقسام بحسب حقل group (للقوائم التي تُبنى مسطّحة) */
export function groupByField<T extends { group?: string }>(
  items: T[],
  defs: { id: string; title?: string; collapsible?: boolean; initialVisible?: number; pinned?: boolean }[],
): NavGroup<T>[] {
  const known = new Set(defs.map((d) => d.id));
  const first = defs[0]?.id;
  return defs
    .map((d) => ({
      ...d,
      items: items.filter((i) => (i.group && known.has(i.group) ? i.group : first) === d.id),
    }))
    .filter((g) => g.items.length > 0);
}
