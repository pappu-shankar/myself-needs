import {
  insertInsurancePolicy,
  listInsurancePolicies,
  type NewInsurancePolicy,
} from "../../db/queries/domain/insurance";

export function createInsurancePolicy(entry: NewInsurancePolicy) {
  return insertInsurancePolicy(entry);
}

export function getInsurancePolicies() {
  return listInsurancePolicies();
}
