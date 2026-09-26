"use client";

import { useActionState } from "react";
import {
  updateSlabRateAction,
  type UpdateSlabRateState,
} from "@/modules/finance/actions/config/tax";
import type { getTaxSlabsView } from "@/modules/finance";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Slab = ReturnType<typeof getTaxSlabsView>[number];

const initialState: UpdateSlabRateState = {};

function SlabRow({ slab, previousUpto }: { slab: Slab; previousUpto: number }) {
  const [state, formAction, isPending] = useActionState(updateSlabRateAction, initialState);

  return (
    <TableRow>
      <TableCell className="tabular-nums">
        {previousUpto.toLocaleString("en-IN")} –{" "}
        {slab.uptoAmount ? slab.uptoAmount.toLocaleString("en-IN") : "∞"}
      </TableCell>
      <TableCell>
        <form action={formAction} className="flex items-center justify-end gap-2">
          <input type="hidden" name="id" value={slab.id} />
          <Input
            key={slab.ratePercent}
            type="number"
            step="any"
            min="0"
            max="100"
            name="ratePercent"
            defaultValue={slab.ratePercent}
            className="w-20 text-right tabular-nums"
          />
          <span className="text-muted-foreground text-sm">%</span>
          <Button type="submit" variant="ghost" size="sm" disabled={isPending}>
            {isPending ? "…" : "Save"}
          </Button>
        </form>
        {state.error && (
          <p role="alert" className="text-destructive mt-1 text-right text-xs">
            {state.error}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}

function withLowerBounds(slabs: Slab[]): { slab: Slab; previousUpto: number }[] {
  const rows: { slab: Slab; previousUpto: number }[] = [];
  let previousUpto = 0;
  for (const slab of slabs) {
    rows.push({ slab, previousUpto });
    previousUpto = slab.uptoAmount ?? previousUpto;
  }
  return rows;
}

export function SlabsTable({ title, slabs }: { title: string; slabs: Slab[] }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Bracket</TableHead>
            <TableHead className="text-right">Rate</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withLowerBounds(slabs).map(({ slab, previousUpto }) => (
            <SlabRow key={slab.id} slab={slab} previousUpto={previousUpto} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
