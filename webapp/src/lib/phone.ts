// =============================================================
// PHONE NORMALIZATION — webapp/src/lib/phone.ts
// =============================================================
export function toE164(countryCode: string, national: string) {
const cleaned = national.replace(/\D/g, "");
const cc = countryCode.replace(/\D/g, "");
return `+${cc}${cleaned}`;
}
