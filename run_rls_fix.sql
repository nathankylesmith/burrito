-- Quick RLS fix for mobile app admin updates
DROP POLICY IF EXISTS "Anonymous users can update dishes" ON public.dishes;
DROP POLICY IF EXISTS "Authenticated users can update dishes" ON public.dishes;

CREATE POLICY "Authenticated users can update dishes"
ON public.dishes FOR UPDATE
USING (auth.role() = 'authenticated');

-- Check the policy was created
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'dishes' AND cmd = 'UPDATE';
