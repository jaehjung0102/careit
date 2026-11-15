import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = { title: "돌봄잇 | 돌봄 기록과 인계", description: "어르신의 일상을 기록하고 변화를 함께 확인하는 돌봄 협업 공간" };
const navigation = [
  { href: "/", label: "대시보드", icon: "⌂" },
  { href: "/recordings", label: "돌봄 기록", icon: "▤" },
  { href: "/changes", label: "변화 확인", icon: "◷" },
  { href: "/handovers", label: "인수인계", icon: "⇄" },
  { href: "/admin", label: "운영 관리", icon: "⚙" },
];
export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="ko"><body><div className="min-h-screen lg:flex">
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white px-4 py-7 lg:flex lg:flex-col"><Link href="/" className="mb-12 flex items-center gap-3 px-3"><span className="brand-mark">잇</span><span><strong className="block text-xl tracking-tight text-slate-900">돌봄잇</strong><small className="text-xs text-slate-400">돌봄을 이어주는 기록</small></span></Link><p className="px-3 pb-3 text-xs font-bold tracking-widest text-slate-400">WORKSPACE</p><nav aria-label="주 메뉴" className="space-y-1">{navigation.map((item) => <Link key={item.href} href={item.href} className="nav-link"><span className="w-6 text-center text-xl leading-none text-teal-600" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav><div className="mt-auto rounded-2xl bg-teal-50 p-4 text-sm text-teal-900"><strong>개발용 미리보기</strong><p className="mt-2 leading-5 text-teal-700">현재 화면은 예시 데이터를 사용합니다.</p></div></aside>
    <div className="min-w-0 flex-1"><header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5 sm:px-8 lg:h-20 lg:px-10"><Link href="/" className="flex items-center gap-2 font-bold text-slate-900 lg:hidden"><span className="brand-mark small">잇</span>돌봄잇</Link><div className="hidden text-sm text-slate-500 lg:block">오늘도 세심한 돌봄을 이어가요.</div><div className="flex items-center gap-3"><span className="hidden rounded-full bg-teal-50 px-3 py-1.5 text-xs font-semibold text-teal-700 sm:inline">데모 워크스페이스</span><span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">정</span></div></header><main className="mx-auto max-w-7xl px-5 py-8 pb-28 sm:px-8 lg:px-10 lg:py-10">{children}</main></div>
  </div><nav aria-label="모바일 주 메뉴" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-slate-200 bg-white px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.04)] lg:hidden">{navigation.map((item) => <Link key={item.href} href={item.href} className="flex min-h-16 flex-col items-center justify-center gap-0.5 text-center text-[10px] font-medium text-slate-600"><span className="text-xl leading-none text-teal-600" aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav></body></html>;
}
