import { CITIES } from "../data/cities";
import type { City } from "../types";

type WelcomeProps = {
  busy: boolean;
  error: string | null;
  onLocate: () => void;
  onPickCity: (city: City) => void;
};

export function Welcome({ busy, error, onLocate, onPickCity }: WelcomeProps) {
  return (
    <section className="welcome">
      <p className="eyebrow">It’s not a restaurant app. It’s a type.</p>
      <h1>
        Swipe right
        <br />
        on a burrito.
      </h1>
      <p className="lede">
        FOIL is Tinder for foil-wrapped destiny. We find the spots near you.
        You decide if it’s a wrap.
      </p>
      <button className="primary-btn" disabled={busy} onClick={onLocate}>
        {busy ? "Looking around…" : "Find burritos near me"}
      </button>
      {error ? <p className="error">{error}</p> : null}
      <div className="city-block">
        <p className="city-label">Or start in a burrito city</p>
        <div className="city-grid">
          {CITIES.map((city) => (
            <button key={city.id} className="city-chip" disabled={busy} onClick={() => onPickCity(city)}>
              <strong>{city.name}</strong>
              <span>{city.region}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
