export default function NicheLoading() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-10 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <div className="h-5 w-20 animate-pulse rounded bg-neutral-800" />
        <div className="mt-8 h-9 w-72 animate-pulse rounded bg-neutral-800" />
        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="h-80 animate-pulse rounded-lg bg-neutral-900" />
          <div className="h-80 animate-pulse rounded-lg bg-neutral-900" />
        </div>
        <div className="mt-6 h-96 animate-pulse rounded-lg bg-neutral-900" />
      </div>
    </main>
  );
}
