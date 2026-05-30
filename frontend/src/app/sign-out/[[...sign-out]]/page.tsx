import { SignOutButton } from '@clerk/nextjs';

export default function SignOutPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <SignOutButton>
        <button className="btn-primary">Sign out</button>
      </SignOutButton>
    </div>
  );
}

