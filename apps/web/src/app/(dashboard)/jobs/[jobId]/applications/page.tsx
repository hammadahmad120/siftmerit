import { StepPlaceholder } from "@/components/step-placeholder";

// The "applications" step, at `/jobs/<id>/applications`. It has no screen of its own
// yet; the task that builds it replaces the placeholder.
export default function JobStepPage() {
  return <StepPlaceholder step="applications" />;
}
