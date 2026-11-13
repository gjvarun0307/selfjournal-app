/** Fixed tab route files in src/app/(tabs). Adding a tab means appending here and adding `<route>.tsx`. */
export const TAB_ROUTES = ["index", "habits", "recovery", "me"] as const;

export type TabRoute = (typeof TAB_ROUTES)[number];
