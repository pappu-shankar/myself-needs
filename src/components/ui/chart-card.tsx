"use client";

import { useId, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export interface ChartTableColumn<T> {
  key: string;
  label: string;
  align?: "left" | "right";
  render: (row: T) => React.ReactNode;
}

interface ChartCardProps<T> {
  title: string;
  description?: string;
  children: React.ReactNode;
  tableData: T[];
  tableColumns: ChartTableColumn<T>[];
  emptyTitle?: string;
  emptyDescription?: string;
}

/**
 * Wraps a chart with a consistent title and a "view as table" toggle — the
 * accessibility twin every chart needs (see the dataviz skill's
 * `components.md`). Shows an empty state instead of an empty plot.
 */
export function ChartCard<T>({
  title,
  description,
  children,
  tableData,
  tableColumns,
  emptyTitle = "No data yet",
  emptyDescription = "Nothing to chart yet.",
}: ChartCardProps<T>) {
  const [showTable, setShowTable] = useState(false);
  const rowKeyBase = useId();

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-base font-medium">{title}</CardTitle>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </div>
        {tableData.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setShowTable((v) => !v)}>
            {showTable ? "View chart" : "View as table"}
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {tableData.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} />
        ) : showTable ? (
          <Table>
            <TableHeader>
              <TableRow>
                {tableColumns.map((col) => (
                  <TableHead
                    key={col.key}
                    className={col.align === "right" ? "text-right" : undefined}
                  >
                    {col.label}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {tableData.map((row, i) => (
                <TableRow key={`${rowKeyBase}-${i}`}>
                  {tableColumns.map((col) => (
                    <TableCell
                      key={col.key}
                      className={col.align === "right" ? "text-right tabular-nums" : undefined}
                    >
                      {col.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
