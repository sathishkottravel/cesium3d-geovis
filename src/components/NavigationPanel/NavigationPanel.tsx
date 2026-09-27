import { useEffect, useState, type FormEvent } from "react";
import type { Airport } from "../../navigation/types";
import { useNavigation } from "../../services/useNavigation";

interface NavigationPanelProps {
  onAirport(airport: Airport | null): void;
}

export function NavigationPanel({ onAirport }: NavigationPanelProps) {
  const { nav, state, error } = useNavigation();
  const [message, setMessage] = useState<string | null>(null);
  const [ident, setIdent] = useState("");

  // A new data source may not know the previous result.
  useEffect(() => {
    setMessage(null);
    onAirport(null);
  }, [nav, onAirport]);

  async function lookup(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    try {
      const airport = await nav.getAirport(ident);
      onAirport(airport);
      if (!airport) setMessage(`No airport found for ${ident}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    }
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
          placeholder="ICAO, e.g. MGGT"
          aria-label="Airport ICAO code"
        />
        <button type="submit" disabled={state !== "connected" || !ident.trim()}>
          Find
        </button>
      </form>
      {(message ?? error) && <p className="error">{message ?? error}</p>}
    </section>
  );
}
