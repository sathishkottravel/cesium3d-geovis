import type { Runtime } from "./runtime";

export const webRuntime: Runtime = {
  kind: "web",
  describe: () => `Browser (${navigator.userAgent.split(" ").slice(-1)[0]})`,
};
