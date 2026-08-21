-- Add audit fields to restaurants for menu tracking
ALTER TABLE public.restaurants
    ADD COLUMN IF NOT EXISTS menu_source TEXT,
    ADD COLUMN IF NOT EXISTS menu_last_sync_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS menu_hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS menu_change_reason TEXT;

-- Add audit and versioning fields to dishes for menu syncing
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS data_version INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS source_checked_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS change_reason TEXT,
    ADD COLUMN IF NOT EXISTS source TEXT;
