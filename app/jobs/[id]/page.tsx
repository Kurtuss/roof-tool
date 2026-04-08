"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Loader2, FileText, MapPin, Phone, Mail,
  Ruler, TrendingUp, Triangle, Minus, AlertTriangle,
  Satellite, Hexagon, Download
} from "lucide-react";
import {
  Job, Measurement, Quote, ServiceType, SatelliteEstimate,
  SERVICE_LABELS, PITCH_LABELS, PitchBracket
} from "@/types";
import { StatusBadge } from "@/components/StatusBadge";

interface JobDetail {
  job: Job & {
    client_name: string;
    address?: string;
    phone?: string;
    email?: string;
    error_message?: string;
    lat?: number;
    lng?: number;
  };
  measurement?: Measurement;
  satellite_estimate?: SatelliteEstimate;
  quotes: Quote[];
}

const ALL_SERVICES: ServiceType[] = ["reroof", "spray", "tuneup", "gutter_clean"];

const SOURCE_LABELS: Record<string, string> = {
  manual: "Manual Entry",
  satellite: "Satellite (OSM)",
  traced: "Satellite (Traced)",
  drone: "Drone (ODM)",
  blended: "Blended (70/30)",
};

const SOURCE_COLORS: Record<string, string> = {
  manual: "bg-gray-100 text-gray-600 border-gray-200",
  satellite: "bg-brand-50 text-brand-600 border-brand-200",
  traced: "bg-violet-50 text-violet-600 border-violet-200",
  drone: "bg-emerald-50 text-emerald-600 border-emerald-200",
  blended: "bg-amber-50 text-amber-600 border-amber-200",
};

export default function JobDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [data, setData]                         = useState<JobDetail | null>(null);
  const [loading, setLoading]                   = useState(true);
  const [quoting, setQuoting]                   = useState(false);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceType>>(new Set(["reroof"]));
  const [runningSat, setRunningSat]             = useState(false);
  const [satError, setSatError]                 = useState("");

  const load = useCallback(() => {
    fetch(`/api/jobs/${id}`)
      .then((r) => r.json())
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const runSatelliteEstimate = async () => {
    setRunningSat(true);
    setSatError("");
    const res  = await fetch(`/api/jobs/${id}/satellite`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) });
    const json = await res.json();
    setRunningSat(false);
    if (!json.ok) { setSatError(json.error ?? "Satellite estimate failed"); return; }
    load();
  };

  const toggleService = (svc: ServiceType) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      next.has(svc) ? next.delete(svc) : next.add(svc);
      return next;
    });
  };

  const generateQuote = async () => {
    if (selectedServices.size === 0) return;
    setQuoting(true);
    const res   = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: parseInt(id), serviceTypes: Array.from(selectedServices) }),
    });
    const quote = await res.json();
    setQuoting(false);
    if (quote.id) router.push(`/jobs/${id}/quote?quoteId=${quote.id}`);
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="hex-shape w-14 h-14 bg-gradient-to-br from-brand-300 to-brand-500 mx-auto mb-4 animate-pulse-slow flex items-center justify-center">
          <Hexagon size={20} className="text-white" />
        </div>
        <p className="text-brand-400 text-sm">Loading job details...</p>
      </div>
    </div>
  );
  if (!data) return <div className="p-8 text-red-500">Job not found.</div>;

  const { job, measurement, satellite_estimate, quotes } = data;
  const selectedLabel = Array.from(selectedServices).map((s) => SERVICE_LABELS[s]).join(" + ");
  const hasSatellite  = !!satellite_estimate;

  return (
    <div className="p-8 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-4">
          <div className="hex-shape w-12 h-12 bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20 shrink-0">
            <Hexagon size={18} className="text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-brand-900 tracking-tight">{job.client_name}</h2>
            <div className="flex items-center gap-4 mt-1.5 text-sm text-brand-600/60">
              {job.address && <span className="flex items-center gap-1"><MapPin size={13}/>{job.address}</span>}
              {job.phone   && <span className="flex items-center gap-1"><Phone size={13}/>{job.phone}</span>}
              {job.email   && <span className="flex items-center gap-1"><Mail size={13}/>{job.email}</span>}
            </div>
          </div>
        </div>
        <StatusBadge status={job.status}/>
      </div>

      {/* Satellite section */}
      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="hex-icon"><Satellite size={16} /></div>
            <div>
              <h3 className="font-semibold text-brand-900">Satellite Estimate</h3>
              <p className="text-xs text-brand-600/60">Auto-measured from OpenStreetMap building footprint</p>
            </div>
          </div>
          {job.address && (
            <button onClick={runSatelliteEstimate} disabled={runningSat} className="btn-secondary">
              {runningSat
                ? <><Loader2 size={15} className="animate-spin"/> Estimating...</>
                : <><Satellite size={15}/> {hasSatellite ? "Re-run" : "Get"} Estimate</>}
            </button>
          )}
        </div>

        {satError && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50/60 border border-amber-200/50 text-xs text-amber-700 flex items-start gap-2">
            <AlertTriangle size={13} className="shrink-0 mt-0.5"/> {satError}
          </div>
        )}

        {satellite_estimate ? (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Footprint", value: `${satellite_estimate.footprint_sqft.toLocaleString()} sq ft` },
              { label: "Roof Area", value: `${satellite_estimate.roof_sqft.toLocaleString()} sq ft` },
              { label: "Perimeter", value: `${satellite_estimate.eave_length_ft.toLocaleString()} lin ft` },
            ].map(({ label, value }) => (
              <div key={label} className="text-center p-4 rounded-xl bg-brand-50/50 border border-brand-100/50">
                <p className="text-xs text-brand-600/60 mb-1">{label}</p>
                <p className="font-bold text-brand-900">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6">
            <p className="text-sm text-brand-400">
              {job.address ? "Click \"Get Estimate\" to run satellite measurement." : "Add an address to enable satellite estimation."}
            </p>
          </div>
        )}
      </div>

      {/* Measurements */}
      <div className="card p-6">
        <div className="flex items-center gap-3 mb-5">
          <div className="hex-icon"><Ruler size={16} /></div>
          <div>
            <h3 className="font-semibold text-brand-900">Measurements</h3>
            {measurement?.source && (
              <span className={`inline-flex items-center text-[10px] px-2.5 py-0.5 rounded-full font-semibold border mt-1 ${SOURCE_COLORS[measurement.source] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                {SOURCE_LABELS[measurement.source] ?? measurement.source}
              </span>
            )}
          </div>
        </div>

        {measurement ? (
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Ruler,      label: "Roof Area",     value: `${measurement.total_sqft.toLocaleString()} sq ft`,                                                                      accent: "from-brand-400 to-brand-600" },
              { icon: Triangle,   label: "Pitch",         value: `${measurement.pitch_degrees}\u00B0 \u2014 ${PITCH_LABELS[measurement.pitch_bracket as PitchBracket] ?? measurement.pitch_bracket}`, accent: "from-violet-400 to-purple-500" },
              { icon: Minus,      label: "Ridge Length",  value: `${measurement.ridge_length_ft.toFixed(1)} lin ft`,                                                                       accent: "from-emerald-400 to-green-500" },
              { icon: Minus,      label: "Eave / Gutter", value: `${measurement.eave_length_ft.toFixed(1)} lin ft`,                                                                       accent: "from-sky-400 to-cyan-500" },
              { icon: Minus,      label: "Valley Length", value: `${measurement.valley_length_ft.toFixed(1)} lin ft`,                                                                      accent: "from-amber-400 to-orange-500" },
              { icon: TrendingUp, label: "Complexity",    value: `${measurement.complexity_score.toFixed(2)}\u00D7`,                                                                       accent: "from-rose-400 to-pink-500" },
            ].map(({ icon: Icon, label, value, accent }) => (
              <div key={label} className="metric-card group">
                <div className={`hex-shape w-9 h-9 bg-gradient-to-br ${accent} flex items-center justify-center shrink-0 shadow-sm`}>
                  <Icon size={14} className="text-white"/>
                </div>
                <div>
                  <p className="text-xs text-brand-600/60 font-medium">{label}</p>
                  <p className="font-bold text-brand-900 text-sm">{value}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <div className="hex-shape w-12 h-12 bg-brand-50 mx-auto mb-3 flex items-center justify-center">
              <Ruler size={18} className="text-brand-300" />
            </div>
            <p className="text-sm text-brand-400">Run a satellite estimate to populate measurements.</p>
          </div>
        )}
      </div>

      {/* Report */}
      {measurement && (
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="hex-icon"><FileText size={16} /></div>
              <div>
                <h3 className="font-semibold text-brand-900">Roof Report</h3>
                <p className="text-xs text-brand-600/60">Branded PDF with satellite image, measurements, and pricing</p>
              </div>
            </div>
            <a href={`/api/jobs/${id}/report`} target="_blank" rel="noopener noreferrer" className="btn-primary">
              <Download size={15} /> Generate Report
            </a>
          </div>
        </div>
      )}

      {/* Quote builder */}
      {measurement && (
        <div className="card p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="hex-icon"><FileText size={16} /></div>
            <div>
              <h3 className="font-semibold text-brand-900">Generate Quote</h3>
              <p className="text-xs text-brand-600/60">Select one or more services to combine on a single quote</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            {ALL_SERVICES.map((svc) => {
              const checked = selectedServices.has(svc);
              return (
                <button
                  key={svc}
                  onClick={() => toggleService(svc)}
                  className={`p-3.5 rounded-xl border-2 text-sm font-semibold text-left transition-all duration-200 flex items-center gap-3 ${
                    checked
                      ? "border-brand-400 bg-gradient-to-r from-brand-50 to-white text-brand-700 shadow-sm shadow-brand-500/10"
                      : "border-brand-100 text-brand-600/70 hover:border-brand-200 hover:bg-brand-50/30"
                  }`}
                >
                  <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${
                    checked ? "bg-gradient-to-br from-brand-500 to-brand-600 border-brand-500" : "border-brand-200"
                  }`}>
                    {checked && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </span>
                  {SERVICE_LABELS[svc]}
                </button>
              );
            })}
          </div>
          <button onClick={generateQuote} disabled={quoting || selectedServices.size === 0} className="btn-primary w-full justify-center">
            {quoting
              ? <><Loader2 size={15} className="animate-spin"/> Building quote...</>
              : selectedServices.size === 0
                ? "Select at least one service"
                : <><FileText size={15}/> Generate Quote — {selectedLabel}</>}
          </button>
        </div>
      )}

      {/* Past quotes */}
      {quotes.length > 0 && (
        <div className="card p-6">
          <h3 className="font-semibold text-brand-900 mb-4">Past Quotes</h3>
          <div className="space-y-2">
            {quotes.map((q) => {
              const svcLabels = (q.service_types ?? []).map((s: ServiceType) => SERVICE_LABELS[s]).join(" + ");
              return (
                <div key={q.id} className="flex items-center justify-between p-4 rounded-xl bg-gradient-to-r from-brand-50/50 to-white border border-brand-100/40 text-sm transition-all hover:shadow-sm">
                  <div>
                    <span className="font-semibold text-brand-800">{svcLabels || "Quote"}</span>
                    <span className="text-brand-400 ml-2 text-xs">{new Date(q.created_at).toLocaleDateString()}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-bold text-brand-900 text-base">${q.total.toLocaleString()}</span>
                    <a href={`/jobs/${id}/quote?quoteId=${q.id}`} className="text-brand-500 hover:text-brand-700 text-xs font-semibold uppercase tracking-wide">View →</a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
