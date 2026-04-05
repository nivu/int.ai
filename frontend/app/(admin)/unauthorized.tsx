import Link from "next/link";

export default function Unauthorized() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Unauthorized</h1>
      <p className="mt-2 max-w-md text-sm text-muted-foreground">
        You do not have permission to access this page. Please contact your
        administrator if you believe this is an error.
      </p>
      <Link
        href="/auth/login"
        className="mt-6 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Return to login
      </Link>
    </div>
  );
}
