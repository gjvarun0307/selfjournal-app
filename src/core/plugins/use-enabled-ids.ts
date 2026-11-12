import { useEffect, useState } from "react";

import type { PluginHost } from "./host";

/** The host's enabled plugin ids, re-rendering whenever a plugin is switched on or off. */
export function useEnabledIds(host: PluginHost): string[] {
  const [ids, setIds] = useState(() => host.enabledIds());
  useEffect(() => {
    const sync = () => setIds(host.enabledIds());
    sync(); // catch changes made between first render and subscribing
    return host.subscribe(sync);
  }, [host]);
  return ids;
}
