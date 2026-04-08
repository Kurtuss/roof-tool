"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle, AlertCircle, Loader2, MapPin, User, FileText, Hexagon, Satellite } from "lucide-react";
import LocationConfirm from "@/components/LocationConfirm";

type GeoStatus = "idle" | "geocoding" | "found" | "not_found" | "confirmed";

export default function NewJobPage() {
  const router = useRouter();

  const [clientName, setClientName] = useState("");
  const [address, setAddress]       = useState("");
  const [phone, setPhone]           = useState("");
  const [email, setEmail]           = useState("");
  const [notes, setNotes]           = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [geoStatus, setGeoStatus]   = useState<GeoStatus>("idle");
  const [geoDisplay, setGeoDisplay] = useState("");
  const [geoLat, setGeoLat]         = useState<number | null>(null);
  const [geoLng, setGeoLng]         = useState<number | null>(null);
  const [confirmedLat, setConfirmedLat] = useState<number | null>(null);
  const [confirmedLng, setConfirmedLng] = useState<number | null>(null);
  const [showConfirmMap, setShowConfirmMap] = useState(false);

  const geocodeCheck = async () => {
    if (!address.trim()) return;
    setGeoStatus("geocoding");
    setConfirmedLat(null);
    setConfirmedLng(null);
    const res = await fetch(`/api/geocode?address=${encodeURIComponent(address)}`);
    const data = await res.json();
    if (data.found) {
      setGeoStatus("found");
      setGeoDisplay(data.display_name);
      setGeoLat(data.lat);
      setGeoLng(data.lng);
      setShowConfirmMap(true);
    } else {
      setGeoStatus("not_found");
    }
  };

  const handleLocationConfirm = (lat: number, lng: number) => {
    setConfirmedLat(lat);
    setConfirmedLng(lng);
    setGeoStatus("confirmed");
    setShowConfirmMap(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName,
        address,
        phone,
        email,
        notes,
        ...(confirmedLat != null && confirmedLng != null
          ? { lat: confirmedLat, lng: confirmedLng }
          : {}),
      }),
    });

    const data = await res.json();
    if (!res.ok) { setError(data.error ?? "Something went wrong"); setSubmitting(false); return; }

    router.push(`/jobs/${data.id}`);
  };

  return (
    <div className="p-8 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="hex-shape w-10 h-10 bg-gradient-to-br from-brand-400 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/20">
          <Hexagon size={16} className="text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-brand-900 tracking-tight">New Job</h2>
          <p className="text-sm text-brand-600/60">Create a roofing assessment for a client</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Client Details */}
        <div className="card p-6 space-y-5">
          <div className="flex items-center gap-2 mb-1">
            <User size={16} className="text-brand-500" />
            <h3 className="font-semibold text-brand-900">Client Details</h3>
          </div>

          <div>
            <label className="label">Client Name *</label>
            <input
              className="input"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. John Smith"
              required
            />
          </div>

          <div>
            <label className="label">Address</label>
            <div className="flex gap-2">
              <input
                className="input"
                value={address}
                onChange={(e) => { setAddress(e.target.value); setGeoStatus("idle"); }}
                onBlur={geocodeCheck}
                placeholder="123 Main St, City, State"
              />
              <button
                type="button"
                onClick={geocodeCheck}
                disabled={!address.trim() || geoStatus === "geocoding"}
                className="btn-secondary shrink-0"
              >
                {geoStatus === "geocoding" ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <MapPin size={15} />
                )}
                Verify
              </button>
            </div>
            {(geoStatus === "found" || geoStatus === "confirmed") && (
              <p className="mt-2 text-sm text-emerald-600 flex items-center gap-1.5">
                <CheckCircle size={14} />
                {geoStatus === "confirmed" ? "Location confirmed" : "Verified"}: <span className="text-brand-600/60 truncate max-w-sm">{geoDisplay}</span>
              </p>
            )}
            {geoStatus === "not_found" && (
              <p className="mt-2 text-sm text-amber-600 flex items-center gap-1.5">
                <AlertCircle size={14} />
                Could not geocode this address — satellite estimate may not run automatically.
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Phone</label>
              <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 000-0000" />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="client@email.com" />
            </div>
          </div>
        </div>

        {/* Location Confirmation Map */}
        {showConfirmMap && geoLat != null && geoLng != null && (
          <div className="card p-6">
            <LocationConfirm
              lat={geoLat}
              lng={geoLng}
              title="Confirm House Location"
              subtitle="Is the pin on the correct house? Click the map to move it if needed."
              confirmLabel="Yes, This is Correct"
              rejectLabel="Skip Confirmation"
              onConfirm={handleLocationConfirm}
              onReject={() => {
                setShowConfirmMap(false);
                setConfirmedLat(geoLat);
                setConfirmedLng(geoLng);
                setGeoStatus("confirmed");
              }}
            />
          </div>
        )}

        {/* Notes */}
        <div className="card p-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={16} className="text-brand-500" />
            <h3 className="font-semibold text-brand-900">Notes</h3>
          </div>
          <textarea
            className="input h-28 resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any notes about the property or scope of work..."
          />
        </div>

        {error && (
          <div className="card border-red-200 bg-red-50/80 p-4 flex items-center gap-2">
            <AlertCircle size={15} className="text-red-500 shrink-0" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {address.trim() && (geoStatus === "found" || geoStatus === "confirmed") && (
          <div className="card border-brand-200/50 bg-brand-50/50 p-4 flex items-center gap-3">
            <Satellite size={16} className="text-brand-500" />
            <p className="text-sm text-brand-700">
              {geoStatus === "confirmed"
                ? "Location confirmed. Satellite roof estimate will run on the pinned location."
                : "Confirm location above, then satellite estimate will run automatically."}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3">
          <button type="button" onClick={() => router.back()} className="btn-secondary">Cancel</button>
          <button type="submit" disabled={submitting} className="btn-primary">
            {submitting
              ? <><Loader2 size={15} className="animate-spin" /> {address.trim() ? "Creating & Estimating..." : "Creating..."}</>
              : <>Create Job{address.trim() && geoStatus === "found" ? " + Estimate" : ""}</>}
          </button>
        </div>
      </form>
    </div>
  );
}
