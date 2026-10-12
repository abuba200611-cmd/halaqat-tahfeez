/*
  محاكاة قوى مكتوبة يدوياً للرسم (بلا مكتبات): تنافر بين العقد القريبة
  (شبكة خلايا حتى لا تكون O(n²) على آلاف العقد)، نوابض على الحوافّ،
  وجاذبية نحو المركز. alpha يبرد تدريجياً — وحين يقل عن SETTLED تتوقف الحلقة.
*/

export type SimNode = { x: number; y: number; vx: number; vy: number; r: number; fixed: boolean };
export type SimLink = { a: number; b: number };

export const SETTLED = 0.004;
const ALPHA_DECAY = 0.985;
const REPEL_RANGE = 70;
const REPEL_STRENGTH = 6;
const SPRING_LENGTH = 26;
const SPRING_STRENGTH = 0.25;
const GRAVITY = 0.012;
const DAMPING = 0.6;

/** عقدة جديدة على حلزون ذهبي حول المركز — تشتّتاً حتمياً بلا عشوائية */
export function createSimNode(index: number, r: number): SimNode {
  const radius = 14 * Math.sqrt(index + 1);
  const angle = index * 2.399963;
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius, vx: 0, vy: 0, r, fixed: false };
}

/** خطوة واحدة؛ تعيد alpha التالية (تبريد) */
export function stepSimulation(nodes: SimNode[], links: SimLink[], degrees: number[], alpha: number): number {
  // تنافر: كل عقدة مع عقد خليتها والخلايا المجاورة فقط
  const cells = new Map<number, number[]>();
  const keyOf = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;
  nodes.forEach((node, i) => {
    const key = keyOf(Math.floor(node.x / REPEL_RANGE), Math.floor(node.y / REPEL_RANGE));
    const bucket = cells.get(key);
    if (bucket) bucket.push(i);
    else cells.set(key, [i]);
  });

  nodes.forEach((node, i) => {
    const cx = Math.floor(node.x / REPEL_RANGE);
    const cy = Math.floor(node.y / REPEL_RANGE);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const j of cells.get(keyOf(cx + dx, cy + dy)) ?? []) {
          if (j <= i) continue;
          const other = nodes[j];
          let ex = other.x - node.x;
          let ey = other.y - node.y;
          let dist = Math.hypot(ex, ey);
          if (dist >= REPEL_RANGE) continue;
          if (dist < 0.01) {
            ex = 0.01;
            ey = 0.01 * ((i + j) % 2 ? 1 : -1);
            dist = 0.02;
          }
          const push = (REPEL_STRENGTH * alpha * (1 - dist / REPEL_RANGE) * (node.r + other.r)) / 6;
          const fx = (ex / dist) * push;
          const fy = (ey / dist) * push;
          node.vx -= fx;
          node.vy -= fy;
          other.vx += fx;
          other.vy += fy;
        }
      }
    }
  });

  // نوابض الحوافّ: الأضعف على العقدة الأكثر ارتباطاً حتى لا تنهار المحاور
  for (const link of links) {
    const a = nodes[link.a];
    const b = nodes[link.b];
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    const dist = Math.hypot(ex, ey) || 0.01;
    const rest = SPRING_LENGTH + a.r + b.r;
    const pull = ((dist - rest) / dist) * SPRING_STRENGTH * alpha;
    const shareA = degrees[link.b] / (degrees[link.a] + degrees[link.b]);
    a.vx += ex * pull * shareA;
    a.vy += ey * pull * shareA;
    b.vx -= ex * pull * (1 - shareA);
    b.vy -= ey * pull * (1 - shareA);
  }

  for (const node of nodes) {
    if (node.fixed) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx = (node.vx - node.x * GRAVITY * alpha) * DAMPING;
    node.vy = (node.vy - node.y * GRAVITY * alpha) * DAMPING;
    node.x += node.vx;
    node.y += node.vy;
  }

  return alpha * ALPHA_DECAY;
}
