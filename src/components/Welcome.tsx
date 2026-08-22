type WelcomeProps = {
  busy: boolean;
  error: string | null;
  onStart: () => void;
  onLocate: () => void;
};

export function Welcome({ busy, error, onStart, onLocate }: WelcomeProps) {
  return (
    <section className="welcome">
      <p className="eyebrow">Charlottesville, VA</p>
      <h1>
        Swipe the
        <br />
        Cville deck.
      </h1>
      <p className="lede">
        Real Cville menus, ratings, ingredients, reviews, and photos from the
        restaurants. Tap a card photo to see the next shot. Prices move — call if you’re hungry.
      </p>
      <button className="primary-btn" disabled={busy} onClick={onStart}>
        {busy ? "Unwrapping…" : "Find burritos in Charlottesville"}
      </button>
      <button className="ghost-btn locate-btn" disabled={busy} onClick={onLocate}>
        I’m here — sort by my location
      </button>
      {error ? <p className="error">{error}</p> : null}
    </section>
  );
}
