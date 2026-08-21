-- Verify RLS policies are set up correctly
-- Run this in your Supabase SQL editor to check if policies exist

-- Check if RLS is enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN ('dishes', 'restaurants', 'regions', 'profiles', 'swipes', 'favorites');

-- Check existing policies for dishes
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'dishes';

-- Check existing policies for restaurants
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual 
FROM pg_policies 
WHERE tablename = 'restaurants';

-- Test query that should work (run as anon role)
-- This simulates what the mobile app does
SELECT COUNT(*) as dish_count FROM dishes;
SELECT COUNT(*) as restaurant_count FROM restaurants;

