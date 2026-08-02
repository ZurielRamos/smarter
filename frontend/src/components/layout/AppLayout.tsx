import { Outlet } from "react-router-dom";
import { Header } from "./Header";
import whiteBg from "@/assets/white-background.jpg";

export function AppLayout() {
  return (
    <div
      className="h-screen flex flex-col overflow-hidden p-4"
      style={{
        backgroundImage: `url(${whiteBg})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      <div className="flex flex-col flex-1 min-h-0 rounded-2xl overflow-hidden relative">
        {/* Header floating on top without background */}
        <div className="absolute inset-x-0 top-0 z-20">
          <Header />
        </div>
        <main className="flex-1 min-h-0 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
