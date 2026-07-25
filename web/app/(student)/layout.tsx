import { StudentGate } from "@/components/student-gate";

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return <StudentGate>{children}</StudentGate>;
}
