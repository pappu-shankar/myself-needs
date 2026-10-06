import { Card, CardContent } from "@/components/ui/card";

/** A labelled number; `detail` is plain-language context under it. */
export function StatTile({
  label,
  value,
  unit,
  detail,
}: {
  label: string;
  value: string;
  unit?: string;
  detail?: string;
}) {
  return (
    <Card size="sm">
      <CardContent>
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {value}
          {unit && <span className="text-muted-foreground ml-1 text-sm font-normal">{unit}</span>}
        </p>
        {detail && <p className="text-muted-foreground mt-1 text-xs">{detail}</p>}
      </CardContent>
    </Card>
  );
}
