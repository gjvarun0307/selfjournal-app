import { useColorScheme } from "react-native";

import { tokens, type ColorTokens } from "./tokens";

export type Theme = {
  colors: ColorTokens;
  space: typeof tokens.space;
  radius: typeof tokens.radius;
  font: typeof tokens.font;
  scheme: "light" | "dark";
};

export function useTheme(): Theme {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return {
    colors: tokens[scheme],
    space: tokens.space,
    radius: tokens.radius,
    font: tokens.font,
    scheme,
  };
}
