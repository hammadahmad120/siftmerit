import { JobForm } from "@/components/job-form";

// The page at `/jobs/new`, opened with the "New job" button of the job list.
// A fixed name such as `new` wins over the `[jobId]` folder beside it, so
// this address never reaches the job page.
export default function NewJobPage() {
  return (
    <>
      <h1 className="text-2xl font-semibold">New job</h1>
      <p className="mt-2 text-sm text-brand-light-navy">
        Saving creates the job as a draft. No mail and no CV is read yet.
      </p>
      <JobForm />
    </>
  );
}
