import { useState, useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import { SearchModal } from "@/components/SearchModal";
import whiteBg from "@/assets/white-background.jpg";

export function AppLayout() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div
      className="h-screen flex flex-row overflow-hidden p-4 pl-2 bg-app-shell bg-cover bg-center"
      style={{ backgroundImage: `var(--shell-bg, url(${whiteBg}))` }}
    >
      <Header />
      <main className="flex-1 min-w-0 min-h-0 rounded-2xl overflow-hidden">
        <Outlet />
      </main>
      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
