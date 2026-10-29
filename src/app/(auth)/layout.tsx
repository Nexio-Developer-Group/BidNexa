export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-[var(--navy-950)] px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-1 text-center">
          <div className="flex items-center gap-2 text-2xl font-bold text-white">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--teal-500)] text-[var(--navy-950)]">
              B
            </span>
            BidNexa
          </div>
          <p className="text-sm text-slate-400">
            Every Tender. Every Item. Every Detail. Under Control.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
