"use client";

import { useMemo, useState } from "react";
import type { HouseModel } from "@/modules/house";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { FormField } from "@/components/ui/form-field";
import { ProjectDialog } from "./project-dialog";
import { FloorDialog } from "./floor-dialog";
import { RoomDialog } from "./room-dialog";
import { OpeningDialog } from "./opening-dialog";
import { StairDialog } from "./stair-dialog";
import { FixtureDialog } from "./fixture-dialog";
import { WallStyleDialog } from "./wall-style-dialog";
import { FurnitureDialog } from "./furniture-dialog";
import { LightFixtureDialog } from "./light-fixture-dialog";
import { HouseViewer, type HouseSelection } from "./house-viewer";
import { FloorPlan2D } from "./floor-plan-2d";
import { FurnitureCatalog } from "./furniture-catalog";
import type { ProjectFormValues } from "./project-form";
import type { FloorFormValues } from "./floor-form";
import type { RoomFormValues } from "./room-form";
import type { OpeningFormValues } from "./opening-form";
import type { StairFormValues } from "./stair-form";
import type { FixtureFormValues } from "./fixture-form";
import type { WallStyleFormValues } from "./wall-style-form";
import type { FurnitureFormValues } from "./furniture-form";
import type { LightFixtureFormValues } from "./light-fixture-form";

/** First map entry whose list contains a row with this `id` — used to resolve a 3D-view click (an entity id) back to both its row and its parent key (a floor/room id), since the click only reports the id. */
function findInMap<T extends { id: number }>(
  map: Record<number, T[]>,
  id: number,
): { key: number; item: T } | undefined {
  for (const [key, items] of Object.entries(map)) {
    const item = items.find((i) => i.id === id);
    if (item) return { key: Number(key), item };
  }
  return undefined;
}

export function HouseWorkspace({
  projects,
  floorsByProject,
  roomsByFloor,
  openingsByRoom,
  fixturesByFloor,
  stairsByProject,
  wallStylesByRoom,
  furnitureByRoom,
  lightFixturesByRoom,
  modelByProject,
}: {
  projects: ProjectFormValues[];
  floorsByProject: Record<number, FloorFormValues[]>;
  roomsByFloor: Record<number, RoomFormValues[]>;
  openingsByRoom: Record<number, OpeningFormValues[]>;
  fixturesByFloor: Record<number, FixtureFormValues[]>;
  stairsByProject: Record<number, StairFormValues[]>;
  wallStylesByRoom: Record<number, WallStyleFormValues[]>;
  furnitureByRoom: Record<number, FurnitureFormValues[]>;
  lightFixturesByRoom: Record<number, LightFixtureFormValues[]>;
  modelByProject: Record<number, HouseModel | null>;
}) {
  const [selectedProjectId, setSelectedProjectId] = useState(projects[0]?.id);
  const project = projects.find((p) => p.id === selectedProjectId);
  const floors = useMemo(
    () => (project ? (floorsByProject[project.id] ?? []) : []),
    [project, floorsByProject],
  );
  const stairs = useMemo(
    () => (project ? (stairsByProject[project.id] ?? []) : []),
    [project, stairsByProject],
  );

  const [selectedFloorId, setSelectedFloorId] = useState(floors[0]?.id);
  const floor = floors.find((f) => f.id === selectedFloorId) ?? floors[0];
  const rooms = useMemo(() => (floor ? (roomsByFloor[floor.id] ?? []) : []), [floor, roomsByFloor]);
  const fixtures = useMemo(
    () => (floor ? (fixturesByFloor[floor.id] ?? []) : []),
    [floor, fixturesByFloor],
  );

  const [selectedRoomId, setSelectedRoomId] = useState(rooms[0]?.id);
  const room = rooms.find((r) => r.id === selectedRoomId) ?? rooms[0];
  const openings = useMemo(
    () => (room ? (openingsByRoom[room.id] ?? []) : []),
    [room, openingsByRoom],
  );
  const wallStyles = useMemo(
    () => (room ? (wallStylesByRoom[room.id] ?? []) : []),
    [room, wallStylesByRoom],
  );
  const furniture = useMemo(
    () => (room ? (furnitureByRoom[room.id] ?? []) : []),
    [room, furnitureByRoom],
  );
  const lightFixtures = useMemo(
    () => (room ? (lightFixturesByRoom[room.id] ?? []) : []),
    [room, lightFixturesByRoom],
  );

  const [selection, setSelection] = useState<HouseSelection | null>(null);
  const selectedRoom =
    selection?.kind === "room" ? findInMap(roomsByFloor, selection.id) : undefined;
  const selectedOpening =
    selection?.kind === "opening" ? findInMap(openingsByRoom, selection.id) : undefined;
  const selectedFurniture =
    selection?.kind === "furniture" ? findInMap(furnitureByRoom, selection.id) : undefined;
  const selectedLightFixture =
    selection?.kind === "lightFixture" ? findInMap(lightFixturesByRoom, selection.id) : undefined;

  if (!project) return null;
  const model = modelByProject[project.id];

  function handleProjectChange(id: number) {
    setSelectedProjectId(id);
    const nextFloors = floorsByProject[id] ?? [];
    setSelectedFloorId(nextFloors[0]?.id);
    setSelectedRoomId((roomsByFloor[nextFloors[0]?.id ?? -1] ?? [])[0]?.id);
  }

  function handleFloorChange(id: number) {
    setSelectedFloorId(id);
    setSelectedRoomId((roomsByFloor[id] ?? [])[0]?.id);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <FormField label="Project" htmlFor="projectPicker" className="min-w-48">
          <select
            id="projectPicker"
            value={project.id}
            onChange={(e) => handleProjectChange(Number(e.target.value))}
            className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </FormField>
        <div className="flex gap-2">
          <ProjectDialog project={project} triggerLabel="Edit project" />
          <ProjectDialog triggerLabel="Add project" />
        </div>
      </div>

      <div>
        <div className="mb-3 flex items-center justify-between gap-4">
          <h2 className="text-lg font-medium">Floors</h2>
          <FloorDialog projectId={project.id} triggerLabel="Add floor" />
        </div>
        {floors.length === 0 ? (
          <EmptyState title="No floors yet" description="Add a floor to start placing rooms." />
        ) : (
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Level</TableHead>
                  <TableHead className="text-right">Wall height (m)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {floors.map((f) => (
                  <TableRow key={f.id}>
                    <TableCell>{f.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.level}</TableCell>
                    <TableCell className="text-right tabular-nums">{f.floorHeight}</TableCell>
                    <TableCell className="text-right">
                      <FloorDialog projectId={project.id} floor={f} triggerLabel="Edit" />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}
      </div>

      {floors.length >= 2 && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">Stairs</h2>
            <StairDialog projectId={project.id} floors={floors} triggerLabel="Add stair flight" />
          </div>
          {stairs.length === 0 ? (
            <EmptyState title="No stairs yet" description="Add a flight to connect two floors." />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead className="text-right">Width × Run (m)</TableHead>
                    <TableHead className="text-right">Position (x, z)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stairs.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>{s.name}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {floors.find((f) => f.id === s.fromFloorId)?.name ?? s.fromFloorId} →{" "}
                        {floors.find((f) => f.id === s.toFloorId)?.name ?? s.toFloorId}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.width} × {s.run}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {s.x}, {s.z}
                      </TableCell>
                      <TableCell className="text-right">
                        <StairDialog
                          projectId={project.id}
                          floors={floors}
                          stair={s}
                          triggerLabel="Edit"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {floors.length > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
            <FormField label="Floor" htmlFor="floorPicker" className="min-w-48">
              <select
                id="floorPicker"
                value={floor?.id}
                onChange={(e) => handleFloorChange(Number(e.target.value))}
                className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm"
              >
                {floors.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </FormField>
            {floor && <RoomDialog floorId={floor.id} triggerLabel="Add room" />}
          </div>
          {rooms.length === 0 ? (
            <EmptyState
              title="No rooms on this floor yet"
              description="Add a room to start placing it in the 3D view."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Width × Depth (m)</TableHead>
                    <TableHead className="text-right">Position (x, z)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rooms.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{r.type}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.width} × {r.depth}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.x}, {r.z}
                      </TableCell>
                      <TableCell className="text-right">
                        {floor && <RoomDialog floorId={floor.id} room={r} triggerLabel="Edit" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {floor && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">Fixtures</h2>
            <FixtureDialog floorId={floor.id} triggerLabel="Add fixture" />
          </div>
          {fixtures.length === 0 ? (
            <EmptyState
              title="No fixtures yet"
              description="Water inlets, sumps, septic tanks, and other utility points on this floor."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Position (x, z)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fixtures.map((fx) => (
                    <TableRow key={fx.id}>
                      <TableCell>{fx.name}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {fx.category.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fx.x}, {fx.z}
                      </TableCell>
                      <TableCell className="text-right">
                        <FixtureDialog floorId={floor.id} fixture={fx} triggerLabel="Edit" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {rooms.length > 0 && (
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-4">
            <FormField label="Room" htmlFor="roomPicker" className="min-w-48">
              <select
                id="roomPicker"
                value={room?.id}
                onChange={(e) => setSelectedRoomId(Number(e.target.value))}
                className="border-input bg-background h-8 w-full rounded-md border px-3 text-sm"
              >
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </FormField>
            {room && <OpeningDialog roomId={room.id} triggerLabel="Add opening" />}
          </div>
          {openings.length === 0 ? (
            <EmptyState
              title="No doors or windows on this room yet"
              description="Add an opening to place a door or window on one of its walls."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wall</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Offset (m)</TableHead>
                    <TableHead className="text-right">Width (m)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openings.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell className="capitalize">{o.wall}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{o.type}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.offset}</TableCell>
                      <TableCell className="text-right tabular-nums">{o.width}</TableCell>
                      <TableCell className="text-right">
                        {room && <OpeningDialog roomId={room.id} opening={o} triggerLabel="Edit" />}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {room && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">Wall styles</h2>
            <WallStyleDialog roomId={room.id} triggerLabel="Add wall style" />
          </div>
          {wallStyles.length === 0 ? (
            <EmptyState
              title="All 4 walls are solid"
              description="Override a wall to open or railing — for a balcony edge or an open-concept landing."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wall</TableHead>
                    <TableHead>Style</TableHead>
                    <TableHead className="text-right">Railing height (m)</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {wallStyles.map((w) => (
                    <TableRow key={w.id}>
                      <TableCell className="capitalize">{w.wall}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">{w.style}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {w.railingHeight ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{w.color ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <WallStyleDialog roomId={room.id} wallStyle={w} triggerLabel="Edit" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {room && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">Furniture</h2>
            <FurnitureDialog roomId={room.id} triggerLabel="Add furniture" />
          </div>
          {furniture.length === 0 ? (
            <EmptyState
              title="No furniture yet"
              description="Beds, sofas, tables — placed as simple colored boxes, not 3D models."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Width × Depth × Height (m)</TableHead>
                    <TableHead className="text-right">Position (x, z)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {furniture.map((fu) => (
                    <TableRow key={fu.id}>
                      <TableCell>{fu.name}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {fu.category.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fu.width} × {fu.depth} × {fu.height}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fu.x}, {fu.z}
                      </TableCell>
                      <TableCell className="text-right">
                        <FurnitureDialog roomId={room.id} furniture={fu} triggerLabel="Edit" />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {room && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-4">
            <h2 className="text-lg font-medium">Light fixtures</h2>
            <LightFixtureDialog roomId={room.id} triggerLabel="Add light fixture" />
          </div>
          {lightFixtures.length === 0 ? (
            <EmptyState
              title="No light fixtures yet"
              description="Ceiling, wall, pendant, or floor lamps — rendered as real lights, not just markers."
            />
          ) : (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Position (x, z)</TableHead>
                    <TableHead>Color</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lightFixtures.map((lf) => (
                    <TableRow key={lf.id}>
                      <TableCell>{lf.name}</TableCell>
                      <TableCell className="text-muted-foreground capitalize">
                        {lf.type.replace("_", " ")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {lf.x}, {lf.z}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{lf.color ?? "—"}</TableCell>
                      <TableCell className="text-right">
                        <LightFixtureDialog
                          roomId={room.id}
                          lightFixture={lf}
                          triggerLabel="Edit"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}

      {selectedRoom && (
        <RoomDialog
          key={`room-${selectedRoom.item.id}`}
          floorId={selectedRoom.key}
          room={selectedRoom.item}
          open
          onOpenChange={(o) => !o && setSelection(null)}
        />
      )}
      {selectedOpening && (
        <OpeningDialog
          key={`opening-${selectedOpening.item.id}`}
          roomId={selectedOpening.key}
          opening={selectedOpening.item}
          open
          onOpenChange={(o) => !o && setSelection(null)}
        />
      )}
      {selectedFurniture && (
        <FurnitureDialog
          key={`furniture-${selectedFurniture.item.id}`}
          roomId={selectedFurniture.key}
          furniture={selectedFurniture.item}
          open
          onOpenChange={(o) => !o && setSelection(null)}
        />
      )}
      {selectedLightFixture && (
        <LightFixtureDialog
          key={`lightFixture-${selectedLightFixture.item.id}`}
          roomId={selectedLightFixture.key}
          lightFixture={selectedLightFixture.item}
          open
          onOpenChange={(o) => !o && setSelection(null)}
        />
      )}

      {floor && (
        <div>
          <div className="mb-3">
            <h2 className="text-lg font-medium">Floor plan</h2>
            <p className="text-muted-foreground text-sm">
              Drag an empty area to draw a new room. Drag a room to move it, or its corner handle to
              resize it. Click a room or furniture item to edit it. Drag a category below onto a
              room to place it there.
            </p>
          </div>
          <div className="mb-3">
            <FurnitureCatalog />
          </div>
          <FloorPlan2D
            floorId={floor.id}
            floorName={floor.name}
            rooms={rooms}
            openingsByRoom={openingsByRoom}
            furnitureByRoom={furnitureByRoom}
            onSelect={setSelection}
          />
        </div>
      )}

      <div>
        <div className="mb-3">
          <h2 className="text-lg font-medium">3D view</h2>
          <p className="text-muted-foreground text-sm">
            Click a wall, door, window, furniture item, or light fixture to edit it directly.
          </p>
        </div>
        {model && model.floors.some((f) => f.rooms.length > 0) ? (
          <HouseViewer model={model} onSelect={setSelection} />
        ) : (
          <Card>
            <CardContent>
              <EmptyState
                title="Nothing to render yet"
                description="Add at least one room to see the 3D model."
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
