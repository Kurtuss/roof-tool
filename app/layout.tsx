import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Home, PlusCircle, Hexagon, LogOut } from "lucide-react";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Roof Tool",
  description: "Drone-powered roofing quotes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="min-h-screen flex">
          {/* ── Sidebar ─────────────────────────────────── */}
          <aside className="w-60 bg-gradient-to-b from-hex-dark to-hex-panel text-white flex flex-col shrink-0 print:hidden relative overflow-hidden">
            {/* Decorative hex pattern in sidebar */}
            <div className="absolute inset-0 opacity-[0.03]"
                 style={{
                   backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='28' height='49' viewBox='0 0 28 49'%3E%3Cg fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M13.99 9.25l13 7.5v15l-13 7.5L1 31.75v-15l12.99-7.5zM3 17.9v12.7l10.99 6.34 11-6.35V17.9l-11-6.34L3 17.9zM0 15l12.98-7.5V0h-2v6.35L0 12.69v2.3zm0 18.5L12.98 41v8h-2v-6.85L0 35.81v-2.3zM15 0v7.5L27.99 15H28v-2.31h-.01L17 6.35V0h-2zm0 49v-8l12.99-7.5H28v2.31h-.01L17 42.15V49h-2z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
                 }}
            />

            {/* Logo area */}
            <div className="relative px-5 py-6 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="hex-shape w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
                  <Hexagon size={18} strokeWidth={2.5} />
                </div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">Roof Tool</h1>
                  <p className="text-[11px] text-brand-300/70 font-medium">Drone-Powered Quotes</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="relative flex-1 px-3 py-5 space-y-1">
              <Link href="/admin" className="nav-link">
                <Home size={17} /> Dashboard
              </Link>
              <Link href="/jobs/new" className="nav-link">
                <PlusCircle size={17} /> New Job
              </Link>
            </nav>

            {/* Bottom — logout */}
            <div className="relative px-3 py-4 border-t border-white/10">
              <form action="/api/auth/logout" method="POST">
                <button type="submit" className="nav-link w-full">
                  <LogOut size={17} /> Sign Out
                </button>
              </form>
            </div>

            {/* Decorative glow at bottom */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-40 h-40 bg-brand-500/10 rounded-full blur-3xl pointer-events-none" />
          </aside>

          {/* ── Main content ────────────────────────────── */}
          <main className="flex-1 overflow-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
