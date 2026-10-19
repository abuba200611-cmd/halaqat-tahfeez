"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ChevronDownIcon } from "./icons";
import {
  computeVisible,
  groupKey,
  parseNavState,
  toggleCollapsed,
  toggleExpanded,
  type NavGroup,
  type NavState,
} from "@/lib/nav-groups";

const STORAGE_PREFIX = "nav-groups:v1:";

/** حالة الطيّ/التوسيع لكل قسم، محفوظة في localStorage (كل الوصول داخل try/catch) */
function useNavState(scope: string): [NavState, (update: (s: NavState) => NavState) => void] {
  const [state, setState] = useState<NavState>({});

  useEffect(() => {
    try {
      // قراءة التخزين بعد الترطيب عمداً (تجنّب اختلاف HTML بين الخادم والعميل)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(parseNavState(window.localStorage.getItem(STORAGE_PREFIX + scope)));
    } catch {
      /* التخزين غير متاح — نبقى على الافتراضي */
    }
  }, [scope]);

  const update = useCallback(
    (fn: (s: NavState) => NavState) => {
      setState((prev) => {
        const next = fn(prev);
        try {
          window.localStorage.setItem(STORAGE_PREFIX + scope, JSON.stringify(next));
        } catch {
          /* تجاهل */
        }
        return next;
      });
    },
    [scope],
  );

  return [state, update];
}

const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/**
 * قائمة أقسام على نمط يوتيوب: فواصل رفيعة، رأس قسم بسهم طيّ، و«عرض المزيد».
 * الألوان تأتي من الغلاف (headerClass/dividerClass) وعناصر القائمة من renderItem
 * حتى يخدم أكثر من هيكل بنفس السلوك.
 */
export function GroupedNav<T extends { href: string }>({
  groups,
  scope,
  isActive,
  renderItem,
  headerClass,
  dividerClass,
  toggleClass,
  pinned = false,
}: {
  groups: NavGroup<T>[];
  scope: string;
  isActive: (item: T) => boolean;
  renderItem: (item: T) => ReactNode;
  headerClass: string;
  dividerClass: string;
  toggleClass: string;
  /** يرسم الأقسام المثبّتة فقط (pinned) بدل غير المثبّتة */
  pinned?: boolean;
}) {
  const [state, update] = useNavState(scope);
  const entries = groups.map((g, i) => ({ g, i })).filter(({ g }) => Boolean(g.pinned) === pinned);

  return (
    <>
      {entries.map(({ g, i }, n) => {
        const key = groupKey(g, i);
        const v = computeVisible(g, state[key], isActive);
        const canCollapse = Boolean(g.collapsible && g.title);
        const listId = `navgrp-${scope}-${i}`;
        const showDivider = n > 0 || pinned;
        return (
          <div key={key} className={showDivider ? `mt-2 border-t pt-2 ${dividerClass}` : undefined}>
            {g.title &&
              (canCollapse ? (
                <button
                  type="button"
                  onClick={() => update((s) => toggleCollapsed(s, key))}
                  aria-expanded={!v.collapsed}
                  aria-controls={listId}
                  className={`flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide ${FOCUS} ${headerClass}`}
                >
                  <span className="flex-1 text-start">{g.title}</span>
                  <ChevronDownIcon size={14} className={`transition-transform duration-200 ${v.collapsed ? "rotate-90" : ""}`} />
                </button>
              ) : (
                <div className={`px-3 py-1.5 text-xs font-semibold tracking-wide ${headerClass}`}>{g.title}</div>
              ))}
            <div id={listId} className="space-y-1">
              {v.items.map((item) => (
                <div key={item.href}>{renderItem(item)}</div>
              ))}
            </div>
            {v.showToggle && !v.collapsed && (
              <button
                type="button"
                onClick={() => update((s) => toggleExpanded(s, key))}
                aria-expanded={v.expanded}
                aria-controls={listId}
                className={`mt-1 flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${FOCUS} ${toggleClass}`}
              >
                <ChevronDownIcon size={14} className={v.expanded ? "rotate-180" : ""} />
                {v.expanded ? "عرض أقل" : `عرض المزيد (${v.hiddenCount})`}
              </button>
            )}
          </div>
        );
      })}
    </>
  );
}
