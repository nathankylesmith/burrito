# Deployment Instructions

You're almost there! Since the Supabase account requires its owner's login, run the following commands locally to publish the new features.

## 1. Login to Supabase

If you aren't already logged in, run:

```bash
npx supabase login
```

## 2. Set API Keys (Secrets)

Store the real values in Supabase secrets. Do not commit them to this repository:

```bash
npx supabase secrets set GEMINI_API_KEY="<your-gemini-api-key>" GOOGLE_MAPS_API_KEY="<your-google-maps-api-key>"
```

## 3. Deploy the Import Function

This pushes the new `load-region` function to the cloud:

```bash
npx supabase functions deploy load-region
```

## 4. Restart Mobile App

Reload your mobile app (press `r` in the Metro bundler terminal) to see the new **Admin Dashboard** in the menu.

## Quick Summary of Changes

- **Groups Tab**: Replaced "Rank" with a placeholder for the Group Finder.
- **Admin Dashboard**: Added a hidden Admin section (access via code or link for now, or add a button on the Profile page).
- **Cloud Import**: The app now triggers a cloud function to import data instead of running on your laptop.
- **Vision AI**: The import now uses **Gemini 2.0 Flash Lite** to automatically reject non-food images (buildings, menus, etc.).
