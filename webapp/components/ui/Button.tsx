export function Primary(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "rounded-2xl px-4 py-2 bg-white text-slate-900 font-semibold shadow hover:shadow-lg active:scale-[.99] " +
        className
      }
    />
  );
}

export function Ghost(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={
        "rounded-2xl px-4 py-2 border border-white/20 text-white/90 hover:border-white/40 " +
        className
      }
    />
  );
}
