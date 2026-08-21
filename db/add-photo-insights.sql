-- Adds storage for AI-generated dish photo insights
ALTER TABLE public.dishes
    ADD COLUMN IF NOT EXISTS photo_insight JSONB,
    ADD COLUMN IF NOT EXISTS photo_insight_model TEXT,
    ADD COLUMN IF NOT EXISTS photo_insight_confidence NUMERIC(4, 3),
    ADD COLUMN IF NOT EXISTS photo_is_dish BOOLEAN,
    ADD COLUMN IF NOT EXISTS photo_is_dish_confidence NUMERIC(4, 3),
    ADD COLUMN IF NOT EXISTS photo_tags TEXT[];

CREATE TABLE IF NOT EXISTS public.raw_place_photos (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    place_id TEXT NOT NULL,
    restaurant_id UUID REFERENCES public.restaurants(id) ON DELETE CASCADE,
    photo_reference TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    attribution TEXT,
    hash TEXT,
    storage_path TEXT,
    is_dish BOOLEAN,
    is_dish_confidence NUMERIC(4, 3),
    insight JSONB,
    insight_model TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(photo_reference)
);

CREATE INDEX IF NOT EXISTS idx_raw_place_photos_place_id ON public.raw_place_photos(place_id);
CREATE INDEX IF NOT EXISTS idx_raw_place_photos_restaurant_id ON public.raw_place_photos(restaurant_id);

