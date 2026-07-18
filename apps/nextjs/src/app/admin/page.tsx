import Link from "next/link";

export default function AdminIndexPage() {
  return (
    <main className="container max-w-2xl py-16">
      <h1 className="mb-2 text-3xl font-bold tracking-tight">Admin</h1>
      <p className="text-muted-foreground mb-6 text-sm">
        User, invite, and content management land here in upcoming features.
      </p>
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/users"
          className="text-primary text-sm font-medium underline underline-offset-4"
        >
          User management →
        </Link>
        <Link
          href="/admin/invites"
          className="text-primary text-sm font-medium underline underline-offset-4"
        >
          Manage coach invites →
        </Link>
      </div>
    </main>
  );
}
