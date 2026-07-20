import {
  matchesBradescoCheckingHeader,
  parseBradescoCheckingCsv,
} from "../../sources/bradesco/checking-parser";
import type {
  ImportIntegrationProvider,
  ImportSourceProvider,
} from "../types";

export const bradescoCheckingImportProvider: ImportSourceProvider = {
  source: "bradesco_checking",
  providerId: "bradesco",
  requiresCardAccount: false,
  matches: matchesBradescoCheckingHeader,
  parse: (input) => parseBradescoCheckingCsv(input.content),
};

/** Bradesco integration: checking CSV today; card remains catalog-planned. */
export const bradescoImportIntegration: ImportIntegrationProvider = {
  id: "bradesco",
  layouts: [bradescoCheckingImportProvider],
};
