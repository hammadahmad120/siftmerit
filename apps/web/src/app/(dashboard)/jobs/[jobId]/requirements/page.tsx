import { JobRequirements } from "@/components/job-requirements";

// Step 1, the requirements, at `/jobs/<id>/requirements`. The list is asked
// for only when this page is opened.
export default function JobRequirementsPage() {
  return <JobRequirements />;
}
