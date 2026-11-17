import { ApiHealth } from "@/components/api-health";

// The page at `/`. For now it only shows whether the API can be reached.
// Task 7 replaces it with the redirect to sign-in or the dashboard.
export default function HomePage() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-2xl font-semibold">Siftmerit</h1>
      <div className="mt-4">
        <ApiHealth />
      </div>
    </main>
  );
}
