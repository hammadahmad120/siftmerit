import { StepPlaceholder } from "@/components/step-placeholder";

// The "reading" step, at `/jobs/<id>/reading`. It has no screen of its own
// yet; the task that builds it replaces the placeholder.
export default function JobStepPage() {
  return <StepPlaceholder step="reading" />;
}
