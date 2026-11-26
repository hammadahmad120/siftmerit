import { StepPlaceholder } from "@/components/step-placeholder";

// The "candidates" step, at `/jobs/<id>/candidates`. It has no screen of its own
// yet; the task that builds it replaces the placeholder.
export default function JobStepPage() {
  return <StepPlaceholder step="candidates" />;
}
