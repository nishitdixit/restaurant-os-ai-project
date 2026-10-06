import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10">
      <SignUp />
    </main>
  );
}
