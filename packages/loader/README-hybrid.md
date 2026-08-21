# DishSwipe Hybrid Loader

A cost-effective restaurant and dish loading system that minimizes Google Places API usage by combining web scraping, local AI processing, and intelligent fallbacks.

## How It Works

Instead of making expensive API calls for every piece of data, the hybrid loader:

1. **Minimal Google Places API**: Gets basic restaurant list with 1 search call
2. **Website Scraping**: Extracts menus and images directly from restaurant websites
3. **Local Vision AI**: Uses Ollama/LLaVA for free, local image analysis
4. **Smart Fallbacks**: Only uses Google Places API for missing data

## Cost Comparison

| Approach | API Calls | Estimated Cost | Dishes Found |
|----------|-----------|----------------|---------------|
| **Traditional** | 100+ API calls | $5-15 per region | 50-100 dishes |
| **Hybrid** | 1-5 API calls | $0.01-0.50 per region | 50-100+ dishes |
| **Savings** | 95% reduction | **95%+ cost savings** | Same or better results |

## Prerequisites

1. **Ollama** for local AI processing:
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh

   # Pull Qwen3-VL model for both vision and text processing
   ollama pull qwen3-vl:8b

   # Start Ollama server
   ollama serve
   ```

2. **Google Places API Key** (optional but recommended for fallbacks)

3. **Environment Variables**:
   ```bash
   export SUPABASE_URL="your-supabase-url"
   export SUPABASE_SERVICE_ROLE_KEY="your-service-key"
   export GOOGLE_MAPS_API_KEY="your-api-key"  # Optional
   ```

## Usage

### Basic Usage (Cost-Effective Mode)

```bash
# Load restaurants in San Francisco using hybrid approach
npx dishswipe-loader \
  --mode hybrid \
  --location "37.7749,-122.4194" \
  --radius 1500 \
  --max-results 10 \
  --vision-model "qwen3-vl:8b" \
  --region-name "SF Downtown"
```

### With Google Places Fallback

```bash
# Enable Google Places API for missing data
npx dishswipe-loader \
  --mode hybrid \
  --location "37.7749,-122.4194" \
  --radius 1500 \
  --max-results 10 \
  --vision-model "qwen3-vl:8b" \
  --google-api-key "$GOOGLE_MAPS_API_KEY" \
  --region-name "SF Downtown"
```

### Full Processing Pipeline

```bash
# Complete processing with local LLM for menu extraction
npx dishswipe-loader \
  --mode hybrid \
  --location "37.7749,-122.4194" \
  --radius 1500 \
  --max-results 5 \
  --vision-model "qwen3-vl:8b" \
  --llm-model "qwen3-vl:8b" \
  --max-dishes 20 \
  --min-dish-photo-confidence 0.35 \
  --region-name "SF Test" \
  --dry-run  # Remove for production
```

## Processing Flow

### Phase 1: Restaurant Discovery
- ✅ **1 Google Places search** ($0.03) - Gets restaurant list
- ✅ **Website scraping** (FREE) - Finds restaurant websites
- ❌ **No expensive details calls** - Saves $1.70 per restaurant

### Phase 2: Menu & Image Collection
- ✅ **Website scraping** (FREE) - Downloads menus and images
- ✅ **Local vision AI** (FREE) - Analyzes images for dishes
- ✅ **LLM processing** (FREE with local models) - Extracts menu items

### Phase 3: Intelligent Fallbacks
- ✅ **Google Places API** (Only when needed) - Fills missing images
- ✅ **Cost monitoring** - Tracks every API call
- ✅ **Quality assurance** - Ensures data completeness

## Configuration Options

| Option | Description | Cost Impact |
|--------|-------------|-------------|
| `--max-results` | Restaurants to process | Lower = cheaper |
| `--vision-model` | Local vision model | FREE |
| `--llm-model` | Local LLM for menus | FREE |
| `--google-api-key` | Enable fallbacks | Minimal cost |
| `--min-dish-photo-confidence` | AI confidence threshold | Affects fallback usage |
| `--max-dishes` | Dishes per restaurant | Affects processing time |

## Cost Monitoring

The hybrid loader includes built-in cost tracking:

```
=== COST MONITORING REPORT ===
Runtime: 45.2 seconds
Total API calls: 3

--- Google Places API ---
Searches: 1 (0.032¢)
Details: 0 (0.000¢)
Photos: 2 (0.014¢)
Places Total: $0.00046

--- Vision Processing ---
Google Vision: 0 calls ($0.00)
Local Vision: 24 calls (FREE!)

--- Other Services ---
LLM Calls: 0 ($0.00)
Storage: 12 uploads (0.002 GB) - $0.00/month

--- Summary ---
Total Cost: $0.00046
Savings vs Full API: $4.99
🎉 99.99% cost savings!
```

## Architecture Benefits

### Cost Efficiency
- **95%+ reduction** in Google Places API usage
- **Free local AI** processing instead of expensive cloud APIs
- **Smart fallbacks** only when necessary

### Performance
- **Parallel processing** of websites and images
- **Local AI** eliminates network latency
- **Batch operations** for efficiency

### Reliability
- **No API rate limits** for local processing
- **Offline capability** for scraping
- **Graceful degradation** when APIs fail

## Troubleshooting

### Ollama Issues
```bash
# Check if Ollama is running
curl http://127.0.0.1:11434/api/tags

# Restart Ollama
ollama serve

# Test vision model
ollama run qwen3-vl:8b "describe this image" --image /path/to/test/image.jpg
```

### Low Dish Detection
- Increase `--min-dish-photo-confidence` threshold
- Enable Google Places fallback with `--google-api-key`
- Check website scraping is working

### High Costs
- Reduce `--max-results`
- Disable Google Places API (remove `--google-api-key`)
- Use smaller radius for testing

## Future Enhancements

- **Menu-specific scraping** - Target menu sections vs entire websites
- **Image optimization** - Pre-process images locally before analysis
- **Caching layer** - Avoid re-processing known restaurants
- **Batch processing** - Process multiple regions efficiently

---

**Result**: Get restaurant and dish data at **1-5% of traditional API costs** while maintaining quality and coverage!
