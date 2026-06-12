// VAT helpers — UK convention: displayed prices are gross (VAT-inclusive).
// All amounts are in INTEGER pence.
//
//   gross = net + vat
//   vat   = gross * rate / (100 + rate)
//   net   = gross - vat
//
// We round VAT half-away-from-zero (Math.round on positive integers, which
// matches HMRC's accepted "rounding to the nearest penny" rule for invoice
// totals). Net is then derived as gross - vat to guarantee the three values
// reconcile exactly even after rounding.

export interface VatBreakdown {
  gross: number;
  vat: number;
  net: number;
}

export function calcVatFromGross(grossPence: number, vatRatePct: number): VatBreakdown {
  if (!Number.isFinite(grossPence) || grossPence <= 0) {
    return { gross: 0, vat: 0, net: 0 };
  }
  if (!Number.isFinite(vatRatePct) || vatRatePct <= 0) {
    return { gross: grossPence, vat: 0, net: grossPence };
  }
  const vat = Math.round((grossPence * vatRatePct) / (100 + vatRatePct));
  return { gross: grossPence, vat, net: grossPence - vat };
}

export function calcVatFromNet(netPence: number, vatRatePct: number): VatBreakdown {
  if (!Number.isFinite(netPence) || netPence <= 0) {
    return { gross: 0, vat: 0, net: 0 };
  }
  if (!Number.isFinite(vatRatePct) || vatRatePct <= 0) {
    return { gross: netPence, vat: 0, net: netPence };
  }
  const vat = Math.round((netPence * vatRatePct) / 100);
  return { gross: netPence + vat, vat, net: netPence };
}

// Defensive parser for the `vat_registered` setting value. Anything other
// than the literal '1' is treated as "not registered".
export function isVatRegistered(value: string | null | undefined): boolean {
  return value === '1';
}

// Defensive parser for the `vat_rate` setting value. Returns 0 for missing /
// invalid values so VAT auto-calc cleanly degrades to "no VAT".
export function parseVatRate(value: string | null | undefined): number {
  if (!value) return 0;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0 || n > 100) return 0;
  return n;
}
