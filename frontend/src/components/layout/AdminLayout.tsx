import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { AdminHeader } from "./AdminHeader";
import { useBranding } from "@/context/BrandingContext";
import whiteBg from "@/assets/white-background.jpg";

export function AdminLayout() {
  const branding = useBranding();

  useEffect(() => {
    document.title = `${branding.name} Admin`;
  }, [branding.name]);

  return (
    <div
      className="h-screen flex flex-row overflow-hidden p-4 pl-2 bg-app-shell bg-cover bg-center"
      style={{ backgroundImage: `var(--shell-bg, url(${whiteBg}))` }}
    >
      <AdminHeader />
      <main className="flex-1 min-w-0 min-h-0 rounded-2xl overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
