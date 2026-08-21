#!/usr/bin/env node

/**
 * Test script for the hybrid restaurant loader
 * This demonstrates the cost-effective approach using minimal Google Places API
 */

import { createClient } from '@supabase/supabase-js';
import { loadRestaurantsHybrid } from './dist/index.js';
import { createLogger } from './dist/logger.js';

// Load environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const googleApiKey = process.env.GOOGLE_MAPS_API_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing required environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

async function testHybridLoader() {
  console.log('🧪 Testing Hybrid Restaurant Loader');
  console.log('=====================================\n');

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const logger = createLogger();

  try {
    console.log('📍 Testing hybrid restaurant loading with mock data');
    console.log('🔧 This demonstrates the cost-effective approach\n');

    // First test: Show how it handles missing Google API gracefully
    console.log('🧪 Test 1: Graceful fallback when Google API unavailable');
    console.log('   (This is the current scenario - no API key provided)\n');

    const result1 = await loadRestaurantsHybrid({
      supabase,
      location: { lat: 37.7749, lng: -122.4194 }, // San Francisco
      radius: 32000, // 20 miles in meters
      maxRestaurants: 5,
      regionName: 'San Francisco Test',
      dryRun: true,
      logger,
      // Intentionally not providing visionModel to test graceful degradation
      maxDishesPerRestaurant: 3,
      minDishPhotoConfidence: 0.35,
    });

    console.log('\n✅ Test 1 completed - Shows graceful API fallback\n');

    // Second test: Show what would happen with Google API
    if (googleApiKey) {
      console.log('🧪 Test 2: Full pipeline with Google Places API');
      const result2 = await loadRestaurantsHybrid({
        supabase,
        location: { lat: 37.7749, lng: -122.4194 },
        radius: 1500, // Smaller radius for testing
        maxRestaurants: 2, // Just 2 restaurants for demo
        regionName: 'SF Small Test',
        dryRun: true,
        logger,
        visionModel: 'llava:latest',
        visionEndpoint: 'http://127.0.0.1:11434',
        googleApiKey: googleApiKey,
        maxDishesPerRestaurant: 3,
        minDishPhotoConfidence: 0.35,
      });
      console.log('\n✅ Test 2 completed - Shows full pipeline\n');
    }

    const result = result1; // Use the first test result for reporting

    console.log('\n✅ Hybrid loading completed!');
    console.log(`📊 Processed ${result.restaurants?.length || 0} restaurants`);

    if (result.costReport) {
      console.log('\n💰 COST BREAKDOWN:');
      console.log(`   Google Places API: $${result.costReport.googlePlaces.totalCost.toFixed(4)}`);
      console.log(`   Local Vision: $${result.costReport.localVision.totalCost.toFixed(4)} (FREE!)`);
      console.log(`   Total Cost: $${result.costReport.totalCost.toFixed(4)}`);
      if (result.costReport.savingsVsFullApi > 0) {
        console.log(`   Savings vs Full API: $${result.costReport.savingsVsFullApi.toFixed(4)}`);
      }
    }

    // Show sample results
    if (result.restaurants && result.restaurants.length > 0) {
      console.log('\n🍽️  SAMPLE RESULTS:');
      result.restaurants.slice(0, 2).forEach((restaurant, i) => {
        console.log(`   ${i + 1}. ${restaurant.restaurant?.name || 'Unknown'}`);
        console.log(`      Dishes found: ${restaurant.dishes || 0}`);
        console.log(`      Images processed: ${restaurant.imagesProcessed || 0}`);
        console.log(`      Dishes with images: ${restaurant.dishesWithImages || 0}`);
      });
    }

    console.log('\n🎯 KEY BENEFITS:');
    console.log('   • Minimal Google Places API usage');
    console.log('   • Free local vision processing');
    console.log('   • Website scraping for rich menu data');
    console.log('   • Intelligent fallback system');
    console.log('   • Detailed cost tracking');

    console.log('\n📝 NEXT STEPS:');
    console.log('   1. Set up Ollama with LLaVA model for local vision');
    console.log('   2. Run without dry-run to save data to database');
    console.log('   3. Monitor costs and adjust parameters as needed');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 TROUBLESHOOTING:');
    console.log('   • Make sure Ollama is running: `ollama serve`');
    console.log('   • Pull LLaVA model: `ollama pull llava:latest`');
    console.log('   • Check Google Places API key if using fallbacks');
    process.exit(1);
  }
}

// Run the test
testHybridLoader().catch(console.error);
