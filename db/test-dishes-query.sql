-- Test query to verify dishes can be read
-- This simulates what the mobile app query does

-- Simple test
SELECT COUNT(*) as total_dishes FROM dishes;

-- Test with restaurant join (what the app does)
SELECT 
  d.id,
  d.name,
  d.description,
  d.image_url,
  d.price,
  d.cuisine_type,
  r.name as restaurant_name
FROM dishes d
LEFT JOIN restaurants r ON r.id = d.restaurant_id
LIMIT 20;

-- Verify RLS policies allow anonymous access
-- Run this as the anon role (which is what the mobile app uses)
-- In Supabase SQL editor, you can test by checking:
-- Settings > API > Check "Enable anonymous access" or verify RLS policies

