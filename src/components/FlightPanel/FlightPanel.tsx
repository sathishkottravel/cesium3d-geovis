import { MODE_LABELS } from "../../config/transportSettings";
import { getRuntime } from "../../runtime/runtime";
import { useNavigation } from "../../services/useNavigation";

/** Shows the active runtime/transport configuration. Flight data comes later. */
export function FlightPanel() {
  const runtime = getRuntime();
  const { settings, nav } = useNavigation();
  return (
    <section className="panel">
      <h2>Session</h2>
      <dl>
        <dt>Runtime</dt>
        <dd>{runtime.describe()}</dd>
        <dt>Transport</dt>
        <dd>
          {MODE_LABELS[settings.mode]} ({nav.transportKind})
        </dd>
      </dl>
    </section>
  );
}
