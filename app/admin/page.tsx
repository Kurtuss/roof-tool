"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PlusCircle, RefreshCw, Hexagon, ArrowRight } from "lucide-react";
import { Job } from "@/types";
import { StatusBadge } from "@/components/StatusBadge";

export default function AdminPage() {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    fetch("/api/jobs")
      .then((r) => r.json())
      .then((data) => { setJobs(data); setLoading(false); })
      .catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const stats = [
    { label: "Total Jobs",  value: jobs.length,                                                                                color: "from-brand-400 to-brand-600" },
    { label: "In Progress", value: jobs.filter((j) => ["fetching_images","processing","measuring"].includes(j.status)).length, color: "from-amber-400 to-orange-500" },
    { label: "Quote Ready", value: jobs.filter((j) => j.status === "quote_ready").length,                                      color: "from-emerald-400 to-green-500" },
    { label: "Sent",        value: jobs.filter((j) => j.status === "quote_sent").length,                                       color: "from-violet-400 to-purple-500" },
  ];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-brand-900 tracking-tight">Dashboard</h2>
          <p className="text-sm text-brand-600/60 mt-1">All roofing assessments</p>
        </div>
        <div className="flex gap-3">
          <button onClick={load} className="btn-secondary">
            <RefreshCw size={15} /> Refresh
          </button>
          <Link href="/jobs/new" className="btn-primary">
            <PlusCircle size={15} /> New Job
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-5 mb-8">
        {stats.map(({ label, value, color }) => (
          <div key={label} className="stat-card group">
            <div className="flex items-center gap-3 mb-3">
              <div className={`hex-shape w-8 h-8 bg-gradient-to-br ${color} flex items-center justify-center shadow-md`}>
                <Hexagon size={14} className="text-white" />
              </div>
              <p className="text-xs font-medium text-brand-600/60 uppercase tracking-wider">{label}</p>
            </div>
            <p className="text-3xl font-bold text-brand-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-16 text-center">
            <div className="hex-shape w-12 h-12 bg-gradient-to-br from-brand-200 to-brand-300 mx-auto mb-3 animate-pulse-slow" />
            <p className="text-brand-400 text-sm">Loading jobs...</p>
          </div>
        ) : jobs.length === 0 ? (
          <div className="p-16 text-center">
            <div className="hex-shape w-16 h-16 bg-gradient-to-br from-brand-100 to-brand-200 mx-auto mb-4 flex items-center justify-center">
              <PlusCircle size={24} className="text-brand-500" />
            </div>
            <p className="text-brand-400 mb-4 text-sm">No jobs yet</p>
            <Link href="/jobs/new" className="btn-primary inline-flex">
              <PlusCircle size={15} /> Create your first job
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-brand-100/50 bg-gradient-to-r from-brand-50/50 to-transparent">
                <th className="text-left px-6 py-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Client</th>
                <th className="text-left px-6 py-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Status</th>
                <th className="text-left px-6 py-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Created</th>
                <th className="text-left px-6 py-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Address</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-b border-brand-50 hover:bg-brand-50/40 transition-colors group">
                  <td className="px-6 py-4 font-semibold text-brand-900">{job.client_name}</td>
                  <td className="px-6 py-4"><StatusBadge status={job.status} /></td>
                  <td className="px-6 py-4 text-brand-600/60">{new Date(job.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4 text-brand-600/60">{(job as Job & { address?: string }).address ?? "—"}</td>
                  <td className="px-6 py-4 text-right">
                    <Link
                      href={`/jobs/${job.id}`}
                      className="inline-flex items-center gap-1.5 text-brand-500 hover:text-brand-700 font-semibold text-xs uppercase tracking-wide transition-colors group-hover:gap-2.5"
                    >
                      View <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
