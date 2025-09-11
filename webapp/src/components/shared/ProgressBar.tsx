export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="w-full h-3 bg-gray-200 rounded-full">
      <div className="h-3 rounded-full bg-blue-500" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
