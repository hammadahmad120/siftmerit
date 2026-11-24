import Link from "next/link";
import { LINK_BUTTON_CLASSES } from "@/lib/styles";

/**
 * The button at the top of a page below the job list ("New job", a job's own
 * page) that goes back to the list. It is a link with the button's look,
 * written once so every such page shows the same one.
 */
export function BackToJobs() {
  return (
    <div className="mb-5">
      <Link href="/jobs" className={`px-3 py-1.5 ${LINK_BUTTON_CLASSES}`}>
        <span aria-hidden="true">← </span>Back to jobs
      </Link>
    </div>
  );
}
