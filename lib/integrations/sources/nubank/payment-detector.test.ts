import { describe, expect, it } from "vitest";

import {
  isNubankEarlyPaymentDiscount,
  isNubankInvoicePayment,
  isNubankRenegotiationPackageLine,
  shouldExcludeFromNubankCardStatementTotal,
} from "./payment-detector";

describe("nubank payment-detector statement-total helpers", () => {
  it("detects invoice payments by exact title", () => {
    expect(isNubankInvoicePayment("Pagamento recebido")).toBe(true);
    expect(isNubankInvoicePayment("Pagamento recebido ")).toBe(true);
    expect(isNubankInvoicePayment("Estorno de pagamento")).toBe(false);
  });

  it("detects renegotiation package lines on both sides", () => {
    expect(
      isNubankRenegotiationPackageLine(
        "Renegociação de pendências (02/Abril)",
      ),
    ).toBe(true);
    expect(
      isNubankRenegotiationPackageLine(
        "Renegociação de pendências (02/Abril) - 1/5",
      ),
    ).toBe(true);
    expect(isNubankRenegotiationPackageLine("Saldo em atraso")).toBe(true);
    expect(isNubankRenegotiationPackageLine("Juros de atraso")).toBe(false);
  });

  it("detects early PIX payment discounts", () => {
    expect(
      isNubankEarlyPaymentDiscount(
        "Desconto de antecipação de pagamento de pix (Jeniffer Calmon Muniz Calvo)",
      ),
    ).toBe(true);
    expect(
      isNubankEarlyPaymentDiscount("Estorno de juros de rotativo"),
    ).toBe(false);
  });

  it("no longer excludes lines via the deprecated helper (typed breakdown owns totals)", () => {
    expect(
      shouldExcludeFromNubankCardStatementTotal(
        "Renegociação de pendências (02/Abril)",
      ),
    ).toBe(false);
    expect(
      shouldExcludeFromNubankCardStatementTotal("Saldo em atraso"),
    ).toBe(false);
    expect(
      shouldExcludeFromNubankCardStatementTotal(
        "Desconto de antecipação de pagamento de pix (Jeniffer)",
      ),
    ).toBe(false);
  });
});
