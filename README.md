# FOIL

Tinder for Charlottesville burritos.

Swipe real Cville spots with restaurant photos, posted prices, ingredient lists, ratings, and short reviews. Barbie’s, El Comalito, Gomez, El Chavo, Mejicali, El Puerto, Brazos, and a few more.

## Try it

Open the repo in StackBlitz: https://stackblitz.com/github/nathankylesmith/burrito/tree/master

## Run it locally

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

## How it works

- The deck is a Charlottesville list with real addresses, hours, menu prices, ingredients, ratings, and reviews. Photos come from the restaurants or local coverage.
- If Overpass is up, extra OSM Mexican spots around town get mixed in. Chains stay out.
- “I’m here” sorts by your location when you’re actually in Cville.
- Matches stay in the browser.

Hours change. Call if you’re hungry and the card looks stale.
