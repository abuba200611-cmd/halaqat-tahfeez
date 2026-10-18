"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { SearchIcon, XIcon } from "./icons";
import { NODE_TYPES, NODE_TYPE_INFO, type GraphNode, type MosqueGraph, type NodeType } from "@/lib/mosque/graph-types";
import { SETTLED, createSimNode, stepSimulation, type SimLink, type SimNode } from "@/lib/mosque/graph-sim";

/*
  خريطة الدماغ: Canvas مظلم بمحاكاة قوى يدوية (لآلاف العقد). تحريك الخلفية
  وتكبير (عجلة/قرص) وسحب العقد، تمرير يبرز العقدة وجيرانها، ضغط يفتح لوحة
  تفاصيل. المحرّك (createEngine) خارج React: يقرأ العرض الحالي من دالة.
*/

type Prepared = { nodes: GraphNode[]; degrees: number[]; neighbors: number[][]; links: SimLink[] };
type View = { selected: number; hidden: ReadonlySet<NodeType>; query: string };
type Engine = { redraw: () => void; focus: (index: number) => void; destroy: () => void };

const BG = "#14100C";
const BASE_RADIUS: Record<NodeType, number> = { mosque: 10, halaqah: 6, teacher: 5, student: 2.5, pending: 3, feature: 5, note: 4, family: 6, committee: 6, member: 3, badge: 4, activity: 4 };
const FONT = "system-ui, 'Segoe UI', Tahoma, sans-serif";

function prepare(graph: MosqueGraph): Prepared {
  const index = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const neighbors: number[][] = graph.nodes.map(() => []);
  const links: SimLink[] = [];
  for (const edge of graph.edges) {
    const a = index.get(edge.source);
    const b = index.get(edge.target);
    if (a === undefined || b === undefined) continue;
    links.push({ a, b });
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  return { nodes: graph.nodes, degrees: neighbors.map((list) => list.length), neighbors, links };
}

const radiusOf = (node: GraphNode, degree: number) =>
  BASE_RADIUS[node.type] +
  Math.sqrt(degree) * 1.5 +
  // طالب أعلى تفاعلاً يكبر قليلاً — التفاعل من مقاييس الحلقة
  (typeof node.meta.engagementScore === "number" ? (node.meta.engagementScore / 100) * 1.5 : 0);

function createEngine(
  canvas: HTMLCanvasElement,
  data: Prepared,
  getView: () => View,
  onSelect: (index: number) => void,
): Engine {
  const ctx = canvas.getContext("2d");
  const sim: SimNode[] = data.nodes.map((node, i) => createSimNode(i, radiusOf(node, data.degrees[i])));
  const isHub = (i: number) =>
    data.nodes[i].type === "mosque" ||
    data.nodes[i].type === "halaqah" ||
    data.nodes[i].meta.hub === true ||
    data.degrees[i] >= 8;

  let alpha = 1;
  for (let i = 0; i < 40; i++) alpha = stepSimulation(sim, data.links, data.degrees, alpha);

  let width = 0;
  let height = 0;
  let dpr = 1;
  let tx = 0;
  let ty = 0;
  let k = 1;
  let autoFit = true;
  let hover = -1;
  let raf = 0;
  let matchCache: { query: string; set: Set<number> | null } = { query: "", set: null };

  const visible = (i: number) => !getView().hidden.has(data.nodes[i].type);

  function matches(query: string): Set<number> | null {
    const needle = query.trim().toLowerCase();
    if (!needle) return null;
    if (matchCache.query !== needle) {
      const set = new Set<number>();
      data.nodes.forEach((node, i) => node.label.toLowerCase().includes(needle) && set.add(i));
      matchCache = { query: needle, set };
    }
    return matchCache.set;
  }

  function fitTarget() {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    sim.forEach((node, i) => {
      if (!visible(i)) return;
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x);
      maxY = Math.max(maxY, node.y);
    });
    if (minX === Infinity) return { tx, ty, k };
    const fitK = Math.min(2, Math.max(0.05, Math.min(width / (maxX - minX + 120), height / (maxY - minY + 120))));
    return { k: fitK, tx: width / 2 - ((minX + maxX) / 2) * fitK, ty: height / 2 - ((minY + maxY) / 2) * fitK };
  }

  function draw() {
    if (!ctx || width === 0) return;
    const view = getView();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, width, height);
    ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * tx, dpr * ty);

    const focus = hover >= 0 ? hover : view.selected;
    const near = focus >= 0 ? new Set([focus, ...data.neighbors[focus]]) : null;
    const found = matches(view.query);
    const lit = near ?? found;
    const dim = (i: number) => lit !== null && !lit.has(i);

    const left = -tx / k - 60;
    const top = -ty / k - 60;
    const right = (width - tx) / k + 60;
    const bottom = (height - ty) / k + 60;
    const onScreen = (n: SimNode) => n.x > left && n.x < right && n.y > top && n.y < bottom;

    // الحوافّ: العادية دفعة واحدة، والمبرَزة (تخص العقدة المركَّز عليها) فوقها
    ctx.lineWidth = Math.min(1.5, 1 / k);
    ctx.strokeStyle = lit ? "rgba(150,150,150,0.07)" : "rgba(150,150,150,0.25)";
    ctx.beginPath();
    for (const link of data.links) {
      if (!visible(link.a) || !visible(link.b) || link.a === focus || link.b === focus) continue;
      if (!onScreen(sim[link.a]) && !onScreen(sim[link.b])) continue;
      ctx.moveTo(sim[link.a].x, sim[link.a].y);
      ctx.lineTo(sim[link.b].x, sim[link.b].y);
    }
    ctx.stroke();
    if (focus >= 0) {
      ctx.strokeStyle = "rgba(230,230,230,0.75)";
      ctx.beginPath();
      for (const j of data.neighbors[focus]) {
        if (!visible(focus) || !visible(j)) continue;
        ctx.moveTo(sim[focus].x, sim[focus].y);
        ctx.lineTo(sim[j].x, sim[j].y);
      }
      ctx.stroke();
    }

    data.nodes.forEach((node, i) => {
      const n = sim[i];
      if (!visible(i) || !onScreen(n)) return;
      ctx.globalAlpha = dim(i) ? 0.12 : 1;
      ctx.fillStyle = NODE_TYPE_INFO[node.type].color;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
      if (i === focus || (found?.has(i) && lit === found)) {
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5 / k;
        ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;

    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    data.nodes.forEach((node, i) => {
      const n = sim[i];
      if (!visible(i) || !onScreen(n) || dim(i)) return;
      const emphasized = i === focus || lit !== null;
      if (!emphasized && !isHub(i) && k < 1.6) return;
      const size = (i === focus ? 14 : 12) / k;
      ctx.font = `${i === focus ? "600 " : ""}${size}px ${FONT}`;
      ctx.fillStyle = i === focus ? "#ffffff" : "#CDB49E";
      ctx.fillText(node.label, n.x, n.y + n.r + 2 / k);
    });
  }

  function loop() {
    raf = 0;
    const active = alpha > SETTLED;
    if (active) alpha = stepSimulation(sim, data.links, data.degrees, alpha);
    if (autoFit) {
      const target = fitTarget();
      const ease = active ? 0.12 : 1;
      k += (target.k - k) * ease;
      tx += (target.tx - tx) * ease;
      ty += (target.ty - ty) * ease;
    }
    draw();
    if (alpha > SETTLED) schedule();
  }

  function schedule() {
    if (!raf) raf = requestAnimationFrame(loop);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const first = width === 0;
    width = rect.width;
    height = rect.height;
    dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    if (first) {
      const target = fitTarget();
      ({ k, tx, ty } = target);
    }
    schedule();
  }

  function zoomAt(sx: number, sy: number, nextK: number) {
    nextK = Math.min(6, Math.max(0.05, nextK));
    tx = sx - ((sx - tx) / k) * nextK;
    ty = sy - ((sy - ty) / k) * nextK;
    k = nextK;
    autoFit = false;
    schedule();
  }

  function hit(sx: number, sy: number): number {
    const x = (sx - tx) / k;
    const y = (sy - ty) / k;
    let best = -1;
    let bestDist = Infinity;
    sim.forEach((n, i) => {
      if (!visible(i)) return;
      const dist = Math.hypot(n.x - x, n.y - y);
      if (dist <= n.r + 4 / k && dist < bestDist) {
        best = i;
        bestDist = dist;
      }
    });
    return best;
  }

  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = -1;
  let moved = false;
  let downAt = { x: 0, y: 0 };
  let pinch = 0;

  const local = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  function onDown(e: PointerEvent) {
    const p = local(e);
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, p);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = Math.hypot(a.x - b.x, a.y - b.y);
      if (dragging >= 0) sim[dragging].fixed = false;
      dragging = -1;
      moved = true;
      return;
    }
    downAt = p;
    moved = false;
    dragging = hit(p.x, p.y);
    if (dragging >= 0) sim[dragging].fixed = true;
  }

  function onMove(e: PointerEvent) {
    const p = local(e);
    const prev = pointers.get(e.pointerId);
    if (!prev) {
      if (e.pointerType !== "mouse") return;
      const over = hit(p.x, p.y);
      canvas.style.cursor = over >= 0 ? "pointer" : "grab";
      if (over !== hover) {
        hover = over;
        schedule();
      }
      return;
    }
    pointers.set(e.pointerId, p);

    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch > 0) zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (k * dist) / pinch);
      pinch = dist;
      return;
    }

    if (!moved && Math.hypot(p.x - downAt.x, p.y - downAt.y) < 4) return;
    moved = true;
    autoFit = false;
    if (dragging >= 0) {
      sim[dragging].x = (p.x - tx) / k;
      sim[dragging].y = (p.y - ty) / k;
      alpha = Math.max(alpha, 0.3);
    } else {
      tx += p.x - prev.x;
      ty += p.y - prev.y;
    }
    schedule();
  }

  function onUp(e: PointerEvent) {
    if (!pointers.delete(e.pointerId)) return;
    pinch = 0;
    if (dragging >= 0) sim[dragging].fixed = false;
    if (!moved && pointers.size === 0) onSelect(hit(downAt.x, downAt.y));
    dragging = -1;
    schedule();
  }

  function onLeave() {
    if (hover !== -1) {
      hover = -1;
      schedule();
    }
  }

  function onWheel(e: WheelEvent) {
    e.preventDefault();
    const p = { x: e.clientX - canvas.getBoundingClientRect().left, y: e.clientY - canvas.getBoundingClientRect().top };
    zoomAt(p.x, p.y, k * Math.exp(-e.deltaY * 0.0015));
  }

  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerup", onUp);
  canvas.addEventListener("pointercancel", onUp);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("wheel", onWheel, { passive: false });
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);

  return {
    redraw: schedule,
    focus: (index) => {
      autoFit = false;
      k = Math.max(k, 1.6);
      tx = width / 2 - sim[index].x * k;
      ty = height / 2 - sim[index].y * k;
      schedule();
    },
    destroy: () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("wheel", onWheel);
    },
  };
}

const META_LABELS: Record<string, string> = {
  city: "المدينة",
  teacherName: "المعلّم",
  studentCount: "عدد الطلاب",
  halaqah: "الحلقة",
  group: "المجموعة",
  pages: "الصفحات",
  active: "نشط",
  error: "الحالة",
  status: "الحالة",
  waiting: "بانتظار التوزيع",
  tags: "الوسوم",
  leader: "رئيس الأسرة",
  memberCount: "عدد الأفراد",
  engagementScore: "درجة التفاعل",
  avgEngagement: "متوسط التفاعل",
  attendanceRate: "نسبة الحضور",
  streak: "أيام متتابعة",
};

function metaValue(key: string, value: string | number | boolean): string {
  if (key === "error") return "تعذّر جلب الطلاب";
  if (key === "status") return value === "pending" ? "بانتظار التوزيع" : "موزَّع على حلقة";
  // درجات الحلقة (0-100) تُعرض بنسبة مئوية
  if (key === "engagementScore" || key === "avgEngagement" || key === "attendanceRate") return `${value}٪`;
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  return String(value);
}

export function BrainGraph({ graph }: { graph: MosqueGraph }) {
  const data = useMemo(() => prepare(graph), [graph]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<Engine | null>(null);
  const viewRef = useRef<View>({ selected: -1, hidden: new Set(), query: "" });

  const [selected, setSelected] = useState(-1);
  const [hidden, setHidden] = useState<ReadonlySet<NodeType>>(new Set());
  const [query, setQuery] = useState("");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = createEngine(canvas, data, () => viewRef.current, setSelected);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    viewRef.current = { selected, hidden, query };
    engineRef.current?.redraw();
  }, [selected, hidden, query]);

  const counts = useMemo(() => {
    const result = Object.fromEntries(NODE_TYPES.map((type) => [type, 0])) as Record<NodeType, number>;
    for (const node of data.nodes) result[node.type]++;
    return result;
  }, [data]);

  function toggleType(type: NodeType) {
    const next = new Set(hidden);
    if (!next.delete(type)) next.add(type);
    setHidden(next);
  }

  function search(value: string) {
    setQuery(value);
    const needle = value.trim().toLowerCase();
    if (!needle) return;
    const first = data.nodes.findIndex((node) => !hidden.has(node.type) && node.label.toLowerCase().includes(needle));
    if (first >= 0) engineRef.current?.focus(first);
  }

  function open(index: number) {
    setSelected(index);
    engineRef.current?.focus(index);
  }

  const node = selected >= 0 ? data.nodes[selected] : null;

  return (
    <div className="relative h-[calc(100vh-10rem)] min-h-[28rem] overflow-hidden rounded-2xl border border-border bg-[#14100C] text-sand">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full cursor-grab touch-none" />

      <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-wrap items-center gap-2 p-3">
        <div className="pointer-events-auto relative min-w-44 flex-1 sm:max-w-xs">
          <SearchIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            value={query}
            onChange={(e) => search(e.target.value)}
            placeholder="ابحث عن اسم…"
            className="w-full rounded-xl border border-white/10 bg-black/40 py-2 pr-3 pl-9 text-sm text-white placeholder:text-neutral-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          />
        </div>
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          {NODE_TYPES.filter((type) => counts[type] > 0).map((type) => (
            <button
              key={type}
              onClick={() => toggleType(type)}
              aria-pressed={!hidden.has(type)}
              className={`flex cursor-pointer items-center gap-1.5 rounded-full border border-white/10 bg-black/40 px-2.5 py-1 text-xs transition-opacity duration-200 ${
                hidden.has(type) ? "opacity-40" : ""
              }`}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_TYPE_INFO[type].color }} />
              {NODE_TYPE_INFO[type].label}
              <span className="tabular text-stone-400">{counts[type]}</span>
            </button>
          ))}
        </div>
        <span className="tabular pointer-events-auto rounded-full bg-black/40 px-2.5 py-1 text-xs text-stone-400">
          {data.nodes.length} عقدة · {data.links.length} رابط
        </span>
      </div>

      {node && (
        <aside className="absolute inset-y-0 right-0 flex w-72 max-w-[85%] flex-col gap-3 overflow-y-auto border-l border-white/10 bg-[#1E1812]/95 p-4 pt-16 text-sm">
          <button
            onClick={() => setSelected(-1)}
            aria-label="إغلاق"
            className="absolute top-3 left-3 flex h-7 w-7 cursor-pointer items-center justify-center rounded-lg text-stone-400 hover:bg-white/10 hover:text-white"
          >
            <XIcon className="h-4 w-4" />
          </button>
          <div>
            <span className="flex items-center gap-1.5 text-xs text-stone-400">
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: NODE_TYPE_INFO[node.type].color }} />
              {NODE_TYPE_INFO[node.type].label}
            </span>
            <h2 className="mt-1 font-display text-lg font-bold text-white">{node.label}</h2>
          </div>

          <dl className="space-y-1">
            {Object.entries(node.meta)
              .filter(([key, value]) => key !== "hub" && key !== "key" && value !== "")
              .map(([key, value]) => (
                <div key={key} className="flex justify-between gap-3">
                  <dt className="text-stone-400">{META_LABELS[key] ?? key}</dt>
                  <dd className="text-left text-neutral-100">{metaValue(key, value)}</dd>
                </div>
              ))}
          </dl>

          <div>
            <p className="mb-1.5 text-xs text-stone-400">الارتباطات ({data.neighbors[selected].length})</p>
            <ul className="space-y-0.5">
              {data.neighbors[selected].map((j) => (
                <li key={j}>
                  <button
                    onClick={() => open(j)}
                    className="flex w-full cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-start hover:bg-white/10"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: NODE_TYPE_INFO[data.nodes[j].type].color }}
                    />
                    <span className="truncate">{data.nodes[j].label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
}
