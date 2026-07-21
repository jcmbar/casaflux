import { resolveImportRowTransactionType } from "./category-suggester";
import { isImportRowCategorizable } from "./import-category-review";
import {
  normalizeImportDescription,
  normalizeMerchant,
} from "./normalize-merchant";
import type { ImportPreviewRow } from "../types";

export type ImportCategorySimilarityKind =
  | "strong_prefix"
  | "semantic_pattern"
  | "exact_merchant"
  | "cleaned_description";

export type ImportCategorySimilarityStrength = "high" | "medium" | "low";

export type ImportCategorySimilaritySignature = {
  key: string;
  kind: ImportCategorySimilarityKind;
  label: string;
  reason: string;
  strength: ImportCategorySimilarityStrength;
};

/** Known card/acquiring prefixes that stay stable while the rest of the title varies. */
export const KNOWN_STRONG_MERCHANT_PREFIXES = [
  "ifd",
  "ifood",
  "uber",
  "ubrt",
  "rappi",
  "ebn",
  "mp",
  "pagbank",
  "stone",
  "ton",
] as const;

type SemanticPattern = {
  id: string;
  label: string;
  match: RegExp;
};

const SEMANTIC_BANK_PATTERNS: SemanticPattern[] = [
  {
    id: "transferencia_recebida",
    label: "transferência recebida",
    match: /^transferencia recebida(?: pelo pix)?\b/,
  },
  {
    id: "transferencia_enviada",
    label: "transferência enviada",
    match: /^transferencia enviada(?: pelo pix)?\b/,
  },
  {
    id: "pix_recebido",
    label: "pix recebido",
    match: /^pix recebido\b/,
  },
  {
    id: "pix_enviado",
    label: "pix enviado",
    match: /^pix enviado\b/,
  },
  {
    id: "debito_automatico",
    label: "débito automático",
    match: /^debito automatico\b/,
  },
];

const DOCUMENT_PATTERN =
  /\b\d{2,3}[.\s]?\d{3}[.\s]?\d{3}[\/.\s-]?\d{2,4}[-.\s]?\d{0,2}\b/g;
const LONG_NUMBER_PATTERN = /\b\d{4,}\b/g;
const MIXED_ID_TOKEN_PATTERN = /\b\d+[a-z]+\d*\b|\b[a-z]*\d{3,}[a-z]*\b/g;

export function detectStrongMerchantPrefix(description: string): string | null {
  const normalized = normalizeImportDescription(description);

  const attachedMatch = normalized.match(/^([a-z]{2,})\s*\*/);
  if (attachedMatch?.[1]) {
    return attachedMatch[1];
  }

  const spacedMatch = normalized.match(/\b([a-z]{2,})\s+\*/);
  if (spacedMatch?.[1]) {
    return spacedMatch[1];
  }

  for (const prefix of KNOWN_STRONG_MERCHANT_PREFIXES) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const knownMatch = normalized.match(
      new RegExp(`^${escaped}(?=[\\s*\\d]|$)`),
    );
    if (knownMatch) {
      return prefix;
    }
  }

  return null;
}

export function detectSemanticBankPattern(
  description: string,
): { id: string; label: string } | null {
  const normalized = normalizeImportDescription(description);

  for (const pattern of SEMANTIC_BANK_PATTERNS) {
    if (pattern.match.test(normalized)) {
      return { id: pattern.id, label: pattern.label };
    }
  }

  return null;
}

/**
 * Strip documents, long numeric ids and leftover punctuation so variable
 * person/doc fragments do not dominate weak signatures.
 */
export function cleanDescriptionForSimilarity(description: string): string {
  let value = normalizeImportDescription(description);
  value = value.replace(DOCUMENT_PATTERN, " ");
  value = value.replace(LONG_NUMBER_PATTERN, " ");
  value = value.replace(MIXED_ID_TOKEN_PATTERN, " ");
  value = value.replace(/\*/g, " ");
  value = value.replace(/[^a-z\s]/g, " ");
  value = value.replace(/\s+/g, " ").trim();
  return value;
}

export function formatImportCategorySimilarityReason(
  kind: ImportCategorySimilarityKind,
  label: string,
): string {
  switch (kind) {
    case "strong_prefix":
      return `Similar por prefixo forte: ${label.toUpperCase()}`;
    case "semantic_pattern":
      return `Similar por padrão: ${label}`;
    case "exact_merchant":
      return `Similar por merchant: ${label}`;
    case "cleaned_description":
      return `Similar por descrição: ${label}`;
  }
}

export function buildImportCategorySimilaritySignature(
  row: ImportPreviewRow,
): ImportCategorySimilaritySignature | null {
  if (!isImportRowCategorizable(row)) {
    return null;
  }

  const transactionType = resolveImportRowTransactionType(row);
  const strongPrefix = detectStrongMerchantPrefix(row.description);
  if (strongPrefix) {
    return {
      key: `${transactionType}:strong:${strongPrefix}`,
      kind: "strong_prefix",
      label: strongPrefix,
      reason: formatImportCategorySimilarityReason("strong_prefix", strongPrefix),
      strength: "high",
    };
  }

  const semantic = detectSemanticBankPattern(row.description);
  if (semantic) {
    return {
      key: `${transactionType}:semantic:${semantic.id}`,
      kind: "semantic_pattern",
      label: semantic.label,
      reason: formatImportCategorySimilarityReason(
        "semantic_pattern",
        semantic.label,
      ),
      strength: "high",
    };
  }

  const normalizedMerchant =
    row.normalizedMerchant ?? normalizeMerchant(row.description);
  if (normalizedMerchant.length >= 4) {
    return {
      key: `${transactionType}:merchant:${normalizedMerchant}`,
      kind: "exact_merchant",
      label: normalizedMerchant,
      reason: formatImportCategorySimilarityReason(
        "exact_merchant",
        normalizedMerchant,
      ),
      strength: "medium",
    };
  }

  const cleaned = cleanDescriptionForSimilarity(row.description);
  if (cleaned.length >= 6) {
    return {
      key: `${transactionType}:cleaned:${cleaned}`,
      kind: "cleaned_description",
      label: cleaned,
      reason: formatImportCategorySimilarityReason(
        "cleaned_description",
        cleaned,
      ),
      strength: "low",
    };
  }

  return null;
}
