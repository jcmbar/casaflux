import { isSupportedImportSource } from "../catalog/import-integrations";
import { bradescoImportIntegration } from "./bradesco/provider";
import { interImportIntegration } from "./inter/provider";
import { nubankImportIntegration } from "./nubank/provider";
import type {
  ImportIntegrationProvider,
  ImportSourceProvider,
} from "./types";
import type { ImportSource } from "../types";

/**
 * Registered runtime providers. Planned catalog banks without an entry here
 * never match files and cannot unlock preview/commit.
 */
const REGISTERED_INTEGRATIONS: readonly ImportIntegrationProvider[] = [
  nubankImportIntegration,
  interImportIntegration,
  bradescoImportIntegration,
];

export function getRegisteredImportIntegrations(): readonly ImportIntegrationProvider[] {
  return REGISTERED_INTEGRATIONS;
}

export function getRegisteredImportSourceProviders(): ImportSourceProvider[] {
  return REGISTERED_INTEGRATIONS.flatMap((integration) => [...integration.layouts]);
}

export function getImportSourceProvider(
  source: ImportSource,
): ImportSourceProvider | null {
  return (
    getRegisteredImportSourceProviders().find(
      (provider) => provider.source === source,
    ) ?? null
  );
}

/**
 * Resolves the first registered layout that matches the CSV content and is
 * marked supported in the catalog. Planned / unregistered banks never win.
 */
export function resolveImportSourceProvider(
  content: string,
): ImportSourceProvider | null {
  for (const provider of getRegisteredImportSourceProviders()) {
    if (!provider.matches(content)) continue;
    if (!isSupportedImportSource(provider.source)) continue;
    return provider;
  }
  return null;
}

/** Detects ImportSource via registered providers (catalog-gated). */
export function detectImportSource(content: string): ImportSource | null {
  return resolveImportSourceProvider(content)?.source ?? null;
}

export function hasImportSourceProvider(
  source: ImportSource | null | undefined,
): boolean {
  if (!source) return false;
  return getImportSourceProvider(source) != null;
}
