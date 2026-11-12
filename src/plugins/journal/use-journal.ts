import { useHost, usePluginContext } from "@/core/app-provider";

import { getJournalService, type JournalService } from "./journal-service";

export function useJournal(): JournalService {
  const ctx = usePluginContext("journal");
  const host = useHost();
  return getJournalService(ctx, (id) => host.entryType(id));
}
