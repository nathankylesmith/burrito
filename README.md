# FOIL

Tinder, but the date is a burrito.

Swipe right on nearby taquerias, breakfast burritos, and foil-wrapped problems. FOIL uses your location when you let it, then falls back to a curated deck from cities that actually take burritos seriously.

## Thoughts

The swipe mechanic is the right interaction, not just a joke. “What should I eat” is a high-volume, low-stakes decision. A list makes you compare. A deck makes you commit.

Keeping it to burritos is the product, not a limitation. A generic restaurant swiper becomes Yelp with worse UX. A burrito swiper can have a point of view: foil, salsa, late-night, California vs Mission, smothered or not.

The dating-app parody should stay light. “It’s a wrap” and a heat score are enough. The useful part is still: find a place near you, save the ones you like, get directions.

## Try it

Open the repo in StackBlitz: https://stackblitz.com/github/nathankylesmith/burrito/tree/master

That boots the Vite app in the browser. For a standing public URL, turn on GitHub Pages for the `gh-pages` branch at https://nathankylesmith.github.io/burrito/

## Run it locally

```bash
npm install
npm run dev
```

Then open the local URL Vite prints. On a phone, the UI goes full-bleed. On desktop, it sits in a phone frame.

```bash
npm test
npm run build
```

## How it works

- **Discover:** swipe right to like, left to pass, star to super-like.
- **Matches:** saved locally in the browser.
- **Live spots:** OpenStreetMap via the Overpass API. No API key.
- **Fallback:** curated lists for San Francisco, Austin, San Diego, Los Angeles, Denver, and New York if live results are thin or the request fails.

Location stays in the browser. Matches never leave your machine.
