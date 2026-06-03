import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card.jsx';

export function MetricCard({ title, value, delta, description }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </div>
        {delta ? <span className="text-xs text-emerald-400">{delta}</span> : null}
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-semibold tracking-tight text-white">{value}</div>
      </CardContent>
    </Card>
  );
}