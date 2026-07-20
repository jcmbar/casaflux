const INSTALLMENT_PATTERN = /\s*-\s*parcela\s+\d+\/\d+/gi;

const GENERIC_PREFIXES = [
  /^estorno\s*-\s*/i,
  /^compra no debito\s*-\s*/i,
  /^compra no débito\s*-\s*/i,
  /^transferencia enviada(?: pelo pix)?\s*-\s*/i,
  /^transferência enviada(?: pelo pix)?\s*-\s*/i,
  /^transferencia recebida(?: pelo pix)?\s*-\s*/i,
  /^transferência recebida(?: pelo pix)?\s*-\s*/i,
  /^transferencia recebida\s*-\s*/i,
  /^transferência recebida\s*-\s*/i,
];

export function normalizeImportDescription(description: string): string {
  return description
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeMerchant(description: string): string {
  let value = normalizeImportDescription(description);
  value = value.replace(INSTALLMENT_PATTERN, "");
  value = value.replace(/\s*-\s*parcela\s+\d+\/\d+/gi, "");

  for (const pattern of GENERIC_PREFIXES) {
    value = value.replace(pattern, "");
  }

  value = value.replace(/\*/g, " ");
  value = value.replace(/[^a-z0-9\s]/g, " ");
  value = value.replace(/\s+/g, " ").trim();

  return value;
}

export type NormalizedImportText = {
  originalDescription: string;
  normalizedDescription: string;
  normalizedMerchant: string;
};

export function normalizeImportText(description: string): NormalizedImportText {
  return {
    originalDescription: description,
    normalizedDescription: normalizeImportDescription(description),
    normalizedMerchant: normalizeMerchant(description),
  };
}
