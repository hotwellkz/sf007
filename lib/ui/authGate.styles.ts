/**
 * AuthGateModal styles — Danelfin-style spec.
 * Overlay dims page; modal is compact, centered, two-column (left blue promo, right white form).
 */
export const authGateStyles = {
  overlay:
    "fixed inset-0 z-[9999] bg-black/55",
  modal:
    "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000] w-[calc(100vw-48px)] max-w-[980px] h-[520px] max-h-[calc(100vh-48px)] rounded-[10px] bg-white overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.35)] grid grid-cols-1 md:grid-cols-[1.05fr_0.95fr]",
  closeBtn:
    "absolute right-3 top-3 z-10 w-10 h-10 flex items-center justify-center rounded-lg text-[#6b7280] hover:text-[#111827] hover:bg-gray-100 transition-colors",
  left:
    "bg-[#1d7dbb] text-white flex flex-col overflow-auto p-7",
  leftTitle:
    "text-[22px] font-bold text-white leading-tight mb-3",
  leftSub:
    "text-[14px] font-normal text-white/90 leading-[1.4] mb-4",
  chartWrap:
    "flex-1 min-h-[220px] max-h-[220px] rounded-lg bg-white/[0.08] flex items-center justify-center overflow-hidden",
  chartInner: "w-full h-full flex items-center justify-center p-2",
  legend:
    "flex items-center gap-3 text-[12px] text-white/90 mt-3 flex-shrink-0",
  legendDotA: "h-2 w-2 rounded-full bg-[#2ee59d] shrink-0",
  legendDotB: "h-2 w-2 rounded-full bg-white shrink-0",
  footnote:
    "text-[10px] text-white/85 leading-[1.35] mt-2.5 flex-shrink-0 overflow-y-auto max-h-16",
  right:
    "bg-white flex flex-col overflow-auto p-7 relative",
  rightHeader:
    "text-[22px] font-bold text-[#111827] mb-1.5",
  rightSubheader:
    "text-[13px] text-[#6b7280] leading-[1.4] mb-4",
  form: "flex flex-col",
  fieldLabel: "text-[12px] font-medium text-gray-700 mt-4 first:mt-0",
  input:
    "mt-1.5 w-full h-11 rounded-md border border-[#d1d5db] bg-white px-3 text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1d7dbb]/30 focus:border-[#1d7dbb]",
  pwWrap: "relative mt-1.5",
  pwToggle:
    "absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded flex items-center justify-center text-gray-500 hover:bg-gray-100",
  hint: "mt-1.5 text-xs text-gray-500",
  primaryBtn:
    "mt-4 w-full h-[46px] rounded-md bg-[#1d7dbb] text-white font-bold hover:brightness-95 active:brightness-90 transition",
  dividerRow: "flex items-center gap-3 my-3.5",
  dividerLine: "h-px flex-1 bg-[#e5e7eb]",
  dividerText: "text-[12px] text-[#9ca3af]",
  googleBtn:
    "w-full h-11 rounded-md border border-[#d1d5db] bg-white font-medium text-gray-800 hover:bg-gray-50 transition flex items-center justify-center gap-2",
  googleIcon: "h-5 w-5",
  footer: "mt-4 text-[11px] text-[#6b7280] leading-relaxed",
  footerLink: "text-[#1d7dbb] underline underline-offset-1 hover:no-underline",
} as const;
