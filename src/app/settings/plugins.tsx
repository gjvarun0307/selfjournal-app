import { useHost } from "@/core/app-provider";
import { PluginsScreen } from "@/screens/settings/plugins";

export default function PluginsRoute() {
  return <PluginsScreen host={useHost()} />;
}
