"use client";

import { useCallback, useSyncExternalStore } from "react";
import { generateDemoStudents } from "./demo";
import type { Student } from "./types";

/*
  مخزن الطلاب. البيانات تعيش على الخادم في SQLite، وهذي طبقة عميل
  تحتفظ بنسخة في الذاكرة حتى تبقى واجهة useStudents متزامنة كما كانت.
  الكتابة متفائلة: نحدّث النسخة المحلية فوراً ثم نرسلها، وإن فشل
  الإرسال نعيد الجلب من الخادم حتى لا تفترق النسختان.
*/

export type StoreState = {
  students: Student[];
  /** يُجلب الآن — لتفادي وميض «القائمة فارغة» قبل وصول البيانات */
  loading: boolean;
  /** الجلسة صالحة؛ false تعني أن على المستخدم تسجيل الدخول */
  authed: boolean;
  error: string | null;
};

const EMPTY: Student[] = [];
const SERVER_STATE: StoreState = { students: EMPTY, loading: true, authed: true, error: null };

/** مفتاح التخزين المحلي القديم — يُرحَّل مرة واحدة ثم يُمسح */
const LEGACY_KEY = "halaqa.students.v1";

let state: StoreState = { students: EMPTY, loading: true, authed: true, error: null };
let fetchStarted = false;
let migrationTried = false;
const listeners = new Set<() => void>();

function setState(patch: Partial<StoreState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

/**
 * يرفع بيانات النسخة القديمة (localStorage) إلى الخادم مرة واحدة،
 * حتى لا تضيع حلقة أدخلها المعلّم قبل إضافة الحسابات.
 */
async function migrateLegacyStudents(): Promise<boolean> {
  migrationTried = true;
  try {
    const raw = window.localStorage.getItem(LEGACY_KEY);
    if (!raw) return false;

    const legacy = JSON.parse(raw) as Student[];
    if (!Array.isArray(legacy) || legacy.length === 0) {
      window.localStorage.removeItem(LEGACY_KEY);
      return false;
    }

    const res = await fetch("/api/students", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ students: legacy }),
    });
    if (!res.ok) return false;

    window.localStorage.removeItem(LEGACY_KEY);
    return true;
  } catch {
    return false;
  }
}

async function loadFromServer() {
  try {
    const res = await fetch("/api/students");
    if (res.status === 401) {
      setState({ loading: false, authed: false, students: EMPTY });
      return;
    }

    const data = (await res.json()) as { students?: Student[] };
    let students = data.students ?? EMPTY;

    // حساب فارغ + بيانات محلية قديمة ⇒ نرحّلها ثم نقرأ من الخادم
    if (students.length === 0 && !migrationTried && (await migrateLegacyStudents())) {
      const after = await fetch("/api/students");
      if (after.ok) {
        students = ((await after.json()) as { students?: Student[] }).students ?? EMPTY;
      }
    }

    setState({ students, loading: false, authed: true, error: null });
  } catch {
    setState({ loading: false, error: "تعذّر الاتصال بالخادم" });
  }
}

/** يُستدعى بعد أي كتابة فاشلة حتى تعود النسخة المحلية لمطابقة الخادم */
async function refetch() {
  await loadFromServer();
}

async function send(method: "POST" | "PUT" | "DELETE", body: unknown) {
  try {
    const res = await fetch("/api/students", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      setState({ authed: false });
      return;
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setState({ error: data.error ?? "تعذّر الحفظ" });
      await refetch();
      return;
    }
    setState({ error: null });
  } catch {
    setState({ error: "تعذّر الاتصال بالخادم" });
    await refetch();
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!fetchStarted) {
    fetchStarted = true;
    void loadFromServer();
  }
  return () => {
    listeners.delete(fn);
  };
}

function getSnapshot() {
  return state;
}

function getServerSnapshot() {
  return SERVER_STATE;
}

export function useStudents() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setStudents = useCallback((next: Student[]) => {
    setState({ students: next });
    void send("PUT", { students: next });
  }, []);

  const upsert = useCallback((student: Student) => {
    const current = state.students;
    const index = current.findIndex((s) => s.id === student.id);
    setState({
      students:
        index === -1
          ? [...current, student]
          : current.map((s) => (s.id === student.id ? student : s)),
    });
    void send("POST", { student });
  }, []);

  const remove = useCallback((id: string) => {
    setState({ students: state.students.filter((s) => s.id !== id) });
    void send("DELETE", { id });
  }, []);

  // العدد يحدّده المعلّم — الحلقات تتفاوت، ولا رقم ثابت يناسب الجميع
  const loadDemo = useCallback(
    (count: number) => setStudents(generateDemoStudents(count)),
    [setStudents],
  );

  const clear = useCallback(() => setStudents([]), [setStudents]);

  return {
    students: snapshot.students,
    loading: snapshot.loading,
    authed: snapshot.authed,
    error: snapshot.error,
    setStudents,
    upsert,
    remove,
    loadDemo,
    clear,
  };
}

/** يمسح النسخة المحلية بعد تسجيل الخروج أو الدخول بحساب آخر */
export function resetStore() {
  fetchStarted = false;
  state = { students: EMPTY, loading: true, authed: true, error: null };
  listeners.forEach((fn) => fn());
}
