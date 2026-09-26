import { getRuntime } from "../../runtime/runtime";
import { appConfig } from "../../config/appConfig";

/** Shows the active runtime/transport configuration. Flight data comes later. */
export function FlightPanel() {
  const runtime = getRuntime();
  return (
    <section className="panel">
      <h2>Session</h2>
      <dl>
        <dt>Runtime</dt>
        <dd>{runtime.describe()}</dd>
        <dt>Transport</dt>
        <dd>{appConfig.transport}</dd>
      </dl>
    </section>
  );
}
