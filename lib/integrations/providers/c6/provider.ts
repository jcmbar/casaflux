import {
  matchesC6CheckingHeader,
  parseC6CheckingCsv,
} from "../../sources/c6/checking-parser";
import type {
  ImportIntegrationProvider,
  ImportSourceProvider,
} from "../types";

export const c6CheckingImportProvider: ImportSourceProvider = {
  source: "c6_checking",
  providerId: "c6",
  requiresCardAccount: false,
  matches: matchesC6CheckingHeader,
  parse: (input) => parseC6CheckingCsv(input.content),
};

/** C6 Bank integration: checking CSV today. */
export const c6ImportIntegration: ImportIntegrationProvider = {
  id: "c6",
  layouts: [c6CheckingImportProvider],
};
