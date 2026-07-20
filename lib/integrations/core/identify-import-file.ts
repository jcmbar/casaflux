import {
  resolveImportSourceProvider,
} from "../providers/registry";
import {
  getImportLayoutBySource,
  getImportProviderBySource,
  getSupportedImportBankSummaries,
  getSupportedImportFileTip,
  getUnsupportedImportFileMessage,
} from "../catalog/import-integrations";
import {
  BRADESCO_UNTRUSTED_IMPORT_MESSAGE,
  looksLikeUntrustedBradescoChecking,
} from "../sources/bradesco/checking-parser";
import type { ImportSource } from "../types";
import type { ImportProviderId } from "../catalog/import-integrations";

/** @deprecated Prefer getSupportedImportBankSummaries from the catalog. */
export const SUPPORTED_IMPORT_BANKS = getSupportedImportBankSummaries();

export const UNSUPPORTED_IMPORT_FILE_MESSAGE =
  getUnsupportedImportFileMessage();

export const SUPPORTED_IMPORT_FILE_TIP = getSupportedImportFileTip();

export type IdentifiedImportFile =
  | {
      status: "supported";
      canContinue: true;
      source: ImportSource;
      institutionId: ImportProviderId;
      institutionName: string;
      layoutLabel: string;
      headline: string;
    }
  | {
      status: "unsupported";
      canContinue: false;
      source: null;
      institutionId: null;
      institutionName: null;
      layoutLabel: null;
      headline: string;
      message: string;
      tip: string;
    };

function unsupportedFile(): IdentifiedImportFile {
  return {
    status: "unsupported",
    canContinue: false,
    source: null,
    institutionId: null,
    institutionName: null,
    layoutLabel: null,
    headline: "Arquivo ainda não compatível",
    message: getUnsupportedImportFileMessage(),
    tip: getSupportedImportFileTip(),
  };
}

function untrustedBradescoFile(): IdentifiedImportFile {
  return {
    status: "unsupported",
    canContinue: false,
    source: null,
    institutionId: null,
    institutionName: null,
    layoutLabel: null,
    headline: "Arquivo do Bradesco ainda não confiável",
    message: BRADESCO_UNTRUSTED_IMPORT_MESSAGE,
    tip: getSupportedImportFileTip(),
  };
}

/**
 * Identifies the bank/layout of a selected CSV before import continues.
 * Requires both a registered runtime provider and catalog-supported status.
 */
export function identifyImportFile(content: string): IdentifiedImportFile {
  const runtimeProvider = resolveImportSourceProvider(content);

  if (!runtimeProvider) {
    if (looksLikeUntrustedBradescoChecking(content)) {
      return untrustedBradescoFile();
    }
    return unsupportedFile();
  }

  const layout = getImportLayoutBySource(runtimeProvider.source);
  const provider = getImportProviderBySource(runtimeProvider.source);

  if (!layout || !provider) {
    return unsupportedFile();
  }

  return {
    status: "supported",
    canContinue: true,
    source: runtimeProvider.source,
    institutionId: provider.id,
    institutionName: provider.name,
    layoutLabel: layout.label,
    headline: `Arquivo identificado: ${provider.name}`,
  };
}
