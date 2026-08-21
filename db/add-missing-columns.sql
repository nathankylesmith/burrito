-- Add missing columns to restaurants table
-- Run this in your Supabase SQL editor

-- Ensure updated_at column exists (required for trigger)
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS photo_gallery JSONB;

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS review_summary JSONB;

ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_url TEXT;

-- Add missing column to regions table
ALTER TABLE public.regions
    ADD COLUMN IF NOT EXISTS refresh_log JSONB;

-- Ensure the trigger exists (recreate it to fix any issues)
DROP TRIGGER IF EXISTS restaurants_set_timestamp ON public.restaurants;
CREATE TRIGGER restaurants_set_timestamp
BEFORE UPDATE ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Add missing columns to dishes table
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP WITH TIME ZONE;

-- Ensure dishes table has updated_at and created_at
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW());

-- Add all dish metadata columns
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source_type TEXT;

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source_review_id TEXT;

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source_photo_reference TEXT;

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS confidence_score NUMERIC(4, 3);

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS menu_section TEXT;

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS review_excerpt TEXT;

-- Ensure the dishes trigger exists
DROP TRIGGER IF EXISTS dishes_set_timestamp ON public.dishes;
CREATE TRIGGER dishes_set_timestamp
BEFORE UPDATE ON public.dishes
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

