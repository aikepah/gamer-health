export default function SettingsLoading() {
  return (
    <main className="container max-w-2xl py-16">
      <h1 className="mb-8 text-3xl font-bold tracking-tight">Settings</h1>
      <div className="flex flex-col gap-6" aria-busy="true">
        <div className="bg-muted h-9 w-full animate-pulse rounded-md" />
        <div className="bg-muted h-9 w-2/3 animate-pulse rounded-md" />
        <div className="bg-muted h-24 w-full animate-pulse rounded-md" />
      </div>
    </main>
  );
}
