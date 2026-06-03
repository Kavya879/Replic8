function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

export function Card({ className, ...props }) {
  return <div className={cn('rounded-2xl border border-white/10 bg-card/90 p-6 shadow-glow backdrop-blur', className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={cn('mb-4 flex items-start justify-between gap-4', className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h3 className={cn('text-sm font-medium tracking-wide text-white/70', className)} {...props} />;
}

export function CardDescription({ className, ...props }) {
  return <p className={cn('text-xs text-white/45', className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={cn('min-h-0', className)} {...props} />;
}