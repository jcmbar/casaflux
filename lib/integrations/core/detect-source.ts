/**
 * Re-export detection through the provider registry.
 * Call sites keep importing from core/detect-source.
 */
export { detectImportSource } from "../providers/registry";
