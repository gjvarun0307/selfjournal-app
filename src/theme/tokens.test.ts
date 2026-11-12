import { tokens } from "./tokens";

function hueOf(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("design tokens", () => {
  it("light and dark define the same keys and no red-family accent", () => {
    expect(Object.keys(tokens.dark).sort()).toEqual(Object.keys(tokens.light).sort());
    expect(Object.keys(tokens.light)).not.toContain("danger");
    for (const scheme of [tokens.light, tokens.dark]) {
      const hue = hueOf(scheme.caution);
      expect(hue > 15 && hue < 345).toBe(true);
    }
  });

  it("keeps text comfortably readable in both schemes", () => {
    for (const c of [tokens.light, tokens.dark]) {
      expect(contrast(c.text, c.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(c.accentText, c.accent)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
