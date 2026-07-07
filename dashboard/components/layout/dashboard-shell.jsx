export function DashboardShell({ children }) {
  return (
    <main className="relative isolate mx-auto min-h-screen max-w-[1600px] overflow-hidden bg-black px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mb-6 flex items-center justify-between rounded-2xl border border-white/10 bg-black/70 px-5 py-4 shadow-[0_18px_60px_rgba(0,0,0,0.24)] backdrop-blur-xl">
        <div>
          <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/80">Replic8</div>
          <div className="mt-1 text-sm text-white/60">Live PostgreSQL cluster observability</div>
        </div>
        <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
          Online
        </div>
      </div>
      {children}
    </main>
  );
}