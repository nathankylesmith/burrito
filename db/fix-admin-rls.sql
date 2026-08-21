-- Fix RLS policies for admin operations
-- Run this in your Supabase SQL editor if the admin panel can't update dishes

-- Ensure RLS is enabled
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_versions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies that might conflict (with CASCADE to handle dependencies)
DROP POLICY IF EXISTS "Service role can update dishes" ON public.dishes CASCADE;
DROP POLICY IF EXISTS "Service role can update dish versions" ON public.dish_versions CASCADE;
DROP POLICY IF EXISTS "Service role can insert dishes" ON public.dishes CASCADE;
DROP POLICY IF EXISTS "Service role can delete dishes" ON public.dishes CASCADE;
DROP POLICY IF EXISTS "Service role can insert dish versions" ON public.dish_versions CASCADE;
DROP POLICY IF EXISTS "Service role can delete dish versions" ON public.dish_versions CASCADE;

-- Ensure SELECT policies exist for public access (mobile app)
DROP POLICY IF EXISTS "Dishes are viewable by everyone" ON public.dishes;
CREATE POLICY "Dishes are viewable by everyone"
ON public.dishes FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Dish versions are viewable by everyone" ON public.dish_versions;
CREATE POLICY "Dish versions are viewable by everyone"
ON public.dish_versions FOR SELECT
USING (true);

-- Allow authenticated users to update dishes for admin review functionality
-- This allows mobile app admin functions to work with authenticated users
DROP POLICY IF EXISTS "Authenticated users can update dishes" ON public.dishes;
CREATE POLICY "Authenticated users can update dishes"
ON public.dishes FOR UPDATE
USING (auth.role() = 'authenticated');

-- TEMPORARY: Allow anyone to delete dishes for testing
DROP POLICY IF EXISTS "Authenticated users can delete dishes" ON public.dishes;
CREATE POLICY "Authenticated users can delete dishes"
ON public.dishes FOR DELETE
USING (true);

-- Ensure other tables have SELECT policies too
DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Restaurants are viewable by everyone"
ON public.restaurants FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Regions are viewable by everyone" ON public.regions;
CREATE POLICY "Regions are viewable by everyone"
ON public.regions FOR SELECT
USING (true);

-- Recreate service role policies with proper permissions
CREATE POLICY "Service role can update dishes"
ON public.dishes
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update dish versions"
ON public.dish_versions
FOR UPDATE
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Also ensure service role can insert and delete
CREATE POLICY "Service role can insert dishes"
ON public.dishes
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can delete dishes"
ON public.dishes
FOR DELETE
USING (auth.role() = 'service_role');

CREATE POLICY "Service role can insert dish versions"
ON public.dish_versions
FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can delete dish versions"
ON public.dish_versions
FOR DELETE
USING (auth.role() = 'service_role');

-- TEMPORARY FIX: Allow all operations for service role (if above doesn't work)
-- DROP POLICY IF EXISTS "Service role can do everything on dishes" ON public.dishes;
-- CREATE POLICY "Service role can do everything on dishes"
-- ON public.dishes
-- FOR ALL
-- USING (auth.role() = 'service_role')
-- WITH CHECK (auth.role() = 'service_role');

-- DROP POLICY IF EXISTS "Service role can do everything on dish versions" ON public.dish_versions;
-- CREATE POLICY "Service role can do everything on dish versions"
-- ON public.dish_versions
-- FOR ALL
-- USING (auth.role() = 'service_role')
-- WITH CHECK (auth.role() = 'service_role');

-- Verify the policies exist
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
AND tablename IN ('dishes', 'dish_versions')
ORDER BY tablename, policyname;
