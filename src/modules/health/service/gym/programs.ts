import { DomainError } from "@/modules/core/errors";
import { parseIsoDate, todayIso } from "@/lib/dates";
import { PROGRAM_KINDS, type ProgramKind } from "../../gym-types";
import {
  deleteProgramRow,
  getActiveProgramRow,
  getProgramRow,
  inProgramTransaction,
  insertProgram,
  listActiveProgramIds,
  listProgramRows,
  updateProgramRow,
  type GymProgramPatch,
  type GymProgramRow,
} from "../../db/queries/gym/programs";

export type Program = GymProgramRow;

export interface ProgramInput {
  name: string;
  kind: ProgramKind;
  startDate: string;
  /** Block length, or the planned total for 5/3/1 cycles. */
  weeks: number;
  /** Working sets added per week (blocks). */
  setRampPerWeek?: number;
  deloadFinalWeek?: boolean;
  notes?: string | null;
}

export type ProgramUpdate = Partial<Omit<ProgramInput, "kind">>;

function programOrThrow(id: number): Program {
  const program = getProgramRow(id);
  if (!program) throw new DomainError("That program doesn't exist anymore.");
  return program;
}

function validate(values: ProgramUpdate): GymProgramPatch {
  const out: GymProgramPatch = {};
  if (values.name !== undefined) {
    const name = values.name.trim().replace(/\s+/g, " ");
    if (!name) throw new DomainError("Program name is required.");
    if (name.length > 100) throw new DomainError("Program name must be at most 100 characters.");
    out.name = name;
  }
  if (values.startDate !== undefined) {
    try {
      parseIsoDate(values.startDate);
    } catch {
      throw new DomainError("Start date must be a valid calendar date.");
    }
    out.startDate = values.startDate;
  }
  if (values.weeks !== undefined) {
    if (!Number.isInteger(values.weeks) || values.weeks < 1 || values.weeks > 52) {
      throw new DomainError("A program runs 1 to 52 weeks.");
    }
    out.weeks = values.weeks;
  }
  if (values.setRampPerWeek !== undefined) {
    const ramp = values.setRampPerWeek;
    if (!Number.isInteger(ramp) || ramp < 0 || ramp > 3) {
      throw new DomainError("The weekly set ramp must be 0 to 3 sets.");
    }
    out.setRampPerWeek = ramp;
  }
  if (values.deloadFinalWeek !== undefined) out.deloadFinalWeek = values.deloadFinalWeek;
  if (values.notes !== undefined) {
    const notes = values.notes?.trim() ?? "";
    if (notes.length > 1000) throw new DomainError("Notes must be at most 1000 characters.");
    out.notes = notes || null;
  }
  return out;
}

/** The active program first, then newest start first. */
export function listPrograms(options: { limit?: number; offset?: number } = {}): Program[] {
  const limit = Math.min(200, Math.max(1, Math.trunc(options.limit ?? 50)));
  const offset = Math.max(0, Math.trunc(options.offset ?? 0));
  return listProgramRows(limit, offset);
}

export function getActiveProgram(): Program | null {
  return getActiveProgramRow() ?? null;
}

export function getProgram(id: number): Program {
  return programOrThrow(id);
}

/**
 * Starts a program. Only one runs at a time, so a program that's still active
 * is completed today first.
 */
export function createProgram(input: ProgramInput): Program {
  if (!PROGRAM_KINDS.includes(input.kind)) throw new DomainError("Pick a program type.");
  const values = validate({
    ...input,
    setRampPerWeek: input.setRampPerWeek ?? 0,
    deloadFinalWeek: input.deloadFinalWeek ?? true,
  });
  if (values.name === undefined || values.startDate === undefined || values.weeks === undefined) {
    throw new DomainError("Name, start date and length are required.");
  }
  const { name, startDate, weeks } = values;
  return inProgramTransaction(() => {
    const today = todayIso();
    for (const id of listActiveProgramIds()) {
      updateProgramRow(id, { status: "completed", endedAt: today });
    }
    return insertProgram({ ...values, name, startDate, weeks, kind: input.kind, status: "active" });
  });
}

export function updateProgram(id: number, patch: ProgramUpdate): Program {
  programOrThrow(id);
  const values = validate(patch);
  return Object.keys(values).length ? updateProgramRow(id, values)! : programOrThrow(id);
}

/** Stops a program: `completed` (ran its course or was cut short) or `archived` (hidden). */
export function endProgram(id: number, status: "completed" | "archived"): Program {
  const program = programOrThrow(id);
  if (status !== "completed" && status !== "archived") {
    throw new DomainError("A program ends as completed or archived.");
  }
  if (program.status === status) return program;
  return updateProgramRow(id, { status, endedAt: program.endedAt ?? todayIso() })!;
}

/** Workouts logged under it stay, just no longer linked to a program. */
export function deleteProgram(id: number): void {
  programOrThrow(id);
  deleteProgramRow(id);
}
