import { useEffect, useRef, useState } from "react";
import { formatDistance } from "../lib/geo";
import type { Spot, SwipeAction } from "../types";

type SwipeDeckProps = {
  spots: Spot[];
  live: boolean;
  locationLabel: string;
  onSwipe: (spot: Spot, action: SwipeAction) => void;
  onReset: () => void;
  onChangeCity: () => void;
};

type DragState = {
  x: number;
  y: number;
  dragging: boolean;
};

const THRESHOLD = 110;

export function SwipeDeck({
  spots,
  live,
  locationLabel,
  onSwipe,
  onReset,
  onChangeCity,
}: SwipeDeckProps) {
  const [drag, setDrag] = useState<DragState>({ x: 0, y: 0, dragging: false });
  const [photoIndex, setPhotoIndex] = useState(0);
  const origin = useRef({ x: 0, y: 0 });
  const current = spots[0];

  useEffect(() => {
    setPhotoIndex(0);
  }, [current?.id]);

  function finish(action: SwipeAction) {
    if (!current) return;
    setDrag({ x: 0, y: 0, dragging: false });
    onSwipe(current, action);
  }

  function onPointerDown(event: React.PointerEvent<HTMLElement>) {
    if (!current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    origin.current = { x: event.clientX, y: event.clientY };
    setDrag({ x: 0, y: 0, dragging: true });
  }

  function onPointerMove(event: React.PointerEvent<HTMLElement>) {
    if (!drag.dragging) return;
    setDrag({
      x: event.clientX - origin.current.x,
      y: event.clientY - origin.current.y,
      dragging: true,
    });
  }

  function onPointerUp() {
    if (!drag.dragging || !current) return;
    if (drag.x > THRESHOLD) finish("like");
    else if (drag.x < -THRESHOLD) finish("nope");
    else {
      if (Math.hypot(drag.x, drag.y) < 12 && current.photos.length > 1) {
        setPhotoIndex((index) => (index + 1) % current.photos.length);
      }
      setDrag({ x: 0, y: 0, dragging: false });
    }
  }

  if (!current) {
    return (
      <section className="deck empty-deck">
        <h2>You wrapped Cville.</h2>
        <p>That’s the whole foil circuit. Shuffle and argue about Barbie’s again.</p>
        <div className="modal-actions">
          <button className="primary-btn" onClick={onReset}>
            Shuffle the deck
          </button>
          <button className="ghost-btn" onClick={onChangeCity}>
            Back to start
          </button>
        </div>
      </section>
    );
  }

  const rotate = drag.x * 0.06;
  const likeOpacity = Math.min(1, Math.max(0, drag.x / 140));
  const nopeOpacity = Math.min(1, Math.max(0, -drag.x / 140));

  return (
    <section className="deck">
      <div className="deck-meta">
        <span>{live ? "Cville menus + OSM extras" : "Cville menus"}</span>
        <span>{locationLabel}</span>
      </div>
      <div className="stack">
        {spots.slice(0, 3).map((spot, index) => {
          const isTop = index === 0;
          const photo = isTop ? spot.photos[photoIndex] ?? spot.photos[0] : spot.photos[0];
          return (
            <article
              key={spot.id}
              className={`card ${isTop ? "card-top" : ""}`}
              style={
                isTop
                  ? {
                      transform: `translate(${drag.x}px, ${drag.y}px) rotate(${rotate}deg)`,
                      transition: drag.dragging ? "none" : "transform 180ms ease",
                    }
                  : {
                      transform: `scale(${1 - index * 0.04}) translateY(${index * 12}px)`,
                    }
              }
              onPointerDown={isTop ? onPointerDown : undefined}
              onPointerMove={isTop ? onPointerMove : undefined}
              onPointerUp={isTop ? onPointerUp : undefined}
              onPointerCancel={isTop ? onPointerUp : undefined}
            >
              <img src={photo} alt={spot.name} draggable={false} />
              {isTop ? (
                <>
                  <div className="stamp like" style={{ opacity: likeOpacity }}>
                    LIKE
                  </div>
                  <div className="stamp nope" style={{ opacity: nopeOpacity }}>
                    NOPE
                  </div>
                  {spot.photos.length > 1 ? (
                    <div className="photo-dots" aria-hidden="true">
                      {spot.photos.map((src) => (
                        <span key={src} className={src === photo ? "on" : ""} />
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
              <div className="card-copy">
                <div className="card-title">
                  <h2>{spot.name}</h2>
                  <p className="heat">{formatDistance(spot.distanceMiles)}</p>
                </div>
                <p className="card-sub">
                  {spot.rating != null
                    ? `${spot.rating.toFixed(1)} ★ (${spot.reviewCount} · ${spot.ratingSource}) · ${spot.priceRange}`
                    : `${spot.priceRange} · rating not posted`}
                </p>
                <p className="card-sub">
                  {spot.address} · {spot.neighborhood}
                </p>
                <p className="card-hours">{spot.hours}</p>
                {spot.signature ? (
                  <p className="card-signature">
                    <strong>{spot.signature.name}</strong> {spot.signature.price}
                    <span>{spot.signature.ingredients.join(" · ")}</span>
                  </p>
                ) : null}
                {spot.reviews[0] ? (
                  <blockquote className="card-review">
                    “{spot.reviews[0].quote}”
                    <cite>{spot.reviews[0].source}</cite>
                  </blockquote>
                ) : null}
                {spot.photoCredit ? <p className="photo-credit">Photo: {spot.photoCredit}</p> : null}
              </div>
            </article>
          );
        })}
      </div>
      <div className="actions" aria-label="Swipe actions">
        <button className="round-btn nope-btn" onClick={() => finish("nope")} aria-label="Pass">
          ✕
        </button>
        <button className="round-btn super-btn" onClick={() => finish("super")} aria-label="Super like">
          ★
        </button>
        <button className="round-btn like-btn" onClick={() => finish("like")} aria-label="Like">
          ♥
        </button>
      </div>
    </section>
  );
}
