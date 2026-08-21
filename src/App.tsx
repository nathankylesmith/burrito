import { useMemo, useState } from "react";
import { MatchModal } from "./components/MatchModal";
import { Matches } from "./components/Matches";
import { SwipeDeck } from "./components/SwipeDeck";
import { Welcome } from "./components/Welcome";
import { CITIES, curatedDeck, nearestCity } from "./data/cities";
import { readBrowserLocation } from "./lib/geo";
import { loadDeck } from "./lib/places";
import { loadMatches, saveMatches, upsertMatch } from "./lib/storage";
import type { City, Coords, Match, Spot, SwipeAction } from "./types";

type Tab = "discover" | "matches";

export default function App() {
  const [origin, setOrigin] = useState<Coords | null>(null);
  const [locationLabel, setLocationLabel] = useState("Near you");
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

  async function bootFromCoords(coords: Coords, label: string) {
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
      setError(err instanceof Error ? err.message : "Could not load nearby burritos.");
    } finally {
      setBusy(false);
    }
  }

  async function useMyLocation() {
    setBusy(true);
    setError(null);
    try {
      const coords = await readBrowserLocation();
      const city = nearestCity(coords);
      await bootFromCoords(coords, `Near ${city.name}`);
    } catch (err) {
      setBusy(false);
      setError(
        err instanceof Error
          ? `${err.message} Pick a city and we’ll still get you fed.`
          : "Location is blocked. Pick a city instead.",
      );
    }
  }

  function pickCity(city: City) {
    void bootFromCoords(city.coords, city.name);
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
    const city = CITIES.find((item) => item.name === locationLabel);
    if (!live && city) setSpots(curatedDeck(city.id, origin));
  }

  return (
    <div className="shell">
      <div className="phone">
        <header className="topbar">
          <button className="brand" onClick={() => { setOrigin(null); setTab("discover"); }}>
            FOIL
          </button>
          <p>Tinder for burritos</p>
        </header>

        {!origin ? (
          <Welcome busy={busy} error={error} onLocate={() => void useMyLocation()} onPickCity={pickCity} />
        ) : (
          <>
            {busy ? (
              <section className="loading">
                <div className="spinner" aria-hidden="true" />
                <p>Unwrapping spots near you…</p>
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
