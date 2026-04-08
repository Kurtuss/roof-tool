"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Hexagon, Lock, Loader2, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (res.ok) {
      router.push("/admin");
    } else {
      setError("Incorrect password");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="hex-shape w-16 h-16 bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-xl shadow-brand-500/25 mx-auto mb-4">
            <Hexagon size={28} className="text-white" strokeWidth={2} />
          </div>
          <h1 className="text-2xl font-bold text-brand-900">Roof Tool</h1>
          <p className="text-sm text-brand-600/60 mt-1">Enter your password to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="card p-6 space-y-4">
          <div>
            <label className="label">Password</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-400" />
              <input
                type="password"
                className="input pl-9"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoFocus
                required
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertCircle size={14} />
              {error}
            </div>
          )}

          <button type="submit" disabled={loading || !password} className="btn-primary w-full justify-center">
            {loading ? <><Loader2 size={15} className="animate-spin"/> Signing in...</> : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
