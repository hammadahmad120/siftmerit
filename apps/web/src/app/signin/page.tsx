import { SignInForm } from "@/components/sign-in-form";

// The page at `/signin`. It is the one page that needs no signed-in user.
// The cream background comes from the outer frame in `app/layout.tsx`.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <SignInForm />
    </main>
  );
}
