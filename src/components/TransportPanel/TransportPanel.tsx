import { useEffect, useId, useState, type ChangeEvent, type FormEvent } from "react";
import {
  MODE_LABELS,
  TRANSPORT_MODES,
  maskSignedUrl,
  validateSettings,
  type TransportMode,
  type TransportSettings,
} from "../../config/transportSettings";
import { getNavigationService } from "../../services/NavigationService";
import { useNavigation } from "../../services/useNavigation";

/** Secret text field: hidden like a password, with a show/hide toggle. */
function SecretInput(props: {
  id: string;
  value: string;
  placeholder?: string;
  onChange(value: string): void;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="secret-input">
      <input
        id={props.id}
        type={visible ? "text" : "password"}
        value={props.value}
        placeholder={props.placeholder}
        onChange={(e) => props.onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
      <button type="button" onClick={() => setVisible((v) => !v)} aria-pressed={visible}>
        {visible ? "Hide" : "Show"}
      </button>
    </div>
  );
}

/** Picks the navigation data source (mock / remote / api) and switches transports. */
export function TransportPanel() {
  const { settings, state } = useNavigation();
  const [draft, setDraft] = useState<TransportSettings>(settings);
  const id = useId();

  // Follow the applied settings (e.g. after connecting) so the form shows what is in use.
  useEffect(() => setDraft(settings), [settings]);

  const errors = validateSettings(draft);
  const valid = Object.keys(errors).length === 0;
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  function apply(next: TransportSettings) {
    void getNavigationService().apply(next);
  }

  function changeMode(event: ChangeEvent<HTMLSelectElement>) {
    const next = { ...draft, mode: event.target.value as TransportMode };
    setDraft(next);
    // Mock needs no input, so switch right away; remote and api wait for Connect.
    if (next.mode === "mock") apply(next);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (valid) apply(draft);
  }

  const setRemote = (packageUrl: string) => setDraft({ ...draft, remote: { packageUrl } });
  const setApi = (patch: Partial<TransportSettings["api"]>) => setDraft({ ...draft, api: { ...draft.api, ...patch } });
  const maskedPackageUrl = maskSignedUrl(draft.remote.packageUrl);

  const apiFields = (
    <>
      <label htmlFor={`${id}-url`}>API URL</label>
      <input
        id={`${id}-url`}
        type="url"
        value={draft.api.baseUrl}
        placeholder="https://example.com/api/v1"
        onChange={(e) => setApi({ baseUrl: e.target.value })}
        spellCheck={false}
      />
      {errors.baseUrl && <p className="error">{errors.baseUrl}</p>}
      <label htmlFor={`${id}-token`}>API token</label>
      <SecretInput
        id={`${id}-token`}
        value={draft.api.token}
        placeholder="optional bearer token"
        onChange={(token) => setApi({ token })}
      />
    </>
  );

  return (
    <section className="panel">
      <h2>Data source</h2>
      <form className="settings" onSubmit={submit}>
        <label htmlFor={`${id}-mode`}>Mode</label>
        <select id={`${id}-mode`} value={draft.mode} onChange={changeMode}>
          {TRANSPORT_MODES.map((mode) => (
            <option key={mode} value={mode}>
              {MODE_LABELS[mode]}
            </option>
          ))}
        </select>

        {draft.mode === "remote" && (
          <>
            <label htmlFor={`${id}-package`}>Signed package URL</label>
            <SecretInput
              id={`${id}-package`}
              value={draft.remote.packageUrl}
              placeholder="https://…/navdata.zip?Signature=…"
              onChange={setRemote}
            />
            {maskedPackageUrl && <p className="hint masked">{maskedPackageUrl}</p>}
            {/* An empty field only disables Connect; errors show once something is typed. */}
            {draft.remote.packageUrl.trim() && errors.packageUrl && <p className="error">{errors.packageUrl}</p>}
          </>
        )}

        {draft.mode === "api" && apiFields}

        {draft.mode !== "mock" && (
          <button type="submit" disabled={!valid || state === "connecting"}>
            {dirty || state !== "connected" ? "Connect" : "Reconnect"}
          </button>
        )}
      </form>
      <p className="hint">Saved for this session only.</p>
    </section>
  );
}
