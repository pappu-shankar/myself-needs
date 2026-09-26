/** Public surface — the only thing other modules/app routes may import from `fashion`. */
export { getPhotos, getPhoto, getPhotoFileBytes } from "./service/photos";
export { getOutfitsForPhoto, getOutfit } from "./service/outfits";
export { getGarments, getGarment, getGarmentFileBytes } from "./service/garments";
export { getPhysiqueForPhoto } from "./service/physiques";
export {
  uploadPhotoAction,
  type UploadPhotoState,
  updateSkinToneAction,
  type UpdateSkinToneState,
  saveOutfitAction,
  type SaveOutfitState,
  deleteOutfitAction,
  type DeleteOutfitState,
  uploadGarmentAction,
  type UploadGarmentState,
  deleteGarmentAction,
  type DeleteGarmentState,
  savePhysiqueAction,
  type SavePhysiqueState,
} from "./actions";
export * from "./types";
