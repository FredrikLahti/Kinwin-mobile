// Extracted so the digit-normalization that feeds app/create/consequence.tsx's
// stake field can be tested directly. Strips everything but digits, then
// strips leading zeros (keeping a single bare "0" as typed, so a fresh tap
// on "0" doesn't just vanish) before truncating to maxLength — without the
// leading-zero strip, typing "0" then "7" then "5" left the field
// permanently showing "075" while the derived numeric stake used everywhere
// else (Review, Share) correctly read 75, a real, visible mismatch between
// this field and the rest of the flow.
export function normalizeStakeDigits(rawValue: string, maxLength: number): string {
  return rawValue.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, maxLength);
}
