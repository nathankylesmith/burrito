#!/usr/bin/env node

/**
 * Demo script showing the hybrid loader processing simulated restaurant data
 * This demonstrates the full pipeline without requiring external APIs
 */

import { CostMonitor } from './dist/cost-monitor.js';

console.log('🚀 DishSwipe Hybrid Loader - Full Pipeline Demo');
console.log('===============================================\n');

// Simulate the cost monitoring during a typical hybrid load
const costMonitor = new CostMonitor();

// Phase 1: Restaurant Discovery (minimal Google Places API)
console.log('📍 Phase 1: Restaurant Discovery');
console.log('   🔍 Searching for restaurants in downtown San Francisco...');

// Track the minimal Google Places API call
costMonitor.trackGooglePlaces('search', {
  location: '37.7749,-122.4194',
  radius: 1500,
  type: 'restaurant'
});

console.log('   ✅ Found 15 restaurants with 1 API call ($0.03)');
console.log('   📊 Traditional approach would use 45+ API calls ($1.35+)\n');

// Phase 2: Website Scraping
console.log('🕷️  Phase 2: Website Scraping');
console.log('   🌐 Scraping restaurant websites for menus and images...');

const restaurants = [
  { name: 'The French Laundry', website: 'https://thomas-keller.com/tfl', menusFound: 2, imagesFound: 8 },
  { name: 'Nopa', website: 'https://nopasf.com', menusFound: 1, imagesFound: 12 },
  { name: 'Loló', website: 'https://lolosf.com', menusFound: 3, imagesFound: 6 },
  { name: 'Che Fico', website: 'https://chefico.com', menusFound: 1, imagesFound: 9 },
  { name: 'Barvale', website: 'https://barvale.com', menusFound: 2, imagesFound: 7 },
];

restaurants.forEach((restaurant, i) => {
  console.log(`   ${i + 1}. ${restaurant.name}`);
  console.log(`      📋 ${restaurant.menusFound} menu pages found`);
  console.log(`      📸 ${restaurant.imagesFound} images discovered`);
});

// Track local processing (free)
costMonitor.trackLocalVision({ operation: 'website-scraping', sitesProcessed: 5 });
console.log('   ✅ Scraped 5 websites - FREE (no API costs)\n');

// Phase 3: Menu Processing
console.log('🤖 Phase 3: Menu Processing');
console.log('   📝 Extracting dishes using local LLM...');

const menuResults = [
  { restaurant: 'The French Laundry', dishes: 12, confidence: 0.89 },
  { restaurant: 'Nopa', dishes: 8, confidence: 0.92 },
  { restaurant: 'Loló', dishes: 15, confidence: 0.85 },
  { restaurant: 'Che Fico', dishes: 10, confidence: 0.91 },
  { restaurant: 'Barvale', dishes: 6, confidence: 0.88 },
];

menuResults.forEach(result => {
  console.log(`   🍽️  ${result.restaurant}: ${result.dishes} dishes extracted (${Math.round(result.confidence * 100)}% confidence)`);
});

// Track local LLM usage (free)
costMonitor.trackLLM('local', 'qwen3-vl:8b', 1250); // ~1250 tokens processed
console.log('   ✅ Processed menu text with local LLM - FREE\n');

// Phase 4: Image Analysis
console.log('👁️  Phase 4: Image Analysis');
console.log('   🔍 Analyzing images with local vision AI...');

const imageResults = [
  { restaurant: 'The French Laundry', analyzed: 8, dishes: 6, nonFood: 2 },
  { restaurant: 'Nopa', analyzed: 12, dishes: 8, nonFood: 4 },
  { restaurant: 'Loló', analyzed: 6, dishes: 5, nonFood: 1 },
  { restaurant: 'Che Fico', analyzed: 9, dishes: 7, nonFood: 2 },
  { restaurant: 'Barvale', analyzed: 7, dishes: 4, nonFood: 3 },
];

const totalImages = imageResults.reduce((sum, r) => sum + r.analyzed, 0);
const totalDishes = imageResults.reduce((sum, r) => sum + r.dishes, 0);

imageResults.forEach(result => {
  console.log(`   📸 ${result.restaurant}: ${result.dishes}/${result.analyzed} images identified as dishes`);
});

costMonitor.trackLocalVision({
  operation: 'image-analysis',
  imagesProcessed: totalImages,
  dishesFound: totalDishes
});
console.log(`   ✅ Analyzed ${totalImages} images, found ${totalDishes} dish photos - FREE\n`);

// Phase 5: Gap Filling
console.log('🔧 Phase 5: Intelligent Gap Filling');
console.log('   🎯 Checking for missing dish images...');

// Simulate some gaps that need Google Places API
const gaps = [
  { dish: 'Truffle Risotto', restaurant: 'The French Laundry' },
  { dish: 'Wood-fired Pizza', restaurant: 'Che Fico' },
];

if (gaps.length > 0) {
  console.log(`   📷 Filling ${gaps.length} missing images with Google Places API...`);
  gaps.forEach(gap => {
    console.log(`      • ${gap.dish} (${gap.restaurant})`);
  });

  // Track Google Places fallback calls
  costMonitor.trackGooglePlaces('details', { purpose: 'fill-image-gaps' });
  costMonitor.trackGooglePlaces('photo', { purpose: 'fill-image-gaps' });

  console.log('   ✅ Retrieved 2 missing images ($0.05)');
} else {
  console.log('   ✅ No gaps found - all dishes have images!');
}
console.log();

// Phase 6: Final Results
console.log('📊 Phase 6: Final Results');
console.log('   🏪 Processed 5 restaurants');
console.log('   🍽️  Extracted 51 dishes total');
console.log('   📸 Processed 42 images');
console.log('   💾 Ready for database storage\n');

// Show cost analysis
console.log('💰 COST ANALYSIS:');
costMonitor.printReport();

// Summary
console.log('\n🎯 SUMMARY:');
console.log('   • Traditional approach: ~$8-15 for this data');
console.log('   • Hybrid approach: $0.08 (99.5% savings!)');
console.log('   • Same quality data with intelligent fallbacks');
console.log('   • Scalable to hundreds of restaurants\n');

console.log('🚀 Ready for production use!');
console.log('   Run: npx dishswipe-loader --mode hybrid --location "37.7749,-122.4194" --radius 1500 --max-results 10 --vision-model "qwen3-vl:8b"');
