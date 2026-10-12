import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  أرشيف الأنشطة: بوابة الميزة والجامع، فحص الصور (بايتات سحرية، حجم، حد الجامع)،
  قائمة سماح روابط الفيديو، انتماء الوسم للجامع نفسه، ومصدر الدماغ.
  القاعدة وcanAccessMosque محاكيان.
*/

vi.mock("@/lib/mosque/access", () => ({ canAccessMosque: vi.fn() }));
vi.mock("@/lib/mosque/db", () => ({
  getMosque: vi.fn(),
  isFeatureEnabled: vi.fn(),
  listActivities: vi.fn(),
  getActivity: vi.fn(),
  createActivity: vi.fn(),
  deleteActivity: vi.fn(),
  tagBelongsToMosque: vi.fn(),
  listHalaqahs: vi.fn(),
  listFamilies: vi.fn(),
  listCommittees: vi.fn(),
  listActivityMedia: vi.fn(),
  addActivityPhoto: vi.fn(),
  addActivityVideoLink: vi.fn(),
  getActivityPhoto: vi.fn(),
  deleteActivityMedia: vi.fn(),
  // مصدر الدماغ
  getMosqueFeatures: vi.fn(),
  listBrainNotes: vi.fn(),
  listCommitteeMemberLinks: vi.fn(),
  listFamilyMemberLinks: vi.fn(),
  listMosqueRegistrations: vi.fn(),
}));
vi.mock("@/lib/mosque/halaqat", () => ({ getHalaqahRoster: vi.fn() }));

import { GET as LIST_GET, POST as LIST_POST } from "@/app/api/mosques/[id]/archive/route";
import { GET as ACT_GET, DELETE as ACT_DELETE } from "@/app/api/mosques/[id]/archive/[activityId]/route";
import { POST as MEDIA_POST } from "@/app/api/mosques/[id]/archive/[activityId]/media/route";
import {
  GET as PHOTO_GET,
  DELETE as MEDIA_DELETE,
} from "@/app/api/mosques/[id]/archive/[activityId]/media/[mediaId]/route";
import { canAccessMosque } from "@/lib/mosque/access";
import * as db from "@/lib/mosque/db";
import { buildMosqueGraph } from "@/lib/mosque/brain-graph";
import { MAX_PHOTO_BYTES, detectImageMime, parseVideoUrl, youtubeId } from "@/lib/mosque/archive";
import { getFeature } from "@/lib/mosque/features";

const JPEG = [0xff, 0xd8, 0xff, 0xe0];
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
function bytes(head: number[], total = 64): Uint8Array {
  const out = new Uint8Array(total);
  out.set(head);
  return out;
}

function json(body: unknown, method = "POST") {
  return new Request("http://localhost/x", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
function photoRequest(data: Uint8Array, type = "image/jpeg") {
  return new Request("http://localhost/x", { method: "POST", headers: { "Content-Type": type }, body: data as never });
}
function ctx(extra: Record<string, string> = {}) {
  return { params: Promise.resolve({ id: "1", ...extra }) } as never;
}

const activity = {
  id: 4,
  mosqueId: 1,
  title: "ختم",
  description: "",
  activityDate: "2026-10-01",
  tagKind: null,
  tagId: null,
  tagName: null,
  createdAt: "",
  photoCount: 0,
  videoCount: 0,
  coverMediaId: null,
};

let enabled: Set<string>;

beforeEach(() => {
  vi.resetAllMocks();
  enabled = new Set(["archive", "halaqat", "families", "committees"]);
  vi.mocked(canAccessMosque).mockResolvedValue(true);
  vi.mocked(db.getMosque).mockResolvedValue({ id: 1, name: "جامع", city: "", createdAt: "" });
  vi.mocked(db.isFeatureEnabled).mockImplementation(async (_id, key) => enabled.has(key));
  vi.mocked(db.getActivity).mockResolvedValue(activity);
  vi.mocked(db.listActivities).mockResolvedValue([]);
  vi.mocked(db.listHalaqahs).mockResolvedValue([]);
  vi.mocked(db.listFamilies).mockResolvedValue([]);
  vi.mocked(db.listCommittees).mockResolvedValue([]);
});

describe("سجل المزايا", () => {
  it("archive: جاهزة ومعطّلة افتراضياً", () => {
    const feature = getFeature("archive");
    expect(feature).toMatchObject({ nameAr: "أرشيف الأنشطة", status: "ready", defaultEnabled: false });
  });
});

describe("البوابة: 401 لجامع آخر، 404 لميزة معطّلة", () => {
  const cases: [string, () => Promise<Response>][] = [
    ["list GET", () => LIST_GET(new Request("http://x"), ctx())],
    ["list POST", () => LIST_POST(json({ title: "ن", activityDate: "2026-10-01" }), ctx())],
    ["activity GET", () => ACT_GET(new Request("http://x"), ctx({ activityId: "4" }))],
    ["activity DELETE", () => ACT_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ activityId: "4" }))],
    ["media POST", () => MEDIA_POST(photoRequest(bytes(JPEG)), ctx({ activityId: "4" }))],
    ["media DELETE", () => MEDIA_DELETE(new Request("http://x", { method: "DELETE" }), ctx({ activityId: "4", mediaId: "9" }))],
  ];

  it.each(cases)("%s: مدير جامع آخر = 401 ولا يصل للقاعدة", async (_name, call) => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await call()).status).toBe(401);
    expect(db.isFeatureEnabled).not.toHaveBeenCalled();
    expect(db.createActivity).not.toHaveBeenCalled();
    expect(db.addActivityPhoto).not.toHaveBeenCalled();
    expect(db.deleteActivity).not.toHaveBeenCalled();
  });

  it.each(cases)("%s: الميزة معطّلة = 404", async (_name, call) => {
    enabled.clear();
    expect((await call()).status).toBe(404);
    expect(db.createActivity).not.toHaveBeenCalled();
    expect(db.addActivityPhoto).not.toHaveBeenCalled();
    expect(db.deleteActivity).not.toHaveBeenCalled();
  });

  it("ميزة الأسر وحدها لا تفتح الأرشيف", async () => {
    enabled = new Set(["families"]);
    expect((await LIST_GET(new Request("http://x"), ctx())).status).toBe(404);
  });

  it("معرّف غير رقمي = 404", async () => {
    const res = await ACT_GET(new Request("http://x"), ctx({ activityId: "abc" }));
    expect(res.status).toBe(404);
    expect(db.getActivity).not.toHaveBeenCalled();
  });
});

describe("مسار الصورة (GET)", () => {
  const call = () => PHOTO_GET(new Request("http://x"), ctx({ activityId: "4", mediaId: "9" }));

  it("جامع آخر = 404 ولا يقرأ البايتات", async () => {
    vi.mocked(canAccessMosque).mockResolvedValue(false);
    expect((await call()).status).toBe(404);
    expect(db.getActivityPhoto).not.toHaveBeenCalled();
  });

  it("ميزة معطّلة أو صورة غير موجودة = 404", async () => {
    enabled.clear();
    expect((await call()).status).toBe(404);
    enabled.add("archive");
    vi.mocked(db.getActivityPhoto).mockResolvedValue(null);
    expect((await call()).status).toBe(404);
  });

  it("يبث البايتات بنوعها المخزَّن مع رؤوس التخزين والأمان، مقيّداً بالجامع", async () => {
    vi.mocked(db.getActivityPhoto).mockResolvedValue({ mime: "image/webp", data: Buffer.from(bytes(WEBP)) });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/webp");
    expect(res.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes(WEBP));
    expect(db.getActivityPhoto).toHaveBeenCalledWith(1, 4, 9);
  });
});

describe("رفع الصور", () => {
  const call = (data: Uint8Array, type?: string) => MEDIA_POST(photoRequest(data, type), ctx({ activityId: "4" }));

  it("البايتات السحرية: jpeg وpng وwebp تُقبل، وغيرها 400 حتى لو الترويسة image/jpeg", async () => {
    vi.mocked(db.addActivityPhoto).mockResolvedValue({ id: 1 });
    for (const [head, mime] of [[JPEG, "image/jpeg"], [PNG, "image/png"], [WEBP, "image/webp"]] as const) {
      vi.mocked(db.addActivityPhoto).mockClear();
      const res = await call(bytes([...head]));
      expect(res.status).toBe(201);
      expect(vi.mocked(db.addActivityPhoto).mock.calls[0].slice(0, 3)).toEqual([1, 4, mime]);
    }
    vi.mocked(db.addActivityPhoto).mockClear();
    const gif = bytes([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
    const svg = new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg>");
    const html = new TextEncoder().encode("<script>alert(1)</script>");
    for (const bad of [gif, svg, html]) expect((await call(bad)).status).toBe(400);
    expect(db.addActivityPhoto).not.toHaveBeenCalled();
  });

  it("فوق 600KB = 413، والحد نفسه يُقبل", async () => {
    vi.mocked(db.addActivityPhoto).mockResolvedValue({ id: 1 });
    expect((await call(bytes(JPEG, MAX_PHOTO_BYTES + 1))).status).toBe(413);
    expect(db.addActivityPhoto).not.toHaveBeenCalled();
    expect((await call(bytes(JPEG, MAX_PHOTO_BYTES))).status).toBe(201);
  });

  it("جسم فارغ = 400", async () => {
    expect((await call(new Uint8Array(0))).status).toBe(400);
  });

  it("اكتمال حد الجامع (300 صورة) = 409 برسالة عربية", async () => {
    vi.mocked(db.addActivityPhoto).mockResolvedValue("full");
    const res = await call(bytes(JPEG));
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toContain("300");
  });

  it("نشاط ليس من هذا الجامع = 404 قبل أي رفع", async () => {
    vi.mocked(db.getActivity).mockResolvedValue(null);
    expect((await call(bytes(JPEG))).status).toBe(404);
    expect(db.addActivityPhoto).not.toHaveBeenCalled();
  });
});

describe("روابط الفيديو", () => {
  const call = (videoUrl: unknown) => MEDIA_POST(json({ videoUrl }), ctx({ activityId: "4" }));

  it("روابط المنصات المسموحة https تُقبل", async () => {
    vi.mocked(db.addActivityVideoLink).mockResolvedValue({ id: 2 });
    const good = [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://youtu.be/dQw4w9WgXcQ",
      "https://drive.google.com/file/d/abc/view",
      "https://www.instagram.com/reel/abc/",
      "https://www.tiktok.com/@u/video/1",
      "https://x.com/u/status/1",
      "https://twitter.com/u/status/1",
    ];
    for (const url of good) expect((await call(url)).status).toBe(201);
    expect(db.addActivityVideoLink).toHaveBeenCalledTimes(good.length);
  });

  it("javascript: وhttp: ومضيف مجهول وخداع المضيف وبيانات الدخول = 400", async () => {
    const bad = [
      "javascript:alert(1)",
      "data:text/html,<script>1</script>",
      "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "https://evil.com/watch?v=1",
      "https://youtube.com.evil.com/x",
      "https://evil.com/youtube.com",
      "https://user:pw@youtube.com/x",
      "https://youtube.com:8443/x",
      "ftp://youtube.com/x",
      "youtube.com/watch",
      "",
      42,
      null,
    ];
    for (const url of bad) expect((await call(url)).status).toBe(400);
    expect(db.addActivityVideoLink).not.toHaveBeenCalled();
  });

  it("parseVideoUrl وyoutubeId", () => {
    expect(parseVideoUrl("https://youtu.be/dQw4w9WgXcQ")?.host).toBe("youtube");
    expect(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeId("https://www.youtube.com/watch?v=bad\"onload")).toBeNull();
    expect(youtubeId("https://x.com/u/status/1")).toBeNull();
  });

  it("detectImageMime: قصير أو رأس جزئي = null", () => {
    expect(detectImageMime(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageMime(bytes([0x52, 0x49, 0x46, 0x46]))).toBeNull();
    expect(detectImageMime(bytes(JPEG))).toBe("image/jpeg");
  });
});

describe("إنشاء النشاط", () => {
  const valid = { title: "  ختم  ", activityDate: "2026-10-01" };

  it("عنوان فارغ أو تاريخ غير صالح = 400", async () => {
    expect((await LIST_POST(json({ title: " ", activityDate: "2026-10-01" }), ctx())).status).toBe(400);
    for (const activityDate of ["2026-02-31", "غد", "", undefined, "2026-1-1"]) {
      expect((await LIST_POST(json({ title: "ن", activityDate }), ctx())).status).toBe(400);
    }
    expect(db.createActivity).not.toHaveBeenCalled();
  });

  it("بلا وسم: يُنشأ مقيداً بالجامع والعنوان مقصوص", async () => {
    vi.mocked(db.createActivity).mockResolvedValue(7);
    const res = await LIST_POST(json(valid), ctx());
    expect(res.status).toBe(201);
    expect(vi.mocked(db.createActivity).mock.calls[0]).toEqual([
      1,
      { title: "ختم", description: "", activityDate: "2026-10-01", tagKind: null, tagId: null },
    ]);
  });

  it("وسم من جامع آخر = 400 ولا إنشاء", async () => {
    vi.mocked(db.tagBelongsToMosque).mockResolvedValue(false);
    const res = await LIST_POST(json({ ...valid, tagKind: "family", tagId: 99 }), ctx());
    expect(res.status).toBe(400);
    expect(db.tagBelongsToMosque).toHaveBeenCalledWith(1, "family", 99);
    expect(db.createActivity).not.toHaveBeenCalled();
  });

  it("وسم من الجامع نفسه يُحفظ، ونوع غير معروف أو معرّف سيئ = 400", async () => {
    vi.mocked(db.tagBelongsToMosque).mockResolvedValue(true);
    vi.mocked(db.createActivity).mockResolvedValue(8);
    expect((await LIST_POST(json({ ...valid, tagKind: "halaqah", tagId: 3 }), ctx())).status).toBe(201);
    expect(vi.mocked(db.createActivity).mock.calls[0][1]).toMatchObject({ tagKind: "halaqah", tagId: 3 });
    expect((await LIST_POST(json({ ...valid, tagKind: "mosque", tagId: 3 }), ctx())).status).toBe(400);
    expect((await LIST_POST(json({ ...valid, tagKind: "family", tagId: "x" }), ctx())).status).toBe(400);
    expect((await LIST_POST(json({ ...valid, tagKind: "family" }), ctx())).status).toBe(400);
  });
});

describe("خيارات الوسم", () => {
  it("لا تظهر إلا للمزايا المفعّلة", async () => {
    enabled = new Set(["archive", "families"]);
    vi.mocked(db.listFamilies).mockResolvedValue([
      { id: 5, mosqueId: 1, name: "النور", leaderName: "", notes: "", createdAt: "", memberCount: 0 },
    ]);
    const body = (await (await LIST_GET(new Request("http://x"), ctx())).json()) as {
      tagOptions: Record<string, { id: number }[]>;
    };
    expect(body.tagOptions.family).toEqual([{ id: 5, name: "النور" }]);
    expect(body.tagOptions.halaqah).toEqual([]);
    expect(db.listHalaqahs).not.toHaveBeenCalled();
    expect(db.listCommittees).not.toHaveBeenCalled();
  });
});

describe("مصدر الدماغ للأنشطة", () => {
  beforeEach(() => {
    vi.mocked(db.getMosqueFeatures).mockResolvedValue([]);
    vi.mocked(db.listBrainNotes).mockResolvedValue([]);
    vi.mocked(db.listCommitteeMemberLinks).mockResolvedValue([]);
    vi.mocked(db.listFamilyMemberLinks).mockResolvedValue([]);
    vi.mocked(db.listMosqueRegistrations).mockResolvedValue([]);
    vi.mocked(db.listActivities).mockResolvedValue([
      { ...activity, id: 4, tagKind: "family", tagId: 5, tagName: "النور" },
      { ...activity, id: 6, title: "رحلة" },
    ]);
  });

  it("الميزة معطّلة: لا عُقَد أنشطة ولا استعلام", async () => {
    enabled.delete("archive");
    const graph = await buildMosqueGraph(1);
    expect(graph.nodes.some((n) => n.type === "activity")).toBe(false);
    expect(db.listActivities).not.toHaveBeenCalled();
  });

  it("مفعّلة: عُقد الأنشطة مربوطة بالجامع وبالأسرة الموسومة", async () => {
    enabled = new Set(["archive", "families"]);
    vi.mocked(db.listFamilies).mockResolvedValue([
      { id: 5, mosqueId: 1, name: "النور", leaderName: "", notes: "", createdAt: "", memberCount: 0 },
    ]);
    const graph = await buildMosqueGraph(1);
    expect(graph.nodes.filter((n) => n.type === "activity").map((n) => n.id).sort()).toEqual(["activity:4", "activity:6"]);
    expect(graph.edges).toContainEqual({ source: "mosque:1", target: "activity:4", kind: "activity" });
    expect(graph.edges).toContainEqual({ source: "mosque:1", target: "activity:6", kind: "activity" });
    expect(graph.edges).toContainEqual({ source: "family:5", target: "activity:4", kind: "activity-tag" });
  });

  it("وسم أسرة ميزتها معطّلة: العقدة تبقى والحافّة المعلّقة تُحذف", async () => {
    enabled = new Set(["archive"]);
    const graph = await buildMosqueGraph(1);
    expect(graph.nodes.some((n) => n.id === "activity:4")).toBe(true);
    expect(graph.edges.some((e) => e.kind === "activity-tag")).toBe(false);
  });
});
