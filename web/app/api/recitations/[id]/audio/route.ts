import { parseByteRange } from "@/lib/recitations";
import { canListenToRecitation } from "@/lib/recitations-access";
import { getRecitationAudio, getRecitationMeta } from "@/lib/recitations-db";

/*
  STEP 64 — بثّ الصوت. الطالب صاحب التلاوة، أو معلّم نفس حلقتها، أو ولي أمر
  مرتبط بالطالب — وكل من عداهم 404 (لا 401/403) كي لا يكشف المسار وجود التلاوة.
  يدعم Range (Safari يشترطه لتشغيل الصوت، ويلزم للتنقّل بالمقطع).
*/
const NOT_FOUND = () => new Response(null, { status: 404 });

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const recitationId = Number(id);
  if (!Number.isInteger(recitationId) || recitationId < 1) return NOT_FOUND();

  const meta = await getRecitationMeta(recitationId);
  if (!meta) return NOT_FOUND();
  if (!(await canListenToRecitation(meta))) return NOT_FOUND();

  const audio = await getRecitationAudio(recitationId);
  if (!audio) return NOT_FOUND();

  const size = audio.length;
  const headers: Record<string, string> = {
    "Content-Type": meta.mime,
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Content-Disposition": "inline",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'",
  };

  const range = parseByteRange(request.headers.get("range"), size);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${size}` } });
  }
  if (range === null) {
    return new Response(new Uint8Array(audio), {
      status: 200,
      headers: { ...headers, "Content-Length": String(size) },
    });
  }

  const chunk = audio.subarray(range.start, range.end + 1);
  return new Response(new Uint8Array(chunk), {
    status: 206,
    headers: {
      ...headers,
      "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      "Content-Length": String(chunk.length),
    },
  });
}
