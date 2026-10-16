import { Card } from "@/components/ui";

/** دروس الإيجنت — قسم M6، صفحة مكانية فقط */
export default function DevAgentLessonsPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-naskh text-2xl font-bold">دروس الإيجنت</h1>
        <p className="text-sm text-muted-foreground">المساعد الذكي فوق المنصة الموحّدة — المرحلة M6.</p>
      </div>
      <Card className="px-6 py-16 text-center">
        <p className="font-naskh text-3xl font-bold text-primary">قريباً</p>
        <p className="mt-2 text-sm text-muted-foreground">يُبنى فوق الهوية الموحّدة وذاكرة كل جامع بعد M5.</p>
      </Card>
    </div>
  );
}
