export function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-2xl border border-white/10 p-5 text-center">
      <div className="text-3xl font-bold text-white">{value}</div>
      <div className="mt-1 text-xs text-white/60">{label}</div>
    </div>
  );
}
