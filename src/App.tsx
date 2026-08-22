import { useMemo, useState } from "react";
import { MatchModal } from "./components/MatchModal";
import { Matches } from "./components/Matches";
import { SwipeDeck } from "./components/SwipeDeck";
import { Welcome } from "./components/Welcome";
import { CVILLE, cvilleDeck, isNearCville } from "./data/cville";
import { readBrowserLocation } from "./lib/geo";
import { loadDeck } from "./lib/places";
import { loadMatches, saveMatches, upsertMatch } from "./lib/storage";
import type { Coords, Match, Spot, SwipeAction } from "./types";

type Tab = "discover" | "matches";

export default function App() {
  const [origin, setOrigin] = useState<Coords | null>(null);
  const [locationLabel, setLocationLabel] = useState("Charlottesville");
  const [spots, setSpots] = useState<Spot[]>([]);
  const [live, setLive] = useState(false);
  const [matches, setMatches] = useState<Match[]>(() => loadMatches());
  const [tab, setTab] = useState<Tab>("discover");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [latestMatch, setLatestMatch] = useState<Match | null>(null);
  const [seen, setSeen] = useState<string[]>([]);

  const remaining = useMemo(
    () => spots.filter((spot) => !seen.includes(spot.id)),
    [spots, seen],
  );

  async function boot(coords: Coords, label: string) {
    setBusy(true);
    setError(null);
    setOrigin(coords);
    setLocationLabel(label);
    setSeen([]);
    try {
      const deck = await loadDeck(coords);
      setSpots(deck.spots);
      setLive(deck.live);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Charlottesville burritos.");
    } finally {
      setBusy(false);
    }
  }

  async function useMyLocation() {
    setBusy(true);
    setError(null);
    try {
      const coords = await readBrowserLocation();
      if (isNearCville(coords)) {
        await boot(coords, "Near you in Cville");
        return;
      }
      setError("You’re outside Charlottesville, so this is still the Cville list from downtown.");
      await boot(CVILLE, "Charlottesville");
    } catch (err) {
      setError(
        err instanceof Error
          ? `${err.message} Using downtown Charlottesville instead.`
          : "Location is blocked. Using downtown Charlottesville.",
      );
      await boot(CVILLE, "Charlottesville");
    }
  }

  function persist(next: Match[]) {
    setMatches(next);
    saveMatches(next);
  }

  function swipe(spot: Spot, action: SwipeAction) {
    setSeen((current) => [...current, spot.id]);
    if (action === "nope") return;
    const match: Match = { ...spot, action, matchedAt: Date.now() };
    persist(upsertMatch(matches, match));
    setLatestMatch(match);
  }

  function resetDeck() {
    if (!origin) return;
    setSeen([]);
    if (!live) setSpots(cvilleDeck(origin));
  }

  return (
    <div className="shell">
      <div className="phone">
        <header className="topbar">
          <button className="brand" onClick={() => { setOrigin(null); setTab("discover"); }}>
            FOIL
          </button>
          <p>Cville burritos</p>
        </header>

        {!origin ? (
          <Welcome
            busy={busy}
            error={error}
            onStart={() => void boot(CVILLE, "Charlottesville")}
            onLocate={() => void useMyLocation()}
          />
        ) : (
          <>
            {busy ? (
              <section className="loading">
                <div className="spinner" aria-hidden="true" />
                <p>Unwrapping Charlottesville…</p>
              </section>
            ) : tab === "discover" ? (
              <SwipeDeck
                spots={remaining}
                live={live}
                locationLabel={locationLabel}
                onSwipe={swipe}
                onReset={resetDeck}
                onChangeCity={() => setOrigin(null)}
              />
            ) : (
              <Matches matches={matches} onClear={() => persist([])} />
            )}
          </>
        )}

        {origin && !busy ? (
          <nav className="tabs">
            <button className={tab === "discover" ? "active" : ""} onClick={() => setTab("discover")}>
              Discover
            </button>
            <button className={tab === "matches" ? "active" : ""} onClick={() => setTab("matches")}>
              Matches{matches.length ? ` ${matches.length}` : ""}
            </button>
          </nav>
        ) : null}
      </div>
      <MatchModal match={latestMatch} onKeepSwiping={() => setLatestMatch(null)} />
    </div>
  );
}
