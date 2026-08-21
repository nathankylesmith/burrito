# Testing the Google Places Dish Loader

## Prerequisites

Before testing, ensure you have:

1. **Environment Variables** set up. You can either:
   - Create `apps/admin/.env.local` with:
     ```bash
     SUPABASE_URL=your_supabase_url
     SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
     GOOGLE_MAPS_API_KEY=your_google_maps_api_key
     ```
   - Or export them in your shell:
     ```bash
     export SUPABASE_URL="your_supabase_url"
     export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
     export GOOGLE_MAPS_API_KEY="your_google_maps_api_key"
     ```

2. **Supabase Storage Bucket** created:
   - Default bucket name: `dish-images`
   - Make sure the bucket exists and is accessible with your service role key

3. **Database Schema** applied:
   - Run `db/supabase.sql` to ensure all tables and columns exist

## Testing Methods

### Method 1: Using the Shell Script (Easiest)

From the project root:

```bash
# Basic test - San Francisco
./scripts/load-dishes.sh 37.7749,-122.4194 3500

# With keyword filter
./scripts/load-dishes.sh 37.7749,-122.4194 3500 "italian"

# With custom region name
./scripts/load-dishes.sh 37.7749,-122.4194 3500 "" "" "San Francisco Downtown"

# Test with smaller radius and fewer results (faster)
./scripts/load-dishes.sh 37.7749,-122.4194 1500 "" "" "SF Test"
```

### Method 2: Using the CLI Directly

From `packages/loader` directory:

```bash
cd packages/loader

# Basic test
node dist/cli.js --location "37.7749,-122.4194" --radius 3500 --max-results 5

# With all options
node dist/cli.js \
  --location "37.7749,-122.4194" \
  --radius 3500 \
  --keyword "pizza" \
  --max-results 10 \
  --region-name "SF Pizza Places" \
  --photo-bucket "dish-images"
```

### Method 3: Using Node.js REPL (For Debugging)

Create a test file `test-loader.js`:

```javascript
import { createClient } from '@supabase/supabase-js';
import { loadRestaurantsFromGooglePlaces } from './packages/loader/dist/index.js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const result = await loadRestaurantsFromGooglePlaces(supabase, {
  apiKey: process.env.GOOGLE_MAPS_API_KEY,
  location: '37.7749,-122.4194',
  radius: 1500,
  maxResults: 3,
  regionName: 'Test Region',
});

console.log('Results:', JSON.stringify(result, null, 2));
```

Run with:
```bash
node test-loader.js
```

### Method 4: Via Admin API

If your admin app is running:

```bash
curl -X POST http://localhost:3000/api/regions/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "location": "37.7749,-122.4194",
    "radius": 1500,
    "maxResults": 5,
    "regionName": "Test Region"
  }'
```

## What to Verify

After running the loader, check:

### 1. Database Records

```sql
-- Check regions
SELECT id, name, restaurant_count, dish_count, status, last_refreshed_at 
FROM regions 
ORDER BY last_refreshed_at DESC 
LIMIT 5;

-- Check restaurants
SELECT r.name, r.cuisine_type, r.rating, r.review_count, r.image_url,
       COUNT(d.id) as dish_count
FROM restaurants r
LEFT JOIN dishes d ON d.restaurant_id = r.id
GROUP BY r.id
ORDER BY r.created_at DESC
LIMIT 10;

-- Check dishes with metadata
SELECT d.name, d.description, d.price, d.cuisine_type, d.dish_type, 
       d.dietary_tags, d.google_photo_reference, d.image_url,
       r.name as restaurant_name
FROM dishes d
JOIN restaurants r ON r.id = d.restaurant_id
ORDER BY d.created_at DESC
LIMIT 20;

-- Check for dishes with multiple photos
SELECT name, google_photo_reference, 
       array_length(string_to_array(google_photo_reference, ','), 1) as photo_count
FROM dishes
WHERE google_photo_reference LIKE '%,%'
LIMIT 10;

-- Check dishes extracted from reviews
SELECT name, description, dietary_tags, dish_type
FROM dishes
WHERE description LIKE '%—%' OR description LIKE '%Photo credit%'
LIMIT 10;
```

### 2. Storage Bucket

Check that photos were uploaded:
- Restaurant photos: `restaurants/{place_id}.{ext}`
- Dish photos: `dishes/{place_id}/{photo_reference}.{ext}`

### 3. Console Output

The loader should output:
- Region creation/update status
- Number of restaurants loaded
- Number of dishes generated
- Any warnings about failed photo uploads or menu scraping

### 4. Verify New Features

**Review Extraction:**
- Look for dishes with names extracted from reviews (not generic "Special" names)
- Check descriptions contain review snippets with reviewer names and ratings

**Menu Scraping:**
- Check if dishes from restaurants with websites have accurate names/prices
- Verify dietary tags are populated from menu data

**Multiple Photos:**
- Check `google_photo_reference` field contains comma-separated values
- Verify multiple photos are associated with the same dish

**Metadata:**
- Verify `dietary_tags` array is populated
- Check `dish_type` enum values are set correctly
- Confirm photo attribution is included in descriptions

## Testing Specific Scenarios

### Test Review Extraction

Find a restaurant with many reviews:
```bash
./scripts/load-dishes.sh 40.7589,-73.9851 1000 "pizza" "" "NYC Pizza Test"
```

Then check:
```sql
SELECT name, description, dietary_tags
FROM dishes
WHERE description LIKE '%—%'
LIMIT 10;
```

### Test Menu Scraping

Find restaurants with websites:
```bash
./scripts/load-dishes.sh 37.7849,-122.4094 2000 "" "" "SF Restaurants with Menus"
```

Check:
```sql
SELECT r.name, r.website_url, d.name, d.price, d.dietary_tags
FROM restaurants r
JOIN dishes d ON d.restaurant_id = r.id
WHERE r.website_url IS NOT NULL
LIMIT 20;
```

### Test Photo Matching

Check if photos are matched to dishes:
```sql
SELECT d.name, d.google_photo_reference, d.image_url,
       array_length(string_to_array(d.google_photo_reference, ','), 1) as photo_count
FROM dishes d
WHERE d.google_photo_reference IS NOT NULL
ORDER BY photo_count DESC
LIMIT 10;
```

## Troubleshooting

### No dishes created
- Check if restaurants were found: `SELECT COUNT(*) FROM restaurants WHERE region_id = 'your-region-id'`
- Check console for errors about photo processing
- Verify Google Places API is returning photos and reviews

### Photos not uploading
- Verify storage bucket exists and is accessible
- Check bucket permissions in Supabase dashboard
- Look for upload errors in console output

### Menu scraping failing
- Check console for warnings about website scraping
- Verify restaurants have `website_url` populated
- Some websites may block scraping (this is expected)

### Review extraction not working
- Verify Google Places API returns reviews (check `details.reviews` in code)
- Some restaurants may not have reviews
- Review patterns may need adjustment for specific cuisines

## Performance Testing

For larger tests:
```bash
# Test with more results
./scripts/load-dishes.sh 37.7749,-122.4194 5000 "" "" "Large SF Test"

# Monitor progress
watch -n 5 'psql $DATABASE_URL -c "SELECT status, restaurant_count, dish_count FROM regions ORDER BY last_refreshed_at DESC LIMIT 1"'
```

## Expected Results

After a successful test run:
- ✅ Region created/updated with status 'ready'
- ✅ Restaurants loaded with metadata (rating, reviews, images)
- ✅ Dishes created from multiple sources (menu, reviews, photos)
- ✅ Photos uploaded to storage bucket
- ✅ Dish metadata populated (dietary tags, dish types, descriptions)
- ✅ Multiple photos per dish when available
- ✅ Review snippets included in dish descriptions

