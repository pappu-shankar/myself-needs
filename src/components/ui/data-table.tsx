"use client";

import * as React from "react";
import { type ColumnDef, type RowData, tableFeatures, useTable } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

const ROW_HEIGHT_PX = 44;
const MAX_VISIBLE_ROWS = 12;

export interface DataTableColumnMeta {
  align?: "left" | "right";
  /** CSS width for the <col>; omit to let the browser split remaining space evenly under table-fixed layout. */
  width?: string;
}

const dataTableFeatures = tableFeatures({ columnMeta: {} as DataTableColumnMeta });
type DataTableFeatures = typeof dataTableFeatures;

export type DataTableColumnDef<TData extends RowData> = ColumnDef<DataTableFeatures, TData>;

interface DataTableProps<TData extends RowData> {
  columns: DataTableColumnDef<TData>[];
  data: TData[];
  emptyTitle: string;
  emptyDescription: string;
  emptyAction?: React.ReactNode;
  className?: string;
}

/**
 * Shared virtualized table: TanStack Table (v9) for column/row modeling,
 * TanStack Virtual for windowed rendering (only visible rows mount, even at
 * tens of thousands of rows — see docs/architecture/performance.md). Renders
 * a real <table> (not styled divs, per docs/design/accessibility.md) by
 * using top/bottom spacer <tr>s instead of absolutely-positioned rows, since
 * position:absolute would strip a <tr>'s table-row display and break column
 * alignment.
 */
export function DataTable<TData extends RowData>({
  columns,
  data,
  emptyTitle,
  emptyDescription,
  emptyAction,
  className,
}: DataTableProps<TData>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  const table = useTable({ features: dataTableFeatures, columns, data });
  const rows = table.getRowModel().rows;

  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT_PX,
    getItemKey: (index) => rows[index].id,
    overscan: 8,
  });

  if (rows.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  const virtualRows = virtualizer.getVirtualItems();
  const paddingTop = virtualRows.length > 0 ? virtualRows[0].start : 0;
  const paddingBottom =
    virtualRows.length > 0
      ? virtualizer.getTotalSize() - virtualRows[virtualRows.length - 1].end
      : 0;

  return (
    <div
      ref={scrollRef}
      className={cn(
        "relative w-full overflow-auto rounded-xl bg-card ring-1 ring-foreground/10",
        className,
      )}
      style={{ maxHeight: ROW_HEIGHT_PX * MAX_VISIBLE_ROWS }}
    >
      <Table className="table-fixed">
        <colgroup>
          {columns.map((column, i) => (
            <col key={column.id ?? i} style={{ width: column.meta?.width }} />
          ))}
        </colgroup>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className="hover:bg-transparent">
              {headerGroup.headers.map((header) =>
                header.isPlaceholder ? (
                  <TableHead key={header.id} />
                ) : (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "sticky top-0 z-10 bg-card",
                      header.column.columnDef.meta?.align === "right" && "text-right",
                    )}
                  >
                    <table.FlexRender header={header} />
                  </TableHead>
                ),
              )}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {paddingTop > 0 && (
            <tr>
              <td colSpan={columns.length} style={{ height: paddingTop }} />
            </tr>
          )}
          {virtualRows.map((virtualRow) => {
            const row = rows[virtualRow.index];
            return (
              <TableRow key={row.id} data-index={virtualRow.index} ref={virtualizer.measureElement}>
                {row.getAllCells().map((cell) => (
                  <TableCell
                    key={cell.id}
                    className={cn(
                      "truncate tabular-nums",
                      cell.column.columnDef.meta?.align === "right" && "text-right",
                    )}
                  >
                    <table.FlexRender cell={cell} />
                  </TableCell>
                ))}
              </TableRow>
            );
          })}
          {paddingBottom > 0 && (
            <tr>
              <td colSpan={columns.length} style={{ height: paddingBottom }} />
            </tr>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
