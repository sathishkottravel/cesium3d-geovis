import { useEffect, useSyncExternalStore } from "react";
import { getNavigationService, type NavigationSnapshot } from "./NavigationService";

/** Current navigation data source and connection state; connects the saved source on first use. */
export function useNavigation(): NavigationSnapshot {
  const service = getNavigationService();
  const snapshot = useSyncExternalStore(service.subscribe, service.getSnapshot);
  useEffect(() => {
    void service.start();
  }, [service]);
  return snapshot;
}
