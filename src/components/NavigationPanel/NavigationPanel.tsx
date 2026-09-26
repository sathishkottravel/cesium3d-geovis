import { useEffect, useState, type FormEvent } from "react";
import type { Airport } from "../../navigation/types";
import { getNavigationService } from "../../services/NavigationService";

interface NavigationPanelProps {
  onAirport(airport: Airport | null): void;
}

export function NavigationPanel({ onAirport }: NavigationPanelProps) {
  const nav = getNavigationService();
  const [status, setStatus] = useState(nav.connectionState);
  const [message, setMessage] = useState<string | null>(null);
  const [ident, setIdent] = useState("");

  useEffect(() => {
    setStatus("connecting");
    nav
      .connect()
      .then(() => setStatus(nav.connectionState))
      .catch((err: Error) => {
        setStatus(nav.connectionState);
        setMessage(err.message);
      });
  }, [nav]);

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
        {nav.transportKind}: <strong>{status}</strong>
      </p>
      <form onSubmit={lookup}>
        <input
          value={ident}
          onChange={(e) => setIdent(e.target.value)}
          placeholder="ICAO, e.g. ESSA"
          aria-label="Airport ICAO code"
        />
        <button type="submit" disabled={status !== "connected" || !ident.trim()}>
          Find
        </button>
      </form>
      {message && <p className="error">{message}</p>}
    </section>
  );
}
