-- Fix RLS policies to allow joins from dishes to restaurants
-- Run this in your Supabase SQL editor

-- Ensure restaurants are publicly readable (for joins)
DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Restaurants are viewable by everyone" 
ON public.restaurants 
FOR SELECT 
USING (true);

-- Ensure dishes are publicly readable
DROP POLICY IF EXISTS "Dishes are viewable by everyone" ON public.dishes;
CREATE POLICY "Dishes are viewable by everyone" 
ON public.dishes 
FOR SELECT 
USING (true);

-- Verify policies exist
SELECT tablename, policyname, cmd, qual
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('dishes', 'restaurants')
AND cmd = 'SELECT';

