export default function CitationPopover({ items }: { items: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2 text-sm text-gray-600">
      منابع:{" "}
      {items.map((c, i) => (
        <span key={i} className="mr-2 underline decoration-dotted">{c}</span>
      ))}
    </div>
  );
}
