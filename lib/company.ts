import { getDb } from "@/lib/db";

export interface CompanyInfo {
  company_name: string;
  company_tagline: string;
  company_phone: string;
  company_email: string;
  company_address: string;
}

const DEFAULTS: CompanyInfo = {
  company_name:    "Roof Tool",
  company_tagline: "Professional Roofing Services",
  company_phone:   "",
  company_email:   "",
  company_address: "",
};

export function loadCompanyInfo(): CompanyInfo {
  const db   = getDb();
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'company_%'").all() as { key: string; value: string }[];
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;
  return {
    company_name:    map["company_name"]    ?? process.env.COMPANY_NAME    ?? DEFAULTS.company_name,
    company_tagline: map["company_tagline"] ?? process.env.COMPANY_TAGLINE ?? DEFAULTS.company_tagline,
    company_phone:   map["company_phone"]   ?? process.env.COMPANY_PHONE   ?? DEFAULTS.company_phone,
    company_email:   map["company_email"]   ?? process.env.COMPANY_EMAIL   ?? DEFAULTS.company_email,
    company_address: map["company_address"] ?? process.env.COMPANY_ADDRESS ?? DEFAULTS.company_address,
  };
}
