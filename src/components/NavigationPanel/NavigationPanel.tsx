import { useEffect, useState, type FormEvent } from "react";
import { lookupIdent, type LookupResult } from "../../navigation/lookup";
import { useNavigation } from "../../services/useNavigation";

interface NavigationPanelProps {
  onResult(result: Pick<LookupResult, "airport" | "waypoints">): void;
}

/** Looks an identifier up as an airport and as waypoints in the active data source. */
export function NavigationPanel({ onResult }: NavigationPanelProps) {
  const { nav, state, error } = useNavigation();
  const [result, setResult] = useState<LookupResult | null>(null);
  const [ident, setIdent] = useState("");

  // A new data source may not know the previous result.
  useEffect(() => {
    setResult(null);
    onResult({ airport: null, waypoints: [] });
  }, [nav, onResult]);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setResult(null);
    const next = await lookupIdent(nav, ident);
    setResult(next);
    onResult({ airport: next.airport, waypoints: next.waypoints });
  }

  return (
    <section className="panel">
      <h2>Navigation data</h2>
      <p>
        {nav.transportKind}: <strong>{state}</strong>
      </p>
      <form onSubmit={lookup}>
        <input
          value={ident}
          onChange={(e) => setIdent(e.target.value)}
          placeholder="ICAO or waypoint, e.g. MGGT, COSTA"
          aria-label="Airport or waypoint identifier"
        />
        <button type="submit" disabled={state !== "connected" || !ident.trim()}>
          Find
        </button>
      </form>
      {result?.error ? (
        <p className="error">{result.error}</p>
      ) : (
        result && <p className="hint">{result.message}</p>
      )}
      {!result && error && <p className="error">{error}</p>}
    </section>
  );
}
