import {
  insertSchemeTemplate,
  listSchemeTemplates,
  type NewSchemeTemplate,
} from "../../db/queries/domain/scheme-templates";

export function getSchemeTemplates() {
  return listSchemeTemplates();
}

export function createSchemeTemplate(entry: NewSchemeTemplate) {
  return insertSchemeTemplate(entry);
}
