import Ionicons from "@expo/vector-icons/Ionicons";
import { Redirect, useSegments } from "expo-router";
import { Tabs } from "expo-router/js-tabs";

import { useEnabledPlugins } from "@/core/app-provider";
import { redirectTarget, tabRouteFromSegments, visibleTabs } from "@/core/plugins/tabs";
import { ALL_PLUGINS } from "@/plugins";
import { useTheme } from "@/theme/use-theme";

type IconName = keyof typeof Ionicons.glyphMap;

// Every tab route any plugin could show (plus Me), in display order. All are always declared;
// hidden ones get `href: null` so their routes exist but have no tab button.
const ALL_TABS = visibleTabs(
  ALL_PLUGINS,
  ALL_PLUGINS.map((p) => p.id),
);

export default function TabsLayout() {
  const { colors } = useTheme();
  const enabled = useEnabledPlugins();
  const visibleRoutes = visibleTabs(ALL_PLUGINS, enabled).map((t) => t.route);
  const visible = new Set(visibleRoutes);
  const segments = useSegments();

  // A hidden tab's route still resolves (cold start lands on "/" = Journal; or its plugin was just
  // turned off while open). Send the user to the first visible tab instead.
  const target = redirectTarget(tabRouteFromSegments(segments), visibleRoutes);
  if (target) return <Redirect href={target === "index" ? "/" : `/${target}`} />;

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.text,
        sceneStyle: { backgroundColor: colors.background },
      }}
    >
      {ALL_TABS.map((tab) => (
        <Tabs.Screen
          key={tab.route}
          name={tab.route}
          options={{
            title: tab.title,
            href: visible.has(tab.route) ? undefined : null,
            tabBarIcon: ({ color, size, focused }) => (
              <Ionicons
                name={(focused ? tab.icon : `${tab.icon}-outline`) as IconName}
                color={color as string}
                size={size}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
