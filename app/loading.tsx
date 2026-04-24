export default function Loading() {
  return (
    <main className="min-h-screen bg-neutral-950 px-6 py-12 text-neutral-100">
      <div className="mx-auto max-w-6xl">
        <div className="h-9 w-56 animate-pulse rounded bg-neutral-800" />
        <div className="mt-8 h-12 animate-pulse rounded-lg bg-neutral-900" />
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 animate-pulse rounded-lg bg-neutral-900" />
          ))}
        </div>
      </div>
    </main>
  );
}
