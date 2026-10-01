import { useEffect, useId, useState, type FormEvent } from "react";
import {
  maskSecret,
  SOURCE_LABELS,
  type TelemetrySettings,
  type TelemetrySource,
} from "../../telemetry/telemetrySettings";
import { parseIds } from "../../telemetry/telemetryState";
import type { ServerState, TelemetryControls } from "../../telemetry/useTelemetry";
import { SecretInput } from "../common/SecretInput";

/** London Heathrow. */
const DEFAULT_AREA = { latitude: "51.47", longitude: "-0.45", radiusNm: "40" };

interface TelemetryPanelProps {
  telemetry: TelemetryControls;
}

/** Area search, aircraft selection, tracking controls and connection settings of the telemetry page. */
export function TelemetryPanel({ telemetry }: TelemetryPanelProps) {
  const id = useId();
  const [form, setForm] = useState(DEFAULT_AREA);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [extraIds, setExtraIds] = useState("");
  const { tracks, tracked, areaResult, server } = telemetry;

  const latitude = Number(form.latitude);
  const longitude = Number(form.longitude);
  const radiusNm = Number(form.radiusNm);
  const areaValid =
    form.latitude.trim() !== "" &&
    form.longitude.trim() !== "" &&
    Math.abs(latitude) <= 90 &&
    Math.abs(longitude) <= 180 &&
    radiusNm > 0 &&
    radiusNm <= 250;

  function search(event: FormEvent) {
    event.preventDefault();
    if (areaValid) telemetry.search({ latitude, longitude, radiusNm });
  }

  const listed = Object.values(tracks)
    .filter((a) => a.inArea || tracked[a.id]?.active)
    .sort((a, b) => (a.distanceNm ?? Infinity) - (b.distanceNm ?? Infinity));
  const ids = [...new Set([...selected, ...parseIds(extraIds)])];
  const activeIds = Object.keys(tracked).filter((t) => tracked[t].active);

  function toggle(aircraftId: string, on: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(aircraftId);
      else next.delete(aircraftId);
      return next;
    });
  }

  return (
    <section className="panel telemetry-panel">
      <div className="source-row">
        <label htmlFor={`${id}-source`}>Data</label>
        <select
          id={`${id}-source`}
          value={telemetry.settings.source}
          onChange={(e) => telemetry.saveSettings({ ...telemetry.settings, source: e.target.value as TelemetrySource })}
        >
          {(Object.keys(SOURCE_LABELS) as TelemetrySource[]).map((source) => (
            <option key={source} value={source}>
              {SOURCE_LABELS[source]}
            </option>
          ))}
        </select>
      </div>
      {telemetry.settings.source === "sample" ? (
        <p className="server-status ready">● Sample traffic: 25 recorded aircraft, simulated movement</p>
      ) : (
        <ServerStatus server={server} onRetry={telemetry.wake} />
      )}

      <h2>Area</h2>
      <form className="area-form" onSubmit={search}>
        <label htmlFor={`${id}-lat`}>Latitude</label>
        <input
          id={`${id}-lat`}
          inputMode="decimal"
          value={form.latitude}
          onChange={(e) => setForm({ ...form, latitude: e.target.value })}
        />
        <label htmlFor={`${id}-lon`}>Longitude</label>
        <input
          id={`${id}-lon`}
          inputMode="decimal"
          value={form.longitude}
          onChange={(e) => setForm({ ...form, longitude: e.target.value })}
        />
        <label htmlFor={`${id}-radius`}>Radius (nm)</label>
        <input
          id={`${id}-radius`}
          inputMode="decimal"
          value={form.radiusNm}
          onChange={(e) => setForm({ ...form, radiusNm: e.target.value })}
        />
        <div className="controls">
          <button type="submit" disabled={!areaValid}>
            {telemetry.searching ? "Searching…" : "Find aircraft"}
          </button>
          <label>
            <input
              type="checkbox"
              checked={telemetry.autoRefresh}
              onChange={(e) => telemetry.setAutoRefresh(e.target.checked)}
            />
            Auto-refresh (15 s)
          </label>
        </div>
      </form>
      {!areaValid && <p className="hint">Latitude −90…90, longitude −180…180, radius up to 250 nm.</p>}
      {telemetry.areaError && <p className="error">{telemetry.areaError}</p>}
      {areaResult && (
        <p className="hint">
          {areaResult.count} aircraft within {areaResult.radiusNm} nm · updated{" "}
          {new Date(areaResult.fetchedAt).toLocaleTimeString()}
        </p>
      )}

      {listed.length > 0 && (
        <>
          <h2>Aircraft</h2>
          <div className="controls">
            <button type="button" onClick={() => setSelected(new Set(listed.map((a) => a.id)))}>
              Select all
            </button>
            <button type="button" onClick={() => setSelected(new Set())}>
              None
            </button>
          </div>
          <div className="aircraft-list">
            <table>
              <thead>
                <tr>
                  <th />
                  <th>Callsign</th>
                  <th>ICAO</th>
                  <th>Alt ft</th>
                  <th>nm</th>
                </tr>
              </thead>
              <tbody>
                {listed.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label={`Select ${a.callsign ?? a.id}`}
                        checked={selected.has(a.id)}
                        onChange={(e) => toggle(a.id, e.target.checked)}
                      />
                    </td>
                    <td>
                      {a.callsign ?? "—"} {tracked[a.id]?.active && <span className="badge">live</span>}
                    </td>
                    <td className="mono">{a.id}</td>
                    <td>{Math.round(a.altitudeFt).toLocaleString("en-US")}</td>
                    <td>{a.distanceNm == null ? "—" : a.distanceNm.toFixed(0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h2>Tracking</h2>
      <label className="field" htmlFor={`${id}-ids`}>
        Extra flight IDs (comma-separated, <code>*</code> = all in area)
      </label>
      <input
        id={`${id}-ids`}
        className="wide"
        value={extraIds}
        placeholder="e.g. 4ca7b5, 400f01"
        onChange={(e) => setExtraIds(e.target.value)}
        spellCheck={false}
      />
      <div className="controls">
        <button type="button" disabled={ids.length === 0} onClick={() => telemetry.track(ids)}>
          Track {ids.length > 0 ? ids.length : ""}
        </button>
        <button
          type="button"
          disabled={activeIds.length === 0}
          onClick={() => telemetry.stop(ids.some((t) => tracked[t]?.active) ? ids : activeIds)}
        >
          Stop {ids.some((t) => tracked[t]?.active) ? "selected" : "all"}
        </button>
      </div>
      {Object.keys(tracked).length > 0 && (
        <ul className="status-list" aria-label="Tracking status">
          {Object.entries(tracked).map(([aircraftId, t]) => (
            <li key={aircraftId}>
              <span className="mono">{aircraftId}</span>{" "}
              {t.pending ? (
                <span className="hint">working…</span>
              ) : (
                <span className={t.status?.running ? "badge" : "badge off"}>
                  {t.status?.running ? "running" : "stopped"}
                </span>
              )}
              {t.status && (
                <span className="hint">
                  {" "}
                  {t.status.publishedCount ?? 0} pts
                  {t.status.inArea === false && " · out of area"}
                  {t.status.lastPositionAt && ` · ${new Date(t.status.lastPositionAt).toLocaleTimeString()}`}
                </span>
              )}
              {t.error && <div className="error">{t.error}</div>}
            </li>
          ))}
        </ul>
      )}

      {telemetry.settings.source === "api" && <ConnectionSettings telemetry={telemetry} />}
    </section>
  );
}

function ServerStatus({ server, onRetry }: { server: ServerState; onRetry(): void }) {
  // Re-render every second while waking, for the elapsed-time counter.
  const [, setNow] = useState(0);
  useEffect(() => {
    if (server.state !== "waking") return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [server.state]);

  switch (server.state) {
    case "idle":
      return <p className="server-status">Connecting…</p>;
    case "ready":
      return <p className="server-status ready">● Connected</p>;
    case "waking":
      return (
        <p className="server-status waking" role="status">
          <span className="spinner" aria-hidden /> Waking up server (cold start, up to ~1 min)…{" "}
          {Math.round((Date.now() - server.since) / 1000)} s, attempt {server.attempt}
          <span className="hint"> {server.message}</span>
        </p>
      );
    case "unauthorized":
    case "error":
      return (
        <div className="server-status failed" role="alert">
          <span className="error">{server.message}</span>{" "}
          <button type="button" onClick={onRetry}>
            Retry
          </button>
        </div>
      );
  }
}

function ConnectionSettings({ telemetry }: TelemetryPanelProps) {
  const id = useId();
  const { settings, proxied, server } = telemetry;
  const [draft, setDraft] = useState<TelemetrySettings>(settings);
  const [open, setOpen] = useState(false);
  useEffect(() => setDraft(settings), [settings]);
  // Ask for a token as soon as the server rejects the current one.
  useEffect(() => {
    if (server.state === "unauthorized") setOpen(true);
  }, [server.state]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  function submit(event: FormEvent) {
    event.preventDefault();
    telemetry.saveSettings({ ...draft, graphqlUrl: draft.graphqlUrl.trim(), token: draft.token.trim() });
  }

  return (
    <details className="connection" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Connection</summary>
      <form className="settings" onSubmit={submit}>
        <label htmlFor={`${id}-url`}>GraphQL URL</label>
        <input
          id={`${id}-url`}
          value={draft.graphqlUrl}
          onChange={(e) => setDraft({ ...draft, graphqlUrl: e.target.value })}
          spellCheck={false}
        />
        <label htmlFor={`${id}-token`}>API token</label>
        <SecretInput
          id={`${id}-token`}
          value={draft.token}
          placeholder={proxied ? "provided by dev proxy" : "Bearer token"}
          onChange={(token) => setDraft({ ...draft, token })}
        />
        {proxied && !draft.token && <p className="hint">Token: provided by dev proxy (TELEMETRY_API_TOKEN).</p>}
        {settings.token && <p className="hint masked">In use: {maskSecret(settings.token)}</p>}
        <label className="inline">
          <input
            type="checkbox"
            checked={draft.remember}
            onChange={(e) => setDraft({ ...draft, remember: e.target.checked })}
          />
          Remember on this device
        </label>
        <div className="controls">
          <button type="submit" disabled={!dirty || !draft.graphqlUrl.trim()}>
            Save
          </button>
          <button type="button" onClick={telemetry.forgetToken} disabled={!settings.token}>
            Forget token
          </button>
        </div>
      </form>
      <p className="hint">
        {settings.remember ? "Saved in this browser until you forget it." : "Saved for this session only."} The token
        is only sent to the GraphQL URL.
      </p>
    </details>
  );
}
