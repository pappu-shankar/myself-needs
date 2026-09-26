"use client";

import {
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { addRoomAction, updateRoomAction, addFurnitureAction } from "@/modules/house/actions";
import type { FurnitureCategory } from "@/modules/house/types";
import type { RoomFormValues } from "./room-form";
import type { OpeningFormValues } from "./opening-form";
import type { FurnitureFormValues } from "./furniture-form";
import type { HouseSelection } from "./house-viewer";
import { FURNITURE_CATEGORY_MIME } from "./furniture-catalog";
import { downloadDataUrl } from "./download-file";
import {
  computePlanFootprint,
  computeOpeningSegment,
  normalizeRect,
  snapToGrid,
} from "./plan-2d-geometry";

const PADDING = 1.5; // meters of margin around the footprint, for dimension lines/labels
const MIN_ROOM_SIZE = 0.3; // meters — a drawn/resized rect smaller than this is ignored, not saved
const CLICK_THRESHOLD = 0.05; // meters of pointer movement below which a room pointerdown+up counts as a click, not a drag
const DIM_OFFSET = 0.5; // meters — how far outside the room a dimension line sits
const OPENING_COLORS: Record<string, string> = { door: "#8d5a3b", window: "#7fd8f0" };

/** Default size (meters) for a furniture item dropped from the catalog — a starting point, editable afterward like any other furniture. */
const FURNITURE_DEFAULT_SIZE: Record<
  FurnitureCategory,
  { width: number; depth: number; height: number }
> = {
  bed: { width: 2.0, depth: 1.6, height: 0.5 },
  sofa: { width: 1.8, depth: 0.9, height: 0.8 },
  table: { width: 1.2, depth: 0.8, height: 0.75 },
  chair: { width: 0.5, depth: 0.5, height: 0.9 },
  wardrobe: { width: 1.2, depth: 0.6, height: 2.0 },
  desk: { width: 1.2, depth: 0.6, height: 0.75 },
  tv_unit: { width: 1.5, depth: 0.4, height: 0.5 },
  other: { width: 0.6, depth: 0.6, height: 0.6 },
};

const FURNITURE_LABELS: Record<FurnitureCategory, string> = {
  bed: "Bed",
  sofa: "Sofa",
  table: "Table",
  chair: "Chair",
  wardrobe: "Wardrobe",
  desk: "Desk",
  tv_unit: "TV unit",
  other: "Other",
};

interface RoomEditableFields {
  id?: number;
  name: string;
  type: string;
  x: number;
  z: number;
  width: number;
  depth: number;
  wallHeight: number | null;
  color: string | null;
  material: string | null;
  notes: string | null;
}

/** Builds the exact FormData shape `roomSchema` (actions.ts) expects — this is a full replace, not a patch, so every field (including `notes`) must round-trip even when only x/z/width/depth actually changed. */
function roomFormData(floorId: number, room: RoomEditableFields): FormData {
  const fd = new FormData();
  if (room.id != null) fd.set("id", String(room.id));
  fd.set("floorId", String(floorId));
  fd.set("name", room.name);
  fd.set("type", room.type);
  fd.set("x", String(room.x));
  fd.set("z", String(room.z));
  fd.set("width", String(room.width));
  fd.set("depth", String(room.depth));
  if (room.wallHeight != null) fd.set("wallHeight", String(room.wallHeight));
  if (room.color) fd.set("color", room.color);
  if (room.material) fd.set("material", room.material);
  if (room.notes) fd.set("notes", room.notes);
  return fd;
}

function furnitureFormData(
  roomId: number,
  item: {
    name: string;
    category: string;
    x: number;
    z: number;
    width: number;
    depth: number;
    height: number;
  },
): FormData {
  const fd = new FormData();
  fd.set("roomId", String(roomId));
  fd.set("name", item.name);
  fd.set("category", item.category);
  fd.set("x", String(item.x));
  fd.set("z", String(item.z));
  fd.set("width", String(item.width));
  fd.set("depth", String(item.depth));
  fd.set("height", String(item.height));
  return fd;
}

/** The last room (in list order) whose rect contains the point — matches how overlapping rects would visually stack, back-to-front. */
function findRoomAt(
  rooms: { id: number; x: number; z: number; width: number; depth: number }[],
  x: number,
  y: number,
) {
  return [...rooms]
    .reverse()
    .find((r) => x >= r.x && x <= r.x + r.width && y >= r.z && y <= r.z + r.depth);
}

type DragState =
  | { kind: "draw"; start: [number, number]; current: [number, number] }
  | { kind: "move"; room: RoomFormValues; start: [number, number]; dx: number; dy: number }
  | { kind: "resize"; room: RoomFormValues; start: [number, number]; dx: number; dy: number };

/**
 * A top-down 2D CAD-style plan of one floor — SVG, in meters directly (the
 * `viewBox` is in plan units, so no pixel/meter scale factor to track).
 * `vectorEffect="non-scaling-stroke"` keeps stroke widths visually constant
 * regardless of a room's size. Supports drawing a brand-new room by
 * click-dragging empty canvas, and moving/resizing an existing room by
 * dragging its body/corner handle — both commit through the same
 * `addRoomAction`/`updateRoomAction` Server Actions the room form uses,
 * called directly (bypassing `useActionState`) since there's no form here.
 * A plain click (no drag) on a room opens its edit dialog, same as clicking
 * its wall in the 3D view — see `HouseSelection`.
 */
export function FloorPlan2D({
  floorId,
  floorName,
  rooms,
  openingsByRoom,
  furnitureByRoom,
  onSelect,
}: {
  floorId: number;
  floorName?: string;
  rooms: RoomFormValues[];
  openingsByRoom: Record<number, OpeningFormValues[]>;
  furnitureByRoom: Record<number, FurnitureFormValues[]>;
  onSelect?: (selection: HouseSelection) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<DragState | null>(null);

  function handleExport() {
    const svg = svgRef.current;
    if (!svg) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const serialized = new XMLSerializer().serializeToString(clone);
    downloadDataUrl(
      `data:image/svg+xml;charset=utf-8,${encodeURIComponent(serialized)}`,
      `${floorName ?? `floor-${floorId}`}-plan.svg`,
    );
  }

  const footprint = useMemo(
    () =>
      computePlanFootprint(rooms.map((r) => ({ x: r.x, z: r.z, width: r.width, depth: r.depth }))),
    [rooms],
  );
  const view = footprint
    ? {
        minX: footprint.minX - PADDING,
        minY: footprint.minY - PADDING,
        width: footprint.maxX - footprint.minX + PADDING * 2,
        height: footprint.maxY - footprint.minY + PADDING * 2,
      }
    : { minX: -PADDING, minY: -PADDING, width: 6, height: 6 };

  function toSvgPoint(clientX: number, clientY: number): [number, number] {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return [0, 0];
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const transformed = pt.matrixTransform(ctm.inverse());
    return [transformed.x, transformed.y];
  }

  function handleBackgroundPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toSvgPoint(e.clientX, e.clientY);
    setDrag({ kind: "draw", start: p, current: p });
  }

  function handleRoomPointerDown(e: ReactPointerEvent<SVGRectElement>, room: RoomFormValues) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: "move", room, start: toSvgPoint(e.clientX, e.clientY), dx: 0, dy: 0 });
  }

  function handleResizePointerDown(e: ReactPointerEvent<SVGCircleElement>, room: RoomFormValues) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ kind: "resize", room, start: toSvgPoint(e.clientX, e.clientY), dx: 0, dy: 0 });
  }

  function handlePointerMove(e: ReactPointerEvent<SVGSVGElement>) {
    if (!drag) return;
    const [x, y] = toSvgPoint(e.clientX, e.clientY);
    if (drag.kind === "draw") setDrag({ ...drag, current: [x, y] });
    else setDrag({ ...drag, dx: x - drag.start[0], dy: y - drag.start[1] });
  }

  async function handlePointerUp() {
    if (!drag) return;
    const finished = drag;
    setDrag(null);

    if (finished.kind === "draw") {
      const rect = normalizeRect(
        finished.start[0],
        finished.start[1],
        finished.current[0],
        finished.current[1],
      );
      if (rect.width < MIN_ROOM_SIZE || rect.height < MIN_ROOM_SIZE) return; // stray click on empty canvas, not a real draw
      const result = await addRoomAction(
        {},
        roomFormData(floorId, {
          name: "New room",
          type: "other",
          x: snapToGrid(rect.x),
          z: snapToGrid(rect.y),
          width: snapToGrid(rect.width),
          depth: snapToGrid(rect.height),
          wallHeight: null,
          color: null,
          material: null,
          notes: null,
        }),
      );
      if (result.id) onSelect?.({ kind: "room", id: result.id });
      return;
    }

    const moved =
      Math.abs(finished.dx) > CLICK_THRESHOLD || Math.abs(finished.dy) > CLICK_THRESHOLD;
    if (!moved) {
      onSelect?.({ kind: "room", id: finished.room.id });
      return;
    }

    if (finished.kind === "move") {
      await updateRoomAction(
        {},
        roomFormData(floorId, {
          ...finished.room,
          x: snapToGrid(finished.room.x + finished.dx),
          z: snapToGrid(finished.room.z + finished.dy),
        }),
      );
    } else {
      await updateRoomAction(
        {},
        roomFormData(floorId, {
          ...finished.room,
          width: snapToGrid(Math.max(finished.room.width + finished.dx, MIN_ROOM_SIZE)),
          depth: snapToGrid(Math.max(finished.room.depth + finished.dy, MIN_ROOM_SIZE)),
        }),
      );
    }
  }

  async function handleCatalogDrop(e: ReactDragEvent<SVGSVGElement>) {
    const category = e.dataTransfer.getData(FURNITURE_CATEGORY_MIME) as FurnitureCategory | "";
    if (!category) return;
    e.preventDefault();

    const [x, y] = toSvgPoint(e.clientX, e.clientY);
    const room = findRoomAt(rooms, x, y);
    if (!room) return; // dropped outside any room — furniture must belong to one

    const size = FURNITURE_DEFAULT_SIZE[category];
    // Room-relative, clamped so the item's box stays inside the room it landed in.
    const relX = Math.min(
      Math.max(x - room.x - size.width / 2, 0),
      Math.max(room.width - size.width, 0),
    );
    const relZ = Math.min(
      Math.max(y - room.z - size.depth / 2, 0),
      Math.max(room.depth - size.depth, 0),
    );

    const result = await addFurnitureAction(
      {},
      furnitureFormData(room.id, {
        name: FURNITURE_LABELS[category],
        category,
        x: snapToGrid(relX),
        z: snapToGrid(relZ),
        ...size,
      }),
    );
    if (result.id) onSelect?.({ kind: "furniture", id: result.id });
  }

  /** The in-progress drag applied on top of a room's saved position/size, so the rect follows the pointer before the server round trip lands. */
  function liveRoom(room: RoomFormValues): RoomFormValues {
    if (drag?.kind === "move" && drag.room.id === room.id)
      return { ...room, x: room.x + drag.dx, z: room.z + drag.dy };
    if (drag?.kind === "resize" && drag.room.id === room.id) {
      return {
        ...room,
        width: Math.max(room.width + drag.dx, MIN_ROOM_SIZE),
        depth: Math.max(room.depth + drag.dy, MIN_ROOM_SIZE),
      };
    }
    return room;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleExport}
          className="border-input bg-background text-foreground rounded-md border px-3 py-1 text-sm"
        >
          Export SVG
        </button>
      </div>
      <div className="h-120 w-full touch-none overflow-hidden rounded-xl ring-1 ring-foreground/10">
        <svg
          ref={svgRef}
          viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
          className="h-full w-full bg-background"
          onPointerDown={handleBackgroundPointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleCatalogDrop}
        >
          {rooms.map((room) => {
            const r = liveRoom(room);
            return (
              <g key={room.id}>
                <rect
                  x={r.x}
                  y={r.z}
                  width={r.width}
                  height={r.depth}
                  fill={r.color ?? "#d4d4d8"}
                  fillOpacity={0.35}
                  stroke="currentColor"
                  strokeWidth={0.05}
                  vectorEffect="non-scaling-stroke"
                  className="text-foreground cursor-move"
                  onPointerDown={(e) => handleRoomPointerDown(e, room)}
                />
                <text
                  x={r.x + r.width / 2}
                  y={r.z + r.depth / 2}
                  fontSize={0.22}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="fill-foreground pointer-events-none"
                >
                  {room.name}
                </text>
                <DimensionLine
                  x1={r.x}
                  y1={r.z - DIM_OFFSET}
                  x2={r.x + r.width}
                  y2={r.z - DIM_OFFSET}
                  label={`${r.width.toFixed(2)}m`}
                />
                <DimensionLine
                  x1={r.x - DIM_OFFSET}
                  y1={r.z}
                  x2={r.x - DIM_OFFSET}
                  y2={r.z + r.depth}
                  label={`${r.depth.toFixed(2)}m`}
                />
                {(openingsByRoom[room.id] ?? []).map((opening) => {
                  const seg = computeOpeningSegment(r, opening);
                  return (
                    <line
                      key={opening.id}
                      x1={seg.x1}
                      y1={seg.y1}
                      x2={seg.x2}
                      y2={seg.y2}
                      stroke={OPENING_COLORS[opening.type] ?? "#999"}
                      strokeWidth={0.08}
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                  );
                })}
                {(furnitureByRoom[room.id] ?? []).map((item) => (
                  <g
                    key={item.id}
                    className="cursor-pointer"
                    onPointerDown={(e) => {
                      e.stopPropagation();
                      onSelect?.({ kind: "furniture", id: item.id });
                    }}
                  >
                    <rect
                      x={r.x + item.x}
                      y={r.z + item.z}
                      width={item.width}
                      height={item.depth}
                      fill={item.color ?? "#71717a"}
                      fillOpacity={0.6}
                      stroke="currentColor"
                      strokeWidth={0.02}
                      vectorEffect="non-scaling-stroke"
                      className="text-foreground"
                    />
                  </g>
                ))}
                <circle
                  cx={r.x + r.width}
                  cy={r.z + r.depth}
                  r={0.12}
                  className="fill-background stroke-foreground cursor-nwse-resize"
                  strokeWidth={0.04}
                  vectorEffect="non-scaling-stroke"
                  onPointerDown={(e) => handleResizePointerDown(e, room)}
                />
              </g>
            );
          })}
          {drag?.kind === "draw" && (
            <rect
              {...normalizeRect(drag.start[0], drag.start[1], drag.current[0], drag.current[1])}
              fill="none"
              stroke="currentColor"
              strokeDasharray="0.1 0.1"
              strokeWidth={0.04}
              vectorEffect="non-scaling-stroke"
              className="text-foreground pointer-events-none"
            />
          )}
        </svg>
      </div>
    </div>
  );
}

function DimensionLine({
  x1,
  y1,
  x2,
  y2,
  label,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
}) {
  const midX = (x1 + x2) / 2;
  const midY = (y1 + y2) / 2;
  const tick = 0.08;
  const vertical = x1 === x2;

  return (
    <g
      className="text-muted-foreground pointer-events-none"
      stroke="currentColor"
      strokeWidth={0.02}
      vectorEffect="non-scaling-stroke"
    >
      <line x1={x1} y1={y1} x2={x2} y2={y2} />
      <line
        x1={x1 - (vertical ? tick : 0)}
        y1={y1 - (vertical ? 0 : tick)}
        x2={x1 + (vertical ? tick : 0)}
        y2={y1 + (vertical ? 0 : tick)}
      />
      <line
        x1={x2 - (vertical ? tick : 0)}
        y1={y2 - (vertical ? 0 : tick)}
        x2={x2 + (vertical ? tick : 0)}
        y2={y2 + (vertical ? 0 : tick)}
      />
      <text
        x={midX}
        y={midY}
        fontSize={0.16}
        textAnchor="middle"
        stroke="none"
        className="fill-muted-foreground"
        transform={vertical ? `rotate(-90 ${midX} ${midY})` : undefined}
      >
        {label}
      </text>
    </g>
  );
}
