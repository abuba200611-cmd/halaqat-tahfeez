import { SuggestionForm } from "@/components/suggestion-form";

export default function SuggestPage() {
  return <SuggestionForm endpoint="/api/suggestions" maxLength={1000} />;
}
