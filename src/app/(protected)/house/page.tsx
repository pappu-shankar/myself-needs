import type { Metadata } from "next";
import {
  getProjects,
  getFloorsForProject,
  getRoomsForFloor,
  getOpeningsForRoom,
  getFixturesForFloor,
  getStairsForProject,
  getWallStylesForRoom,
  getFurnitureForRoom,
  getLightFixturesForRoom,
  getHouseModel,
} from "@/modules/house";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectDialog } from "./project-dialog";
import { HouseWorkspace } from "./house-workspace";

export const metadata: Metadata = {
  title: "House — Personal Life OS",
};

export default function HousePage() {
  const projects = getProjects();

  const floorsByProject = Object.fromEntries(
    projects.map((p) => [p.id, getFloorsForProject(p.id)]),
  );
  const roomsByFloor = Object.fromEntries(
    Object.values(floorsByProject)
      .flat()
      .map((f) => [f.id, getRoomsForFloor(f.id)]),
  );
  const openingsByRoom = Object.fromEntries(
    Object.values(roomsByFloor)
      .flat()
      .map((r) => [r.id, getOpeningsForRoom(r.id)]),
  );
  const fixturesByFloor = Object.fromEntries(
    Object.values(floorsByProject)
      .flat()
      .map((f) => [f.id, getFixturesForFloor(f.id)]),
  );
  const stairsByProject = Object.fromEntries(
    projects.map((p) => [p.id, getStairsForProject(p.id)]),
  );
  const wallStylesByRoom = Object.fromEntries(
    Object.values(roomsByFloor)
      .flat()
      .map((r) => [r.id, getWallStylesForRoom(r.id)]),
  );
  const furnitureByRoom = Object.fromEntries(
    Object.values(roomsByFloor)
      .flat()
      .map((r) => [r.id, getFurnitureForRoom(r.id)]),
  );
  const lightFixturesByRoom = Object.fromEntries(
    Object.values(roomsByFloor)
      .flat()
      .map((r) => [r.id, getLightFixturesForRoom(r.id)]),
  );
  const modelByProject = Object.fromEntries(projects.map((p) => [p.id, getHouseModel(p.id)]));

  return (
    <>
      <PageHeader
        title="House"
        description="Plan a house or renovation — parametric rooms and floors, rendered as a 3D model."
      />

      {projects.length === 0 ? (
        <EmptyState
          title="No projects yet"
          description="Add a house or renovation design to get started."
          action={<ProjectDialog triggerLabel="Add project" />}
        />
      ) : (
        <HouseWorkspace
          projects={projects}
          floorsByProject={floorsByProject}
          roomsByFloor={roomsByFloor}
          openingsByRoom={openingsByRoom}
          fixturesByFloor={fixturesByFloor}
          stairsByProject={stairsByProject}
          wallStylesByRoom={wallStylesByRoom}
          furnitureByRoom={furnitureByRoom}
          lightFixturesByRoom={lightFixturesByRoom}
          modelByProject={modelByProject}
        />
      )}
    </>
  );
}
