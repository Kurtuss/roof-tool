import Link from "next/link";
import { Hexagon, Shield, Zap, FileText } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      {/* Logo */}
      <div className="hex-shape w-20 h-20 bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-2xl shadow-brand-500/30 mb-8">
        <Hexagon size={36} className="text-white" strokeWidth={2} />
      </div>

      <h1 className="text-5xl font-bold text-brand-900 tracking-tight mb-3">Roof Tool</h1>
      <p className="text-xl text-brand-600/60 mb-12 max-w-md">
        Satellite-powered roofing quotes in minutes — not days.
      </p>

      {/* Features */}
      <div className="grid grid-cols-3 gap-6 mb-12 max-w-2xl w-full">
        {[
          { icon: Zap,      label: "Instant Estimates",  desc: "Auto satellite measurement on job creation" },
          { icon: FileText, label: "PDF Reports",         desc: "Branded reports with measurements & pricing" },
          { icon: Shield,   label: "Accurate Quotes",     desc: "Per-sqft pricing with pitch multipliers" },
        ].map(({ icon: Icon, label, desc }) => (
          <div key={label} className="card p-5 text-left">
            <div className="hex-shape w-9 h-9 bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center mb-3 shadow-md">
              <Icon size={16} className="text-white" />
            </div>
            <p className="font-semibold text-brand-900 text-sm mb-1">{label}</p>
            <p className="text-xs text-brand-600/60">{desc}</p>
          </div>
        ))}
      </div>

      <Link href="/login" className="btn-primary text-base px-8 py-3">
        Get Started
      </Link>
    </div>
  );
}
