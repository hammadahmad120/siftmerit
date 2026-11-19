import { SignInForm } from "@/components/sign-in-form";

// The page at `/signin`. It is the one page that needs no signed-in user.
export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <SignInForm />
    </main>
  );
}
