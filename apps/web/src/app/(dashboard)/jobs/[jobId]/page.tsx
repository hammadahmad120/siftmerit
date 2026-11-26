import { JobLanding } from "@/components/job-landing";

// A job's own address, `/jobs/<id>`. It has no content of its own: it sends
// HR on to the step the job is at. The frame around it (`layout.tsx`) has
// loaded the job by then.
export default function JobPage() {
  return <JobLanding />;
}
