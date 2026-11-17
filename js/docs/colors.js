// Colours for quotes and invoices: the company's colour is used for the header, and a darker shade of it where white text sits on it. Pure.
export const hexToRgb = (hex) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
  const n = m ? parseInt(m[1], 16) : 0x1f5f8b;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
/** Multiply a colour's brightness (factor under 1 darkens). Returns [r, g, b]. */
export const shadeRgb = (hex, factor) => hexToRgb(hex).map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
/** A darker version of a colour as hex without the #, for Word and Excel. */
export const shadeHex = (hex, factor = 0.55) => shadeRgb(hex, factor).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
/** Black or white text for a colour, as [r, g, b]. */
export const inkRgb = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? [17, 17, 17] : [255, 255, 255];
};
