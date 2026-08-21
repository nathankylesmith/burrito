const PRICE_RANGES = ['$', '$$', '$$$', '$$$$', '$$$$$'];
const DISH_BASE_PRICES = [12, 18, 28, 42, 55];
export const titleCase = (value) => {
    return String(value || '')
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
};
export const deriveCuisines = (details) => {
    const servesCuisine = details?.serves_cuisine || details?.servesCuisine;
    if (Array.isArray(servesCuisine) && servesCuisine.length > 0) {
        return servesCuisine;
    }
    const nonCuisineTypes = new Set([
        'point_of_interest',
        'establishment',
        'food',
        'restaurant',
        'bar',
        'meal_takeaway',
        'meal_delivery',
        'night_club',
        'store',
        'bakery',
        'cafe',
    ]);
    return (details?.types || [])
        .filter((type) => !nonCuisineTypes.has(type))
        .map(titleCase)
        .slice(0, 3);
};
export const mapPriceLevelToRange = (priceLevel) => {
    if (typeof priceLevel !== 'number' || priceLevel < 0 || priceLevel >= PRICE_RANGES.length) {
        return null;
    }
    return PRICE_RANGES[priceLevel] || null;
};
export const mapPriceLevelToDishPrice = (priceLevel, variantIndex = 0) => {
    const base = typeof priceLevel === 'number' && priceLevel >= 0 && priceLevel < DISH_BASE_PRICES.length
        ? DISH_BASE_PRICES[priceLevel]
        : DISH_BASE_PRICES[1];
    return base + variantIndex * 3;
};
