import { type ReactNode } from "react";
import { Sidebar } from "@/components/Sidebar";
import { getMe } from "@/lib/api-server";

/** Oturumlu kabuk: kenar menü + içerik. Oturum yoksa getMe giriş ekranına yönlendirir. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const me = await getMe();
  return (
    <div className="flex min-h-screen">
      <Sidebar me={me} />
      <main className="flex min-w-0 flex-1 flex-col">{children}</main>
    </div>
  );
}
