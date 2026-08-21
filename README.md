# DishSwipe

A modern food discovery app that lets you swipe through dishes and discover new restaurants.

## Project Structure

```
DishSwipe/
├── apps/
│   └── mobile/          # Mobile application
├── db/
│   └── supabase.sql     # Database schema and migrations
├── packages/
│   └── loader/          # Shared Google Places loader package
├── supabase/
│   └── functions/       # Edge functions (refresh-region)
└── apps/
    ├── admin/           # Next.js admin dashboard and API layer
    └── mobile/          # Mobile application
```

## Getting Started

### Prerequisites

- Node.js (v18 or higher)
- React Native development environment
- Supabase account

### Installation

1. Clone the repository
2. Install dependencies
3. Set up Supabase database
4. Run the mobile app

## Development

### Google Places Loader

The Google Places ingestion pipeline lives in `packages/loader` and can be run either via the Supabase Edge function or directly through the CLI for manual backfills.

```bash
cd packages/loader
npm install
npm run build
npm run test
```

To execute a local backfill, supply the coordinates and any optional tuning flags:

```bash
SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
GOOGLE_MAPS_API_KEY=... \
node dist/cli.js \
  --location "37.775,-122.419" \
  --radius 2000 \
  --keyword "ramen" \
  --max-results 40 \
  --max-dishes 6 \
  --max-dish-photos 3 \
  --max-review-dishes 4 \
  --max-concurrency 6 \
  --dry-run
```

Notable flags:

- `--dry-run` uploads nothing but still reports synthesized dishes.
- `--max-dishes`, `--max-dish-photos`, `--max-review-dishes` let you control extractor volume.
- `--max-concurrency` caps Google Place detail fetches to stay within quota.
- `--skip-if-fresh` and `--since` help avoid refreshing regions that have been updated recently.

The helper script `scripts/load-dishes.sh` now forwards arbitrary CLI flags, so you can run:

```bash
./scripts/load-dishes.sh 37.775,-122.419 2500 sushi "" --dry-run --max-dishes 8
```

Restaurant rows now capture `menu_url`, `photo_gallery`, and `review_summary` JSON, while dishes store `source_type`, review/photo references, confidence scores, and capture timestamps. Apply the updated schema in `db/supabase.sql` to provision these columns before running the loader.

### Mobile App

```bash
cd apps/mobile
npm install
npm start
```

### Admin dashboard

The internal dashboard lives in `apps/admin` and exposes API routes to queue refresh jobs. It expects the following environment variables at runtime:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GOOGLE_MAPS_API_KEY`

Run it locally with:

```bash
cd apps/admin
npm install
npm run dev
```

### Database

The database schema is defined in `db/supabase.sql`. Run this in your Supabase SQL editor to set up the database.

#### Updating the schema

If you are using the Supabase CLI, regenerate local migrations after pulling these changes and apply them to your project:

```bash
supabase db reset          # optional, recreates local database
supabase db diff --linked  # review generated migration for remote project
supabase db push           # apply the schema changes
```

Alternatively, run the updated contents of `db/supabase.sql` directly in the Supabase SQL editor to update your environment.

The schema now includes a `regions` table that feeds the loader and Edge function. After deploying the `refresh-region` function, set the following Postgres settings so `public.request_region_refresh` can call it:

```sql
select set_config('app.settings.refresh_region_endpoint', 'https://<your-project>.functions.supabase.co/refresh-region', false);
select set_config('app.settings.refresh_region_service_key', '<supabase-service-role-key>', false);
```

You can then schedule automatic refreshes using pg_cron, for example:

```sql
select cron.schedule('nightly-san-francisco', '0 6 * * *', $$
  select public.request_region_refresh('<region-uuid>'::uuid, 'cron');
$$);
```

## License

MIT

