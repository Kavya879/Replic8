import { Card } from '../ui/card.jsx';

const statusStyles = {
  Healthy: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300',
  Warning: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  Down: 'border-rose-400/30 bg-rose-400/10 text-rose-300'
};

export function StatusPill({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[status] || statusStyles.Down}`}>
      {status}
    </span>
  );
}

export function StatusCard({ title, status, children }) {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-sm font-medium text-white/70">{title}</div>
        <StatusPill status={status} />
      </div>
      <div className="space-y-2 text-sm text-white/75">{children}</div>
    </Card>
  );
}