/** Public surface — the only thing other modules/app routes may import from `house`. */
export { getProjects, getProject, createProject, updateProject } from "./service/projects";
export { getFloorsForProject, getFloor, createFloor, updateFloor } from "./service/floors";
export { getRoomsForFloor, getRoom, createRoom, updateRoom } from "./service/rooms";
export { getOpeningsForRoom, getOpening, createOpening, updateOpening } from "./service/openings";
export { getStairsForProject, getStair, createStair, updateStair } from "./service/stairs";
export { getFixturesForFloor, getFixture, createFixture, updateFixture } from "./service/fixtures";
export {
  getWallStylesForRoom,
  getWallStyle,
  createWallStyle,
  updateWallStyle,
} from "./service/wall-styles";
export {
  getFurnitureForRoom,
  getFurnitureItem,
  createFurniture,
  updateFurniture,
} from "./service/furniture";
export {
  getLightFixturesForRoom,
  getLightFixture,
  createLightFixture,
  updateLightFixture,
} from "./service/light-fixtures";
export {
  getHouseModel,
  type HouseModel,
  type FloorModel,
  type RoomModel,
  type OpeningModel,
  type StairModel,
  type FixtureModel,
  type WallStyleModel,
  type FurnitureModel,
  type LightFixtureModel,
  type Footprint,
} from "./service/model";
export { searchHouse } from "./service/search";
export {
  addProjectAction,
  type AddProjectState,
  updateProjectAction,
  addFloorAction,
  type AddFloorState,
  updateFloorAction,
  addRoomAction,
  type AddRoomState,
  updateRoomAction,
  addOpeningAction,
  type AddOpeningState,
  updateOpeningAction,
  addStairAction,
  type AddStairState,
  updateStairAction,
  addFixtureAction,
  type AddFixtureState,
  updateFixtureAction,
  addWallStyleAction,
  type AddWallStyleState,
  updateWallStyleAction,
  addFurnitureAction,
  type AddFurnitureState,
  updateFurnitureAction,
  addLightFixtureAction,
  type AddLightFixtureState,
  updateLightFixtureAction,
} from "./actions";
export * from "./types";
