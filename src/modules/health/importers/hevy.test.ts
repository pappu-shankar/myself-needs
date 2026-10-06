import { describe, expect, it } from "vitest";
import { parseHevy } from "./hevy";

const HEADER =
  "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe";

const FILE = [
  HEADER,
  '"Upper A","12 Mar 2024, 18:00","12 Mar 2024, 19:10","Heavy day, short rest","Bench Press (Barbell)",,"Elbows in",0,warmup,40,10,,,',
  '"Upper A","12 Mar 2024, 18:00","12 Mar 2024, 19:10","Heavy day, short rest","Bench Press (Barbell)",,"Elbows in",1,normal,80,5,,,8.5',
  '"Upper A","12 Mar 2024, 18:00","12 Mar 2024, 19:10","Heavy day, short rest","Bench Press (Barbell)",,"Elbows in",2,failure,80,4,,,10',
  '"Upper A","12 Mar 2024, 18:00","12 Mar 2024, 19:10","Heavy day, short rest","Bench Press (Barbell)",,"Elbows in",3,dropset,60,8,,,',
  '"Upper A","12 Mar 2024, 18:00","12 Mar 2024, 19:10","Heavy day, short rest","Treadmill",,,0,normal,,,2.5,900,',
  '"Upper A","12 Mar 2024, 18:00","12 Mar 2024, 19:10","Heavy day, short rest","Pull Up",,,0,normal,0,12,,,',
].join("\n");

describe("parseHevy", () => {
  const result = parseHevy(FILE);

  it("parses a workout with times and notes", () => {
    expect(result.source).toBe("hevy");
    expect(result.warnings).toEqual([]);
    expect(result.workouts).toHaveLength(1);
    expect(result.workouts[0]).toMatchObject({
      ref: "hevy:2024-03-12T18:00:00:Upper A",
      date: "2024-03-12",
      startedAt: "2024-03-12T18:00:00",
      finishedAt: "2024-03-12T19:10:00",
      notes: "Heavy day, short rest",
    });
  });

  it("maps warm-up / working / failure / drop set types and RPE", () => {
    const bench = result.workouts[0].exercises[0];
    expect(bench.notes).toBe("Elbows in");
    expect(bench.sets.map((s) => s.kind)).toEqual(["warmup", "working", "failure", "drop"]);
    expect(bench.sets.map((s) => s.rpe)).toEqual([null, 8.5, 10, null]);
  });

  it("reads cardio and bodyweight rows", () => {
    const [, treadmill, pullUp] = result.workouts[0].exercises;
    expect(treadmill.sets[0]).toMatchObject({ distanceKm: 2.5, durationSec: 900, reps: null });
    expect(pullUp.sets[0]).toMatchObject({ weightKg: null, reps: 12 });
  });

  it("reads weight_lbs files and ISO timestamps", () => {
    const lb = parseHevy(
      [
        "title,start_time,end_time,exercise_title,set_index,set_type,weight_lbs,reps",
        "Legs,2024-03-12 18:00:00,2024-03-12 19:00:00,Squat (Barbell),0,normal,225,5",
      ].join("\n"),
    );
    expect(lb.workouts[0].exercises[0].sets[0].weightKg).toBeCloseTo(102.06, 2);
    expect(lb.workouts[0].finishedAt).toBe("2024-03-12T19:00:00");
  });
});
