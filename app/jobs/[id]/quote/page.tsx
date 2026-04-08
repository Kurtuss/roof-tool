"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Printer, ArrowLeft, CheckCircle, Hexagon } from "lucide-react";
import Link from "next/link";
import { Quote, ServiceType, SERVICE_LABELS } from "@/types";
import type { CompanyInfo } from "@/lib/company";

const DEFAULT_COMPANY: CompanyInfo = {
  company_name:    "Roof Tool",
  company_tagline: "Drone-Powered Roofing Assessments",
  company_phone:   "",
  company_email:   "",
  company_address: "",
};

export default function QuotePage() {
  const { id }         = useParams<{ id: string }>();
  const searchParams   = useSearchParams();
  const quoteId        = searchParams.get("quoteId");

  const [quote, setQuote]         = useState<Quote | null>(null);
  const [jobData, setJobData]     = useState<{ client_name: string; address?: string } | null>(null);
  const [company, setCompany]     = useState<CompanyInfo>(DEFAULT_COMPANY);
  const [loading, setLoading]     = useState(true);
  const [markingSent, setMarkingSent] = useState(false);
  const [sent, setSent]           = useState(false);

  useEffect(() => {
    if (!quoteId) return;
    Promise.all([
      fetch(`/api/jobs/${id}`).then((r) => r.json()),
      fetch("/api/settings/company").then((r) => r.json()),
    ]).then(([jobDetail, co]) => {
        setJobData(jobDetail.job);
        setCompany(co);
        const q = jobDetail.quotes.find((q: Quote) => q.id === parseInt(quoteId));
        if (q) setQuote(q);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id, quoteId]);

  const markSent = async () => {
    setMarkingSent(true);
    await fetch(`/api/jobs/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "quote_sent" }),
    });
    setSent(true);
    setMarkingSent(false);
  };

  if (loading) return (
    <div className="p-8 flex items-center justify-center min-h-[50vh]">
      <div className="text-center">
        <div className="hex-shape w-12 h-12 bg-gradient-to-br from-brand-300 to-brand-500 mx-auto mb-3 animate-pulse-slow flex items-center justify-center">
          <Hexagon size={18} className="text-white" />
        </div>
        <p className="text-brand-400 text-sm">Loading quote...</p>
      </div>
    </div>
  );
  if (!quote) return <div className="p-8 text-red-500">Quote not found.</div>;

  const today = new Date().toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

  const serviceLabel = (quote.service_types ?? [])
    .map((s: ServiceType) => SERVICE_LABELS[s])
    .join(" + ");

  return (
    <div className="p-8 max-w-3xl mx-auto">
      {/* Nav */}
      <div className="flex items-center justify-between mb-8 print:hidden">
        <Link href={`/jobs/${id}`} className="btn-secondary text-sm">
          <ArrowLeft size={14} /> Back to Job
        </Link>
        <div className="flex gap-3">
          <button onClick={() => window.print()} className="btn-secondary">
            <Printer size={14} /> Print / Save PDF
          </button>
          {!sent ? (
            <button onClick={markSent} disabled={markingSent} className="btn-primary">
              {markingSent ? "Marking..." : "Mark as Sent"}
            </button>
          ) : (
            <span className="flex items-center gap-1.5 text-emerald-600 text-sm font-semibold">
              <CheckCircle size={15} /> Marked Sent
            </span>
          )}
        </div>
      </div>

      {/* Quote document */}
      <div className="card p-10 print:shadow-none print:border-0 print:bg-white">
        {/* Letterhead */}
        <div className="flex items-start justify-between mb-10">
          <div className="flex items-start gap-3">
            <div className="hex-shape w-10 h-10 bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center shadow-md print:shadow-none shrink-0">
              <Hexagon size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-brand-800">{company.company_name}</h1>
              {company.company_tagline && <p className="text-sm text-brand-500/70 mt-0.5">{company.company_tagline}</p>}
              <div className="mt-2 space-y-0.5 text-xs text-brand-400">
                {company.company_phone   && <p>{company.company_phone}</p>}
                {company.company_email   && <p>{company.company_email}</p>}
                {company.company_address && <p>{company.company_address}</p>}
              </div>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold text-brand-800 text-lg uppercase tracking-wider">Quote</p>
            <p className="text-brand-500 font-medium">#{quote.id.toString().padStart(5, "0")}</p>
            <p className="text-brand-400 mt-0.5">{today}</p>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-gradient-to-r from-brand-200 via-brand-400 to-brand-200 mb-8" />

        {/* Client info */}
        <div className="mb-8">
          <p className="text-[10px] text-brand-400 uppercase tracking-widest font-semibold mb-1">Prepared for</p>
          <p className="font-bold text-lg text-brand-900">{jobData?.client_name}</p>
          {jobData?.address && <p className="text-brand-600/70">{jobData.address}</p>}
        </div>

        {/* Service(s) */}
        <div className="mb-6">
          <p className="text-[10px] text-brand-400 uppercase tracking-widest font-semibold mb-1">
            {(quote.service_types ?? []).length > 1 ? "Services" : "Service"}
          </p>
          <p className="font-semibold text-brand-800">{serviceLabel || "Quote"}</p>
        </div>

        {/* Line items */}
        <div className="rounded-xl border border-brand-100/50 overflow-hidden mb-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gradient-to-r from-brand-50 to-brand-100/30">
                <th className="text-left py-3 px-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Description</th>
                <th className="text-right py-3 px-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Qty</th>
                <th className="text-right py-3 px-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Unit</th>
                <th className="text-right py-3 px-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Rate</th>
                <th className="text-right py-3 px-4 font-semibold text-brand-700 text-xs uppercase tracking-wider">Amount</th>
              </tr>
            </thead>
            <tbody>
              {quote.line_items.map((item, i) => (
                <tr key={i} className="border-t border-brand-50">
                  <td className="py-3.5 px-4 text-brand-800 font-medium">{item.label}</td>
                  <td className="py-3.5 px-4 text-right text-brand-600">
                    {item.quantity > 0 ? item.quantity.toLocaleString() : "\u2014"}
                  </td>
                  <td className="py-3.5 px-4 text-right text-brand-500">{item.unit}</td>
                  <td className="py-3.5 px-4 text-right text-brand-600">
                    {item.unit_price > 0 ? `$${item.unit_price.toFixed(2)}` : "\u2014"}
                  </td>
                  <td className="py-3.5 px-4 text-right font-semibold text-brand-800">
                    {item.subtotal > 0 ? `$${item.subtotal.toLocaleString()}` : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div className="ml-auto w-72 space-y-2 text-sm">
          <div className="flex justify-between text-brand-600 p-2">
            <span>Subtotal</span>
            <span className="font-medium">${quote.subtotal.toLocaleString()}</span>
          </div>
          {quote.tax_rate > 0 && (
            <div className="flex justify-between text-brand-600 p-2">
              <span>Tax ({(quote.tax_rate * 100).toFixed(0)}%)</span>
              <span className="font-medium">${quote.tax.toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-lg pt-3 px-2 border-t-2 border-brand-300">
            <span className="text-brand-800">Total</span>
            <span className="text-brand-700">${quote.total.toLocaleString()}</span>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-4 border-t border-brand-100/50">
          <p className="text-xs text-brand-400">
            This quote is valid for 30 days. Final pricing subject to on-site inspection.
          </p>
        </div>
      </div>
    </div>
  );
}
