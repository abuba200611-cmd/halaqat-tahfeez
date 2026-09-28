import { SuggestionForm } from "@/components/suggestion-form";

export default function StudentSuggestPage() {
  return <SuggestionForm endpoint="/api/student/suggestions" maxLength={2000} />;
}
