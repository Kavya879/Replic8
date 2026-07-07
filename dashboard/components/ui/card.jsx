function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, ...props }) {
  return <div className={cn('group relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_18px_60px_rgba(0,0,0,0.35)] backdrop-blur-xl transition-transform duration-300 hover:-translate-y-0.5 hover:border-white/20', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('mb-4 flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('font-display text-[0.92rem] font-semibold tracking-[0.18em] text-white/78 uppercase', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('mt-1 text-xs leading-5 text-white/48', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('relative z-10 min-h-0', className)} {...props} />;
}