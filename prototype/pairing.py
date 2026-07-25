"""
محرك المطابقة — النواة التجارية للمرحلة ١.

يولّد حلقة اختبارية بأنماط حفظ واقعية، ثم يطابق الطلاب أزواجاً
بناءً على تقاطع المحفوظ وتقارب الإتقان، ويطبع تقريراً بالنتيجة.

الهدف: التحقق من منطق المطابقة على حجم حقيقي (١٥٠+ طالباً)
قبل بناء أي واجهة.
"""

import io
import random
import sys
from dataclasses import dataclass, field

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

TOTAL_PAGES = 604

# --- معايير المطابقة (اضبطها هنا بعد مراجعة المعلّم للنتائج) ---
MIN_OVERLAP_PAGES = 20      # أقل تقاطع مقبول ≈ جزء واحد
MAX_MASTERY_GAP = 25        # أقصى فارق إتقان مقبول (من ١٠٠)
REPEAT_PENALTY = 40         # خصم لمن كان شريكاً الأسبوع الماضي
OVERLAP_CAP = 100           # تقاطع أكبر من هذا لا يزيد الأفضلية


def juz_of_page(page):
    """حدود الأجزاء تقريبية — تكفي للنموذج الأولي، وتُستبدل بجدول دقيق لاحقاً."""
    return min(30, (page - 1) * 30 // TOTAL_PAGES + 1)


def juz_range_label(pages):
    juzes = sorted({juz_of_page(p) for p in pages})
    if not juzes:
        return "-"
    if len(juzes) == 1:
        return f"جزء {juzes[0]}"
    return f"أجزاء {juzes[0]}–{juzes[-1]}"


@dataclass
class Student:
    id: int
    name: str
    ranges: list = field(default_factory=list)   # [(from_page, to_page, months_ago)]
    mastery: dict = field(default_factory=dict)  # juz -> 0..100

    @property
    def pages(self):
        s = set()
        for a, b, _ in self.ranges:
            s.update(range(a, b + 1))
        return s

    def mastery_on(self, pages):
        """متوسط الإتقان على مجموعة صفحات محددة."""
        juzes = {juz_of_page(p) for p in pages}
        vals = [self.mastery[j] for j in juzes if j in self.mastery]
        return sum(vals) / len(vals) if vals else 0.0


FIRST_NAMES = [
    "عبدالله", "محمد", "أحمد", "خالد", "سعد", "فيصل", "عمر", "يوسف", "إبراهيم",
    "بندر", "ماجد", "طلال", "نايف", "سلطان", "راكان", "زياد", "أنس", "مصعب",
    "حمزة", "بدر", "ريان", "تركي", "صالح", "ناصر", "وليد",
]
FAMILY_NAMES = [
    "القحطاني", "الغامدي", "الشهري", "الحربي", "العتيبي", "الزهراني", "المالكي",
    "الدوسري", "السبيعي", "الشمري", "البقمي", "العمري", "الأنصاري", "الجهني",
]


def generate_students(count, seed=7):
    """
    ثلاثة أنماط حفظ واقعية في حلقة واحدة:
      • نازل  — يبدأ من جزء عمّ ويتقدّم للخلف (الأشيع بين المبتدئين)
      • صاعد  — يبدأ من البقرة ويتقدّم للأمام
      • مختار — جزء عمّ + سور مختارة (البقرة، الكهف، يس، الملك)
    وجودها معاً هو سبب فشل المطابقة بالموضع وحده.
    """
    rng = random.Random(seed)
    students = []

    for i in range(1, count + 1):
        name = f"{rng.choice(FIRST_NAMES)} {rng.choice(FAMILY_NAMES)}"
        pattern = rng.choices(["descending", "ascending", "selective"], [0.55, 0.25, 0.20])[0]
        ranges = []

        if pattern == "descending":
            juz_count = rng.randint(1, 12)
            start_page = TOTAL_PAGES - (juz_count * TOTAL_PAGES // 30) + 1
            ranges.append((max(1, start_page), TOTAL_PAGES, rng.randint(1, 36)))

        elif pattern == "ascending":
            juz_count = rng.randint(1, 10)
            ranges.append((1, juz_count * TOTAL_PAGES // 30, rng.randint(1, 36)))

        else:  # selective
            juz_count = rng.randint(1, 3)
            start_page = TOTAL_PAGES - (juz_count * TOTAL_PAGES // 30) + 1
            ranges.append((start_page, TOTAL_PAGES, rng.randint(1, 24)))
            for surah_start, surah_end in rng.sample(
                [(2, 49), (293, 304), (440, 445), (562, 564)], k=rng.randint(1, 2)
            ):
                ranges.append((surah_start, surah_end, rng.randint(1, 30)))

        student = Student(id=i, name=name, ranges=ranges)

        # الإتقان يرتفع بقِدم الحفظ وكثرة المراجعة، مع تباين فردي
        for a, b, months_ago in ranges:
            for juz in {juz_of_page(p) for p in range(a, b + 1)}:
                base = 45 + min(months_ago, 24) * 1.8
                student.mastery[juz] = max(20, min(98, base + rng.gauss(0, 12)))

        students.append(student)

    return students


def pair_score(a, b, last_week_partners):
    """يرجّع (النقاط، التقاطع) أو None إذا كان الزوج غير صالح."""
    overlap = a.pages & b.pages
    if len(overlap) < MIN_OVERLAP_PAGES:
        return None

    gap = abs(a.mastery_on(overlap) - b.mastery_on(overlap))
    if gap > MAX_MASTERY_GAP:
        return None

    score = min(len(overlap), OVERLAP_CAP) - gap * 2
    if last_week_partners.get(a.id) == b.id:
        score -= REPEAT_PENALTY

    return score, overlap


def match(students, last_week_partners=None):
    """
    مطابقة جشعة: نرتّب كل الأزواج الصالحة تنازلياً ونأخذ الأعلى فالأعلى.
    كافية تماماً لهذا الحجم — المطابقة المثلى تعقيد بلا فائدة هنا.
    """
    last_week_partners = last_week_partners or {}
    candidates = []

    for i, a in enumerate(students):
        for b in students[i + 1:]:
            result = pair_score(a, b, last_week_partners)
            if result:
                score, overlap = result
                candidates.append((score, a, b, overlap))

    candidates.sort(key=lambda c: c[0], reverse=True)

    taken, pairs = set(), []
    for score, a, b, overlap in candidates:
        if a.id in taken or b.id in taken:
            continue
        taken.update({a.id, b.id})
        pairs.append((a, b, overlap, score))

    unmatched = [s for s in students if s.id not in taken]
    return pairs, unmatched, len(candidates)


def report(students, pairs, unmatched, candidate_count):
    print(f"\n{'='*72}")
    print(f"  تقرير المطابقة — {len(students)} طالباً")
    print(f"{'='*72}\n")

    print(f"  الأزواج الصالحة الممكنة : {candidate_count:,}")
    print(f"  الثنائيات المعتمدة      : {len(pairs)}")
    print(f"  الطلاب المطابَقون       : {len(pairs)*2} من {len(students)}"
          f"  ({len(pairs)*2/len(students):.0%})")
    print(f"  بلا شريك                : {len(unmatched)}\n")

    if pairs:
        overlaps = [len(o) for _, _, o, _ in pairs]
        gaps = [abs(a.mastery_on(o) - b.mastery_on(o)) for a, b, o, _ in pairs]
        print(f"  متوسط التقاطع           : {sum(overlaps)/len(overlaps):.0f} صفحة"
              f"  (أدنى {min(overlaps)}، أعلى {max(overlaps)})")
        print(f"  متوسط فارق الإتقان      : {sum(gaps)/len(gaps):.1f} نقطة\n")

    print(f"  {'─'*68}")
    print(f"  أول ١٥ ثنائية:\n")
    print(f"  {'الطالب الأول':<22}{'الطالب الثاني':<22}{'التقاطع':<12}{'الفارق'}")
    print(f"  {'─'*68}")

    for a, b, overlap, _ in pairs[:15]:
        gap = abs(a.mastery_on(overlap) - b.mastery_on(overlap))
        print(f"  {a.name:<22}{b.name:<22}"
              f"{len(overlap)} ص · {juz_range_label(overlap):<10}"
              f"  {gap:.0f}")

    if unmatched:
        print(f"\n  {'─'*68}")
        print(f"  بلا شريك — يحتاجون المعلّم أو ثلاثياً:\n")
        for s in unmatched[:10]:
            print(f"  {s.name:<22}محفوظه: {len(s.pages)} صفحة · {juz_range_label(s.pages)}")
        if len(unmatched) > 10:
            print(f"  … و{len(unmatched)-10} آخرين")

    print()


if __name__ == "__main__":
    students = generate_students(150)
    pairs, unmatched, candidate_count = match(students)
    report(students, pairs, unmatched, candidate_count)
