"use client";

import { useActionState, useRef } from "react";
import {
  addTaxSlabAction,
  deleteTaxSlabAction,
  updateTaxSlabAction,
} from "@/modules/finance/actions/config/tax";
import type { getTaxPolicyView } from "@/modules/finance";
import type { ActionState } from "@/modules/core/action/types";
import { useActionSuccess } from "@/lib/use-action-success";
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

type Slab = ReturnType<typeof getTaxPolicyView>["oldSlabs"][number];

const initialState: ActionState<void> = {};

function ErrorText({ state }: { state: ActionState<void> }) {
  if (!state.error) return null;
  return (
    <p role="alert" className="text-destructive mt-1 text-xs">
      {state.error}
    </p>
  );
}

function UptoInput({ form, defaultValue }: { form: string; defaultValue: number | null | string }) {
  return (
    <Input
      form={form}
      type="number"
      step="any"
      min="0"
      name="uptoAmount"
      aria-label="Upper limit (blank for no limit)"
      placeholder="No limit"
      defaultValue={defaultValue ?? ""}
      className="w-32 text-right tabular-nums"
    />
  );
}

function RateInput({ form, defaultValue }: { form: string; defaultValue: number | string }) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Input
        form={form}
        type="number"
        step="any"
        min="0"
        max="100"
        name="ratePercent"
        aria-label="Rate %"
        required
        defaultValue={defaultValue}
        className="w-20 text-right tabular-nums"
      />
      <span className="text-muted-foreground text-sm">%</span>
    </div>
  );
}

function SlabRow({
  slab,
  previousUpto,
  editable,
}: {
  slab: Slab;
  previousUpto: number;
  editable: boolean;
}) {
  const [saveState, saveAction, isSaving] = useActionState(updateTaxSlabAction, initialState);
  const [deleteState, deleteAction, isDeleting] = useActionState(deleteTaxSlabAction, initialState);
  const formId = `slab-${slab.id}`;
  // Remount the inputs when the saved values change or a failed save echoes values back.
  const inputKey = `${slab.uptoAmount}:${slab.ratePercent}:${saveState.error ? JSON.stringify(saveState.values) : ""}`;

  if (!editable) {
    return (
      <TableRow>
        <TableCell className="tabular-nums">{previousUpto.toLocaleString("en-IN")}</TableCell>
        <TableCell className="text-right tabular-nums">
          {slab.uptoAmount !== null ? slab.uptoAmount.toLocaleString("en-IN") : "No limit"}
        </TableCell>
        <TableCell className="text-right tabular-nums">{slab.ratePercent}%</TableCell>
        <TableCell />
      </TableRow>
    );
  }

  return (
    <TableRow>
      <TableCell className="tabular-nums">{previousUpto.toLocaleString("en-IN")}</TableCell>
      <TableCell className="text-right">
        <UptoInput
          key={`u-${inputKey}`}
          form={formId}
          defaultValue={saveState.error ? (saveState.values?.uptoAmount ?? "") : slab.uptoAmount}
        />
      </TableCell>
      <TableCell className="text-right">
        <RateInput
          key={`r-${inputKey}`}
          form={formId}
          defaultValue={saveState.error ? (saveState.values?.ratePercent ?? "") : slab.ratePercent}
        />
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <form id={formId} action={saveAction}>
            <input type="hidden" name="id" value={slab.id} />
            <Button type="submit" variant="ghost" size="sm" disabled={isSaving}>
              {isSaving ? "…" : "Save"}
            </Button>
          </form>
          <form action={deleteAction}>
            <input type="hidden" name="id" value={slab.id} />
            <Button type="submit" variant="ghost" size="sm" disabled={isDeleting}>
              {isDeleting ? "…" : "Delete"}
            </Button>
          </form>
        </div>
        <ErrorText state={saveState} />
        <ErrorText state={deleteState} />
      </TableCell>
    </TableRow>
  );
}

function AddSlabRow({ fiscalYear, regime }: { fiscalYear: string; regime: "old" | "new" }) {
  const [state, formAction, isPending] = useActionState(addTaxSlabAction, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const formId = `add-slab-${fiscalYear}-${regime}`;
  useActionSuccess(state, () => formRef.current?.reset());
  const inputKey = state.error ? JSON.stringify(state.values) : "";

  return (
    <TableRow>
      <TableCell className="text-muted-foreground text-sm">New bracket</TableCell>
      <TableCell className="text-right">
        <UptoInput
          key={`u-${inputKey}`}
          form={formId}
          defaultValue={state.values?.uptoAmount ?? ""}
        />
      </TableCell>
      <TableCell className="text-right">
        <RateInput
          key={`r-${inputKey}`}
          form={formId}
          defaultValue={state.values?.ratePercent ?? ""}
        />
      </TableCell>
      <TableCell className="text-right">
        <form id={formId} ref={formRef} action={formAction}>
          <input type="hidden" name="fiscalYear" value={fiscalYear} />
          <input type="hidden" name="regime" value={regime} />
          <Button type="submit" variant="outline" size="sm" disabled={isPending}>
            {isPending ? "…" : "Add"}
          </Button>
        </form>
        <ErrorText state={state} />
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

/**
 * One FY + regime's brackets. Each bracket runs from the previous bracket's
 * upper limit to its own; the top bracket has no upper limit (leave it
 * blank). The server rejects any change that would leave the schedule
 * inconsistent (see validateSlabSchedule).
 */
export function SlabsTable({
  title,
  fiscalYear,
  regime,
  slabs,
  editable,
}: {
  title: string;
  fiscalYear: string;
  regime: "old" | "new";
  slabs: Slab[];
  editable: boolean;
}) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>From</TableHead>
            <TableHead className="text-right">Up to</TableHead>
            <TableHead className="text-right">Rate</TableHead>
            <TableHead className="text-right">
              <span className="sr-only">Actions</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {withLowerBounds(slabs).map(({ slab, previousUpto }) => (
            <SlabRow key={slab.id} slab={slab} previousUpto={previousUpto} editable={editable} />
          ))}
          {editable && <AddSlabRow fiscalYear={fiscalYear} regime={regime} />}
        </TableBody>
      </Table>
    </div>
  );
}
