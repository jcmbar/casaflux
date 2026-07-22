/** Mini-resumo exibido na barra fixa de commit (mobile). */
export function formatImportMobileCommitSummary({
  totalRows,
  paymentCount,
}: {
  totalRows: number;
  paymentCount: number;
}): string {
  const rowsLabel = `${totalRows} lançamento${totalRows === 1 ? "" : "s"}`;
  if (paymentCount <= 0) {
    return rowsLabel;
  }

  return `${rowsLabel} · ${paymentCount} pagamento${
    paymentCount === 1 ? "" : "s"
  } de fatura`;
}
