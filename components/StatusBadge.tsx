import { JobStatus } from "@/types";
import clsx from "clsx";

const CONFIG: Record<JobStatus, { label: string; classes: string }> = {
  created:         { label: "Created",         classes: "bg-brand-50 text-brand-600 border-brand-200" },
  fetching_images: { label: "Fetching Images", classes: "bg-sky-50 text-sky-600 border-sky-200 animate-pulse" },
  processing:      { label: "Processing",      classes: "bg-amber-50 text-amber-600 border-amber-200 animate-pulse" },
  measuring:       { label: "Measuring",       classes: "bg-violet-50 text-violet-600 border-violet-200 animate-pulse" },
  quote_ready:     { label: "Quote Ready",     classes: "bg-emerald-50 text-emerald-600 border-emerald-200" },
  quote_sent:      { label: "Sent",            classes: "bg-brand-100 text-brand-700 border-brand-300" },
  failed:          { label: "Failed",          classes: "bg-red-50 text-red-600 border-red-200" },
};

export function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = CONFIG[status] ?? CONFIG.created;
  return (
    <span className={clsx(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border",
      cfg.classes
    )}>
      <span className={clsx(
        "w-1.5 h-1.5 rounded-full",
        status === "quote_ready" ? "bg-emerald-500" :
        status === "failed"     ? "bg-red-500" :
        status === "quote_sent" ? "bg-brand-500" :
        "bg-current"
      )} />
      {cfg.label}
    </span>
  );
}
