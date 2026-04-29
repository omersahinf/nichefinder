"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getSupabaseBrowser } from "@/lib/supabase-browser";

export default function LoginPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/app";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const signInWithGoogle = async (): Promise<void> => {
    setLoading(true);
    setError(null);

    const supabase = getSupabaseBrowser();
    if (!supabase) {
      setError("Supabase browser auth is not configured.");
      setLoading(false);
      return;
    }

    const redirectTo = new URL("/auth/callback", window.location.origin);
    redirectTo.searchParams.set("next", next.startsWith("/") ? next : "/");

    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectTo.toString(),
      },
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-md flex-col justify-center">
        <Link href="/" className="mb-8 w-fit text-sm text-neutral-400 hover:text-red-400">
          Back
        </Link>

        <div className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-6">
          <h1 className="text-2xl font-bold tracking-tight">Log in</h1>
          <p className="mt-2 text-sm text-neutral-400">
            Continue to NicheFinder with your Google account.
          </p>

          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={loading}
            className="mt-6 w-full rounded-lg bg-neutral-100 px-4 py-3 text-sm font-semibold text-neutral-950 hover:bg-white disabled:opacity-50"
          >
            {loading ? "Redirecting..." : "Continue with Google"}
          </button>

          {error && (
            <div className="mt-4 rounded border border-red-900 bg-red-950/40 px-3 py-2 text-sm text-red-100">
              {error}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
