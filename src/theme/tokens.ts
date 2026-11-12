export type ColorTokens = {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textMuted: string;
  accent: string;
  accentText: string;
  border: string;
  positive: string;
  caution: string;
};

// Warm paper / ink palettes. Deliberately no red "danger" colour.
const light: ColorTokens = {
  background: "#FAF5EA",
  surface: "#FFFDF8",
  surfaceAlt: "#F1E9D8",
  text: "#2E2A24",
  textMuted: "#6B6358",
  accent: "#4A5A9C",
  accentText: "#FFFFFF",
  border: "#DDD3BE",
  positive: "#5B8A5A",
  caution: "#C48A1E",
};

const dark: ColorTokens = {
  background: "#1F1C18",
  surface: "#29251F",
  surfaceAlt: "#332E26",
  text: "#F1EAD9",
  textMuted: "#B3A998",
  accent: "#A9B6F0",
  accentText: "#1F1C18",
  border: "#4A4337",
  positive: "#8DBB8A",
  caution: "#E0B04A",
};

export const tokens = {
  light,
  dark,
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  radius: { sm: 6, md: 12, lg: 20, pill: 999 },
  font: { body: 16, small: 13, title: 22, heading: 28 },
} as const;
