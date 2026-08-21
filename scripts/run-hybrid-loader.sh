#!/bin/bash

# DishSwipe Hybrid Loader - Cost-Effective Restaurant & Dish Discovery
# This script demonstrates the hybrid approach that minimizes API costs

set -e

echo "🍽️  DishSwipe Hybrid Loader"
echo "============================"
echo

# Check if Ollama is running
echo "🔍 Checking Ollama status..."
if curl -s http://127.0.0.1:11434/api/tags > /dev/null 2>&1; then
    echo "✅ Ollama is running"
else
    echo "❌ Ollama is not running. Please start it with: ollama serve"
    echo "   And pull the vision model with: ollama pull llava:latest"
    exit 1
fi

# Check environment variables
echo
echo "🔍 Checking environment variables..."
if [ -z "$SUPABASE_URL" ]; then
    echo "❌ SUPABASE_URL not set"
    exit 1
fi

if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "❌ SUPABASE_SERVICE_ROLE_KEY not set"
    exit 1
fi

if [ -z "$GOOGLE_MAPS_API_KEY" ]; then
    echo "⚠️  GOOGLE_MAPS_API_KEY not set (hybrid mode will work but won't fall back to Google Places API)"
fi

echo "✅ Environment variables OK"
echo

# Run the hybrid loader
echo "🚀 Starting hybrid restaurant loading..."
echo "📍 Location: San Francisco (37.7749, -122.4194)"
echo "📏 Radius: 1500 meters (~1 mile)"
echo "🏪 Max restaurants: 3 (for demo)"
echo

cd packages/loader

# Run in dry-run mode first for testing
echo "🧪 Running in dry-run mode (no data will be saved)..."
npx ts-node src/cli.ts \
    --mode hybrid \
    --location "37.7749,-122.4194" \
    --radius 1500 \
    --max-results 3 \
    --vision-model "llava:latest" \
    --region-name "SF Hybrid Demo" \
    --dry-run \
    --verbose

echo
echo "🎉 Hybrid loading complete!"
echo
echo "💰 COST ANALYSIS:"
echo "   • Google Places API: ~$0.03 (1 search call)"
echo "   • Local Vision AI: FREE (Ollama)"
echo "   • Website Scraping: FREE"
echo "   • Total Cost: ~$0.03 vs $5-15 with traditional approach"
echo
echo "📊 To run for real (save data to database):"
echo "   Remove --dry-run from the command above"
echo
echo "🔧 To process more restaurants:"
echo "   Increase --max-results (e.g., --max-results 20)"
echo
echo "🌐 To enable Google Places fallbacks:"
echo "   Set GOOGLE_MAPS_API_KEY environment variable"
echo
echo "📖 See packages/loader/README-hybrid.md for full documentation"
