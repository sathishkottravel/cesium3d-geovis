import { appConfig, type AppConfig } from "../config/appConfig";
import { NavigationDataInterface } from "../navigation/NavigationDataInterface";
import { ApiTransport } from "../navigation/transports/ApiTransport";
import { MsfsTransport } from "../navigation/transports/MsfsTransport";
import { StandaloneTransport } from "../navigation/transports/StandaloneTransport";
import type { NavigationTransport } from "../navigation/types";

export function createTransport(config: AppConfig): NavigationTransport {
  switch (config.transport) {
    case "standalone":
      return new StandaloneTransport(config.wasm.standalone);
    case "msfs":
      return new MsfsTransport(config.wasm.msfs);
    case "api":
      return new ApiTransport(config.apiBaseUrl);
  }
}

let instance: NavigationDataInterface | null = null;

/** App-wide navigation data access, built from the configured transport. */
export function getNavigationService(): NavigationDataInterface {
  instance ??= new NavigationDataInterface(createTransport(appConfig));
  return instance;
}
