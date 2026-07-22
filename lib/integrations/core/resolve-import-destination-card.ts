/**
 * Resolve o cartão de destino na importação de fatura.
 * - 0 cartões → sem seleção
 * - 1 cartão → seleciona automaticamente
 * - 2+ → mantém a seleção atual se ainda for válida
 */
export function resolveImportDestinationCardAccountId({
  creditCardAccountIds,
  currentCardAccountId,
}: {
  creditCardAccountIds: string[];
  currentCardAccountId: string;
}): string {
  if (creditCardAccountIds.length === 0) {
    return "";
  }

  if (creditCardAccountIds.length === 1) {
    return creditCardAccountIds[0]!;
  }

  if (
    currentCardAccountId &&
    creditCardAccountIds.includes(currentCardAccountId)
  ) {
    return currentCardAccountId;
  }

  return "";
}
