import type { Match } from "../types";

type MatchesProps = {
  matches: Match[];
  onClear: () => void;
};

export function Matches({ matches, onClear }: MatchesProps) {
  if (matches.length === 0) {
    return (
      <section className="matches empty-matches">
        <h2>No wraps yet</h2>
        <p>Swipe right when a burrito looks like the one. We’ll keep it here.</p>
      </section>
    );
  }

  return (
    <section className="matches">
      <header className="matches-head">
        <div>
          <p className="eyebrow">{matches.length} wrap{matches.length === 1 ? "" : "s"}</p>
          <h2>Your matches</h2>
        </div>
        <button className="text-btn" onClick={onClear}>
          Clear
        </button>
      </header>
      <ul className="match-list">
        {matches.map((match) => (
          <li key={match.id}>
            <a className="match-row" href={match.mapsUrl} target="_blank" rel="noreferrer">
              <img src={match.photos[0]} alt="" />
              <div>
                <strong>{match.name}</strong>
                <span>
                  {match.address}
                  {match.rating != null ? ` · ${match.rating.toFixed(1)}★` : ""}
                  {match.signature ? ` · ${match.signature.price}` : ""}
                  {match.action === "super" ? " · super liked" : ""}
                </span>
              </div>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
