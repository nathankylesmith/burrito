-- DishSwipe Database Schema
-- Supabase PostgreSQL Database

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create net schema for http extension (if enabled in Supabase)
-- Note: The http extension must be enabled in Supabase dashboard under Database > Extensions
CREATE SCHEMA IF NOT EXISTS net;

-- Enumerations
DO $$ BEGIN
    CREATE TYPE public.dish_type_enum AS ENUM (
        'appetizer',
        'main',
        'side',
        'dessert',
        'drink',
        'other'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.review_status_enum AS ENUM (
        'pending',
        'changes_requested',
        'approved',
        'rejected'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.review_subject_enum AS ENUM (
        'restaurant',
        'dish'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.restaurant_role_enum AS ENUM (
        'owner',
        'editor',
        'viewer'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.app_role_enum AS ENUM (
        'admin',
        'power_user'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Utility function to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.set_current_timestamp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Regions table to manage refresh scope
CREATE TABLE IF NOT EXISTS public.regions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    region_key TEXT UNIQUE NOT NULL,
    name TEXT,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    radius INTEGER NOT NULL CHECK (radius > 0),
    keyword TEXT,
    status TEXT NOT NULL DEFAULT 'idle',
    refresh_requested_at TIMESTAMP WITH TIME ZONE,
    last_refreshed_at TIMESTAMP WITH TIME ZONE,
    restaurant_count INTEGER NOT NULL DEFAULT 0,
    dish_count INTEGER NOT NULL DEFAULT 0,
    refresh_log JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_regions_region_key ON public.regions(region_key);
CREATE INDEX IF NOT EXISTS idx_regions_last_refreshed_at ON public.regions(last_refreshed_at);
ALTER TABLE public.regions
    ADD COLUMN IF NOT EXISTS refresh_log JSONB;

DROP TRIGGER IF EXISTS set_timestamp ON public.regions;
CREATE TRIGGER set_timestamp
BEFORE UPDATE ON public.regions
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Region import profiles for reusable loader definitions
CREATE TABLE IF NOT EXISTS public.region_import_profiles (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,
    latitude NUMERIC(9, 6) NOT NULL,
    longitude NUMERIC(9, 6) NOT NULL,
    radius INTEGER NOT NULL CHECK (radius > 0),
    keyword TEXT,
    max_results INTEGER DEFAULT 20,
    max_dishes INTEGER,
    max_dish_photos INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_run_status TEXT,
    last_region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_region_import_profiles_last_run_at ON public.region_import_profiles(last_run_at);

DROP TRIGGER IF EXISTS region_import_profiles_set_timestamp ON public.region_import_profiles;
CREATE TRIGGER region_import_profiles_set_timestamp
BEFORE UPDATE ON public.region_import_profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Region import runs to track loader executions
CREATE TABLE IF NOT EXISTS public.region_import_runs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    profile_id UUID REFERENCES public.region_import_profiles(id) ON DELETE SET NULL,
    region_id UUID REFERENCES public.regions(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'running',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT TIMEZONE('utc', NOW()),
    completed_at TIMESTAMP WITH TIME ZONE,
    restaurants_processed INTEGER DEFAULT 0,
    dishes_generated INTEGER DEFAULT 0,
    log TEXT
);

CREATE INDEX IF NOT EXISTS idx_region_import_runs_profile_id ON public.region_import_runs(profile_id);
CREATE INDEX IF NOT EXISTS idx_region_import_runs_region_id ON public.region_import_runs(region_id);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    username TEXT UNIQUE,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

DROP TRIGGER IF EXISTS profiles_set_timestamp ON public.profiles;
CREATE TRIGGER profiles_set_timestamp
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Restaurants table
CREATE TABLE IF NOT EXISTS public.restaurants (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    region_id UUID REFERENCES public.regions(id) ON DELETE CASCADE,
    place_id TEXT NOT NULL,
    source_provider TEXT,
    source_place_id TEXT,
    source_status TEXT,
    last_seen_at TIMESTAMP WITH TIME ZONE,
    tracked BOOLEAN NOT NULL DEFAULT FALSE,
    tracked_at TIMESTAMP WITH TIME ZONE,
    name TEXT NOT NULL,
    description TEXT,
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    cuisine_type TEXT,
    price_range TEXT,
    image_url TEXT,
    rating DECIMAL(3, 2),
    review_count INTEGER,
    website_url TEXT,
    phone_number TEXT,
    menu_url TEXT,
    menu_source TEXT,
    menu_last_sync_at TIMESTAMP WITH TIME ZONE,
    menu_hidden BOOLEAN NOT NULL DEFAULT false,
    menu_change_reason TEXT,
    photo_gallery JSONB,
    review_summary JSONB,
    -- Google Places API metadata
    serves_beer BOOLEAN,
    serves_wine BOOLEAN,
    serves_vegetarian BOOLEAN,
    good_for_children BOOLEAN,
    wheelchair_accessible BOOLEAN,
    takeout BOOLEAN,
    delivery BOOLEAN,
    dine_in BOOLEAN,
    reservable BOOLEAN,
    place_types TEXT[],
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.restaurants
    DROP CONSTRAINT IF EXISTS restaurants_place_id_key;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES public.regions(id) ON DELETE CASCADE;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS source_provider TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS source_place_id TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS source_status TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS tracked BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS tracked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS cuisine_type TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS price_range TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS rating DECIMAL(3, 2);
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS review_count INTEGER;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS website_url TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_url TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_source TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_last_sync_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_change_reason TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS photo_gallery JSONB;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS review_summary JSONB;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS latitude DECIMAL(10, 8);
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS longitude DECIMAL(11, 8);
-- Google Places API metadata columns
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS serves_beer BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS serves_wine BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS serves_vegetarian BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS good_for_children BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS wheelchair_accessible BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS takeout BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS delivery BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS dine_in BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS reservable BOOLEAN;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS place_types TEXT[];
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS managed_by_profile_id UUID REFERENCES public.region_import_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS source_run_id UUID REFERENCES public.region_import_runs(id) ON DELETE SET NULL;
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS review_status public.review_status_enum NOT NULL DEFAULT 'pending';
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS review_notes TEXT;
-- Remove any rows with null place_id before setting NOT NULL constraint
DELETE FROM public.restaurants WHERE place_id IS NULL;
ALTER TABLE public.restaurants
    ALTER COLUMN place_id SET NOT NULL;
ALTER TABLE public.restaurants
    DROP CONSTRAINT IF EXISTS restaurants_region_place_unique;
ALTER TABLE public.restaurants
    ADD CONSTRAINT restaurants_region_place_unique UNIQUE (region_id, place_id);

CREATE INDEX IF NOT EXISTS idx_restaurants_region_id ON public.restaurants(region_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_place_id ON public.restaurants(place_id);
CREATE INDEX IF NOT EXISTS idx_restaurants_cuisine_type ON public.restaurants(cuisine_type);
CREATE INDEX IF NOT EXISTS idx_restaurants_tracked ON public.restaurants(tracked) WHERE tracked = true;
CREATE INDEX IF NOT EXISTS idx_restaurants_source_provider ON public.restaurants(source_provider);

DROP TRIGGER IF EXISTS restaurants_set_timestamp ON public.restaurants;
CREATE TRIGGER restaurants_set_timestamp
BEFORE UPDATE ON public.restaurants
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Menu sync jobs for tracked restaurants
CREATE TABLE IF NOT EXISTS public.menu_sync_jobs (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'queued',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    payload JSONB,
    queued_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE INDEX IF NOT EXISTS idx_menu_sync_jobs_restaurant_id ON public.menu_sync_jobs(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_menu_sync_jobs_status ON public.menu_sync_jobs(status);

DROP TRIGGER IF EXISTS menu_sync_jobs_set_timestamp ON public.menu_sync_jobs;
CREATE TRIGGER menu_sync_jobs_set_timestamp
BEFORE UPDATE ON public.menu_sync_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Dishes table
CREATE TABLE IF NOT EXISTS public.dishes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10, 2),
    image_url TEXT,
    cuisine_type TEXT,
    dish_type public.dish_type_enum DEFAULT 'other',
    google_place_id TEXT,
    google_photo_reference TEXT,
    dietary_tags TEXT[],
    source_type TEXT,
    source_review_id TEXT,
    source_photo_reference TEXT,
    confidence_score NUMERIC(4, 3),
    menu_section TEXT,
    review_excerpt TEXT,
    data_version INTEGER NOT NULL DEFAULT 1,
    source_checked_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    hidden BOOLEAN NOT NULL DEFAULT false,
    change_reason TEXT,
    source TEXT,
    captured_at TIMESTAMP WITH TIME ZONE,
    option_sets JSONB,
    completeness_score NUMERIC(5, 2),
    missing_fields JSONB,
    needs_manual_review BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    source_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS price DECIMAL(10, 2);
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS cuisine_type TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS dish_type public.dish_type_enum;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS google_photo_reference TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS dietary_tags TEXT[];
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
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS data_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source_checked_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS change_reason TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS captured_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS option_sets JSONB;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS managed_by_profile_id UUID REFERENCES public.region_import_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source_run_id UUID REFERENCES public.region_import_runs(id) ON DELETE SET NULL;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS review_status public.review_status_enum NOT NULL DEFAULT 'pending';
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS review_notes TEXT;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS completeness_score NUMERIC(5, 2);
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS missing_fields JSONB;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS needs_manual_review BOOLEAN DEFAULT false;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS is_published BOOLEAN DEFAULT false;
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS source_image_url TEXT;
-- Set name to NOT NULL if it's not already
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns 
               WHERE table_schema = 'public' 
               AND table_name = 'dishes' 
               AND column_name = 'name' 
               AND is_nullable = 'YES') THEN
        -- Remove any rows with null name before setting NOT NULL
        DELETE FROM public.dishes WHERE name IS NULL;
        ALTER TABLE public.dishes ALTER COLUMN name SET NOT NULL;
    END IF;
END $$;
ALTER TABLE public.dishes
    DROP CONSTRAINT IF EXISTS dishes_restaurant_name_unique;
ALTER TABLE public.dishes
    ADD CONSTRAINT dishes_restaurant_name_unique UNIQUE (restaurant_id, name);

CREATE INDEX IF NOT EXISTS idx_dishes_restaurant_id ON public.dishes(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_dishes_cuisine_type ON public.dishes(cuisine_type);

DROP TRIGGER IF EXISTS dishes_set_timestamp ON public.dishes;
CREATE TRIGGER dishes_set_timestamp
BEFORE UPDATE ON public.dishes
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- Dish version history for auditing and rollback
CREATE TABLE IF NOT EXISTS public.dish_versions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    dish_id UUID REFERENCES public.dishes(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL DEFAULT 1,
    payload JSONB NOT NULL,
    completeness_score NUMERIC(5, 2),
    missing_fields JSONB,
    needs_manual_review BOOLEAN DEFAULT false,
    is_published BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_dish_versions_unique ON public.dish_versions(dish_id, version_number);
CREATE INDEX IF NOT EXISTS idx_dish_versions_dish_id ON public.dish_versions(dish_id);

-- Review queue for human validation
CREATE TABLE IF NOT EXISTS public.data_review_queue (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    subject_type public.review_subject_enum NOT NULL,
    subject_id UUID NOT NULL,
    source_run_id UUID REFERENCES public.region_import_runs(id) ON DELETE SET NULL,
    status public.review_status_enum NOT NULL DEFAULT 'pending',
    priority INTEGER DEFAULT 0,
    reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(subject_type, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_data_review_queue_status ON public.data_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_data_review_queue_subject ON public.data_review_queue(subject_type, subject_id);

DROP TRIGGER IF EXISTS data_review_queue_set_timestamp ON public.data_review_queue;
CREATE TRIGGER data_review_queue_set_timestamp
BEFORE UPDATE ON public.data_review_queue
FOR EACH ROW
EXECUTE FUNCTION public.set_current_timestamp_updated_at();

-- User swipes/interactions table
CREATE TABLE IF NOT EXISTS public.swipes (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    dish_id UUID REFERENCES public.dishes(id) ON DELETE CASCADE,
    direction TEXT NOT NULL CHECK (direction IN ('like', 'pass')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_swipes_user_id ON public.swipes(user_id);
CREATE INDEX IF NOT EXISTS idx_swipes_dish_id ON public.swipes(dish_id);

-- User favorites table
CREATE TABLE IF NOT EXISTS public.favorites (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    dish_id UUID REFERENCES public.dishes(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, dish_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON public.favorites(user_id);

-- Restaurant memberships for limited admin access
CREATE TABLE IF NOT EXISTS public.restaurant_memberships (
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.restaurant_role_enum NOT NULL DEFAULT 'viewer',
    approved_by UUID REFERENCES auth.users(id),
    approved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    PRIMARY KEY (restaurant_id, user_id)
);

-- Global role assignments (e.g. admin, power user)
CREATE TABLE IF NOT EXISTS public.app_role_assignments (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role public.app_role_enum NOT NULL,
    granted_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    granted_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_import_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.region_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.data_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_role_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_versions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Profiles: Users can read all profiles, but only update their own
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Regions: Public read access, only service role can modify
DROP POLICY IF EXISTS "Regions are viewable by everyone" ON public.regions;
CREATE POLICY "Regions are viewable by everyone" ON public.regions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can insert regions" ON public.regions;
CREATE POLICY "Service role can insert regions" ON public.regions FOR INSERT WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can update regions" ON public.regions;
CREATE POLICY "Service role can update regions" ON public.regions FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can delete regions" ON public.regions;
CREATE POLICY "Service role can delete regions" ON public.regions FOR DELETE USING (auth.role() = 'service_role');

-- Restaurants: Public read access, service role modifications
DROP POLICY IF EXISTS "Restaurants are viewable by everyone" ON public.restaurants;
CREATE POLICY "Restaurants are viewable by everyone" ON public.restaurants FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can insert restaurants" ON public.restaurants;
CREATE POLICY "Service role can insert restaurants" ON public.restaurants FOR INSERT WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can update restaurants" ON public.restaurants;
CREATE POLICY "Service role can update restaurants" ON public.restaurants FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can delete restaurants" ON public.restaurants;
CREATE POLICY "Service role can delete restaurants" ON public.restaurants FOR DELETE USING (auth.role() = 'service_role');

-- Admins can update restaurants
DROP POLICY IF EXISTS "Admins can update restaurants" ON public.restaurants;
CREATE POLICY "Admins can update restaurants" ON public.restaurants
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.app_role_assignments
    WHERE user_id = auth.uid() AND role IN ('admin', 'power_user')
  )
);


-- Dishes: Public read access, service role modifications
DROP POLICY IF EXISTS "Dishes are viewable by everyone" ON public.dishes;
CREATE POLICY "Dishes are viewable by everyone" ON public.dishes FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can insert dishes" ON public.dishes;
CREATE POLICY "Service role can insert dishes" ON public.dishes FOR INSERT WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can update dishes" ON public.dishes;
CREATE POLICY "Service role can update dishes" ON public.dishes FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can delete dishes" ON public.dishes;
CREATE POLICY "Service role can delete dishes" ON public.dishes FOR DELETE USING (auth.role() = 'service_role');

-- Admins can update dishes
DROP POLICY IF EXISTS "Admins can update dishes" ON public.dishes;
CREATE POLICY "Admins can update dishes" ON public.dishes
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.app_role_assignments
    WHERE user_id = auth.uid() AND role IN ('admin', 'power_user')
  )
);

-- Dish versions: allow reading for auditing, managed by service role/admins
DROP POLICY IF EXISTS "Dish versions are viewable by everyone" ON public.dish_versions;
CREATE POLICY "Dish versions are viewable by everyone" ON public.dish_versions FOR SELECT USING (true);
DROP POLICY IF EXISTS "Service role can insert dish versions" ON public.dish_versions;
CREATE POLICY "Service role can insert dish versions" ON public.dish_versions FOR INSERT WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can update dish versions" ON public.dish_versions;
CREATE POLICY "Service role can update dish versions" ON public.dish_versions FOR UPDATE USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can delete dish versions" ON public.dish_versions;
CREATE POLICY "Service role can delete dish versions" ON public.dish_versions FOR DELETE USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Admins can update dish versions" ON public.dish_versions;
CREATE POLICY "Admins can update dish versions" ON public.dish_versions
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM public.app_role_assignments
    WHERE user_id = auth.uid() AND role IN ('admin', 'power_user')
  )
);


-- Swipes: Users can only see and create their own swipes
DROP POLICY IF EXISTS "Users can view own swipes" ON public.swipes;
CREATE POLICY "Users can view own swipes" ON public.swipes FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own swipes" ON public.swipes;
CREATE POLICY "Users can create own swipes" ON public.swipes FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can update own swipes" ON public.swipes;
CREATE POLICY "Users can update own swipes" ON public.swipes FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Favorites: Users can only see and manage their own favorites
DROP POLICY IF EXISTS "Users can view own favorites" ON public.favorites;
CREATE POLICY "Users can view own favorites" ON public.favorites FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can create own favorites" ON public.favorites;
CREATE POLICY "Users can create own favorites" ON public.favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS "Users can delete own favorites" ON public.favorites;
CREATE POLICY "Users can delete own favorites" ON public.favorites FOR DELETE USING (auth.uid() = user_id);

-- Region import profiles: service role only for now
DROP POLICY IF EXISTS "Service role can read import profiles" ON public.region_import_profiles;
CREATE POLICY "Service role can read import profiles" ON public.region_import_profiles FOR SELECT USING (auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role can manage import profiles" ON public.region_import_profiles;
CREATE POLICY "Service role can manage import profiles" ON public.region_import_profiles
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Region import runs: service role only
DROP POLICY IF EXISTS "Service role can access import runs" ON public.region_import_runs;
CREATE POLICY "Service role can access import runs" ON public.region_import_runs
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Data review queue: service role only (UI will proxy via Edge Functions)
DROP POLICY IF EXISTS "Service role can access review queue" ON public.data_review_queue;
CREATE POLICY "Service role can access review queue" ON public.data_review_queue
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Restaurant memberships: users can view own membership, service role manages
DROP POLICY IF EXISTS "Users can view own restaurant memberships" ON public.restaurant_memberships;
CREATE POLICY "Users can view own restaurant memberships" ON public.restaurant_memberships
  FOR SELECT USING (auth.uid() = user_id OR auth.role() = 'service_role');
DROP POLICY IF EXISTS "Service role manages restaurant memberships" ON public.restaurant_memberships;
CREATE POLICY "Service role manages restaurant memberships" ON public.restaurant_memberships
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- App role assignments: service role only + user read own
DROP POLICY IF EXISTS "Service role can manage app roles" ON public.app_role_assignments;
CREATE POLICY "Service role can manage app roles" ON public.app_role_assignments
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Users can read own app role" ON public.app_role_assignments;
CREATE POLICY "Users can read own app role" ON public.app_role_assignments
  FOR SELECT USING (auth.uid() = user_id);

-- Administrative function to trigger Edge Function refreshes via pg_cron or manual SQL
CREATE OR REPLACE FUNCTION public.request_region_refresh(region_id UUID, requested_by TEXT DEFAULT 'system')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  endpoint TEXT := current_setting('app.settings.refresh_region_endpoint', true);
  service_key TEXT := current_setting('app.settings.refresh_region_service_key', true);
  response JSONB;
  headers JSONB;
BEGIN
  IF endpoint IS NULL THEN
    RAISE EXCEPTION 'app.settings.refresh_region_endpoint is not configured';
  END IF;

  headers := jsonb_build_object('Content-Type', 'application/json');

  IF service_key IS NOT NULL THEN
    headers := headers || jsonb_build_object('Authorization', 'Bearer ' || service_key);
  END IF;

  UPDATE public.regions
    SET refresh_requested_at = timezone('utc', now()),
        status = 'queued'
    WHERE id = region_id;

  SELECT content::jsonb
    INTO response
    FROM net.http_post(
      url := endpoint,
      headers := headers,
      body := jsonb_build_object('regionId', region_id, 'requestedBy', requested_by)::text
    );

  RETURN COALESCE(response, '{}'::jsonb);
END;
$$;

-- Example pg_cron job (run daily at midnight UTC)
-- SELECT cron.schedule('refresh-san-francisco', '0 0 * * *', $$
--   SELECT public.request_region_refresh('<region-uuid>'::uuid, 'cron');
-- $$);

-- Group Finder Tables

CREATE TABLE IF NOT EXISTS public.groups (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT,
    created_by UUID REFERENCES auth.users(id),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(group_id, user_id)
);

-- To store "matches" or shared restaurant candidates
CREATE TABLE IF NOT EXISTS public.group_matches (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    matched_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(group_id, restaurant_id)
);

-- Enable RLS
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_matches ENABLE ROW LEVEL SECURITY;

-- Policies
-- Group: Members can see, creator can update/delete
DROP POLICY IF EXISTS "Members can view groups" ON public.groups;
CREATE POLICY "Members can view groups" ON public.groups
    FOR SELECT USING (
        auth.uid() IN (SELECT user_id FROM public.group_members WHERE group_id = id)
        OR created_by = auth.uid()
    );

DROP POLICY IF EXISTS "Users can create groups" ON public.groups;
CREATE POLICY "Users can create groups" ON public.groups
    FOR INSERT WITH CHECK (auth.uid() = created_by);

DROP POLICY IF EXISTS "Creator can update group" ON public.groups;
CREATE POLICY "Creator can update group" ON public.groups
    FOR UPDATE USING (auth.uid() = created_by);

-- Group Members: Members can see, anyone can join (if they have link/code - logic in app or function)
DROP POLICY IF EXISTS "Members can view group members" ON public.group_members;
CREATE POLICY "Members can view group members" ON public.group_members
    FOR SELECT USING (
        group_id IN (
            SELECT id FROM public.groups WHERE created_by = auth.uid()
            UNION
            SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can join groups" ON public.group_members;
CREATE POLICY "Users can join groups" ON public.group_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Group Matches: Members can view
DROP POLICY IF EXISTS "Members can view matches" ON public.group_matches;
CREATE POLICY "Members can view matches" ON public.group_matches
    FOR SELECT USING (
        group_id IN (
            SELECT id FROM public.groups WHERE created_by = auth.uid()
            UNION
            SELECT group_id FROM public.group_members WHERE user_id = auth.uid()
        )
    );
