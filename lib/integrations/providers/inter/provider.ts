import { parseInterCheckingCsv, matchesInterCheckingHeader } from "../../sources/inter/checking-parser";
import type {
  ImportIntegrationProvider,
  ImportSourceProvider,
} from "../types";

export const interCheckingImportProvider: ImportSourceProvider = {
  source: "inter_checking",
  providerId: "inter",
  requiresCardAccount: false,
  matches: matchesInterCheckingHeader,
  parse: (input) => parseInterCheckingCsv(input.content),
};

/** Inter integration: checking CSV today; card remains catalog-planned. */
export const interImportIntegration: ImportIntegrationProvider = {
  id: "inter",
  layouts: [interCheckingImportProvider],
};
