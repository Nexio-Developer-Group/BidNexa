import { requireCurrentUser } from "@/lib/org";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireCurrentUser();

  return (
    <div className="flex min-h-screen w-full">
      <Sidebar
        organizationName={user.organizationName}
        userName={user.fullName || user.email || "User"}
        userEmail={user.email || ""}
      />
      <div className="flex min-h-screen flex-1 flex-col">
        <Topbar />
        <main className="flex-1 overflow-y-auto bg-[var(--background)] p-6">{children}</main>
      </div>
    </div>
  );
}
