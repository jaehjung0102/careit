import type { ReactNode } from "react";
export function PageHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold tracking-[.18em] text-teal-700">{eyebrow}</p><h1 className="mt-3 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{title}</h1><p className="mt-2 text-sm leading-6 text-slate-500">{description}</p></div>{action}</div>;
}
export function SectionTitle({ title, subtitle }: { title: string; subtitle: string }) {
  return <div><h2 className="text-base font-bold text-slate-900 sm:text-lg">{title}</h2><p className="mt-1 text-xs text-slate-500 sm:text-sm">{subtitle}</p></div>;
}
export function StatusBadge({ children, tone = "teal" }: { children: ReactNode; tone?: "teal" | "amber" | "slate" }) {
  const colors = { teal: "bg-teal-50 text-teal-700", amber: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-600" };
  return <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${colors[tone]}`}>{children}</span>;
}
