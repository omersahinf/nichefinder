"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-6 text-neutral-100">
      <div className="max-w-md rounded-lg border border-red-900 bg-red-950/30 p-6">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-red-100/80">{error.message}</p>
        <button
          type="button"
          onClick={reset}
          className="mt-5 rounded bg-red-600 px-4 py-2 text-sm font-medium hover:bg-red-500"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
