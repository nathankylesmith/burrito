-- Ensure RLS policies are correctly set up for public access
-- Run this in your Supabase SQL editor

-- Enable RLS (if not already enabled)
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

-- Ensure public read access policies exist
DROP POLICY IF EXISTS "Dishes are viewable by everyone" ON public.dishes;
CREATE POLICY "Dishes are viewable by everyone" 
ON public.dishes 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Restaurants are viewable by everyone" 
ON public.restaurants 
FOR SELECT 
USING (true);

DROP POLICY IF EXISTS "Regions are viewable by everyone" ON public.regions;
CREATE POLICY "Regions are viewable by everyone" 
ON public.regions 
FOR SELECT 
USING (true);

-- Verify policies exist
SELECT tablename, policyname, cmd 
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('dishes', 'restaurants', 'regions')
AND cmd = 'SELECT';

