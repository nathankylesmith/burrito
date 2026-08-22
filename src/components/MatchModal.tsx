import type { Match } from "../types";

type MatchModalProps = {
  match: Match | null;
  onKeepSwiping: () => void;
};

export function MatchModal({ match, onKeepSwiping }: MatchModalProps) {
  if (!match) return null;

  const superLiked = match.action === "super";

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="match-title">
      <div className="modal">
        <p className="modal-kicker">{superLiked ? "Super wrap" : "It’s a wrap"}</p>
        <h2 id="match-title">You and {match.name} liked each other.</h2>
        <img src={match.photos[0]} alt="" className="modal-photo" />
        <p className="modal-copy">
          {match.address}
          {match.rating != null ? ` · ${match.rating.toFixed(1)}★` : ""}
          {match.signature ? ` · ${match.signature.name} ${match.signature.price}` : ""}
        </p>
        {match.signature ? (
          <p className="modal-copy">{match.signature.ingredients.join(", ")}</p>
        ) : null}
        <div className="modal-actions">
          <a className="primary-btn" href={match.mapsUrl} target="_blank" rel="noreferrer">
            Get directions
          </a>
          {match.phone ? (
            <a className="ghost-btn" href={`tel:${match.phone}`}>
              Call {match.phone}
            </a>
          ) : null}
          {match.website ? (
            <a className="ghost-btn" href={match.website} target="_blank" rel="noreferrer">
              Menu / site
            </a>
          ) : null}
          <button className="ghost-btn" onClick={onKeepSwiping}>
            Keep swiping
          </button>
        </div>
      </div>
    </div>
  );
}
