import { describe, expect, it } from "vitest";
import { detectSource, parseWorkoutCsv } from "./detect";

describe("detectSource", () => {
  it("recognises the CSV headers", () => {
    expect(
      detectSource(
        "Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE",
      ),
    ).toBe("strong");
    expect(
      detectSource(
        "title,start_time,end_time,description,exercise_title,superset_id,exercise_notes,set_index,set_type,weight_kg,reps,distance_km,duration_seconds,rpe",
      ),
    ).toBe("hevy");
    expect(
      detectSource(
        "Date,Exercise,Category,Weight,Weight Unit,Reps,Distance,Distance Unit,Time,Comment",
      ),
    ).toBe("fitnotes");
    expect(
      detectSource(
        "Date,Exercise,Category,Weight (kg),Weight (lbs),Reps,Distance,Distance Unit,Time,Notes,Kind",
      ),
    ).toBe("fitnotes");
    expect(
      detectSource("﻿Date;Exercise;Category;Weight;Weight Unit;Reps\n2024-01-01;x;y;1;kg;1"),
    ).toBe("fitnotes");
  });

  it("recognises XML and JSON files", () => {
    expect(detectSource('<?xml version="1.0"?>\n<HealthData locale="en_US">')).toBe("apple_health");
    expect(detectSource('{"format":"personal-life-os/gym-plan","version":1}')).toBe("plan_file");
    expect(detectSource('{\n "format": "personal-life-os/gym-backup"')).toBe("backup");
  });

  it("returns null for anything else", () => {
    expect(detectSource("a,b,c")).toBeNull();
    expect(detectSource("")).toBeNull();
    expect(detectSource("<html></html>")).toBeNull();
    expect(detectSource('{"hello":1}')).toBeNull();
  });
});

describe("parseWorkoutCsv", () => {
  it("dispatches by detected source and rejects unknown files", () => {
    const r = parseWorkoutCsv(
      "Date,Exercise,Category,Weight,Weight Unit,Reps\n2024-04-02,Squat,Legs,100,kg,5",
    );
    expect(r.source).toBe("fitnotes");
    expect(() => parseWorkoutCsv("a,b\n1,2")).toThrow(/Strong, Hevy or FitNotes/);
  });
});
