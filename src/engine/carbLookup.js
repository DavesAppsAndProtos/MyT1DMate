/**
 * My T1D Mate — Carb Lookup Engine
 * Open Food Facts API. Free. No key. No cost.
 *
 * Session 3 fix: score products by name match quality before picking.
 * Exact match > starts with query > contains all words > contains any word > first with carbs.
 */

const TEXT_SEARCH_URL = 'https://world.openfoodfacts.org/cgi/search.pl';

/**
 * Score how well a product name matches the query.
 * Higher = better match. Returns 0 if no carb data.
 */
const scoreMatch = (productName, query) => {
  if (!productName) return 0;
  const name = productName.toLowerCase().trim();
  const q = query.toLowerCase().trim();

  if (name === q) return 100;                          // exact match
  if (name.startsWith(q)) return 80;                  // starts with query
  if (name.includes(q)) return 60;                    // contains full query

  // All query words present in name
  const words = q.split(/\s+/);
  if (words.every((w) => name.includes(w))) return 40;

  // At least one query word present
  if (words.some((w) => name.includes(w))) return 20;

  return 5; // has carb data but name is a poor match
};

/**
 * Search for a food by name.
 * Returns { name, carbsPer100g, servingSize, servingCarbs } or null.
 */
export const lookupFood = async (query) => {
  const params = new URLSearchParams({
    search_terms: query,
    json: '1',
    page_size: '10',  // fetch more so we have better candidates to rank
    fields: 'product_name,nutriments,serving_size',
  });

  const url = `${TEXT_SEARCH_URL}?${params.toString()}`;

  const response = await fetch(url);
  if (!response.ok) throw new Error('Food Facts API unreachable');

  const data = await response.json();

  if (!data.products || data.products.length === 0) return null;

  // Score all products that have usable carb data, pick the best match
  let best = null;
  let bestScore = -1;

  for (const product of data.products) {
    const carbs = product.nutriments?.['carbohydrates_100g'];
    if (carbs === undefined || carbs === null) continue;

    const score = scoreMatch(product.product_name, query);
    if (score > bestScore) {
      bestScore = score;
      best = { product, carbs };
    }
  }

  if (!best) return null;

  const { product, carbs } = best;
  const name = product.product_name || query;
  const servingSize = product.serving_size || null;

  let servingCarbs = null;
  if (servingSize) {
    const grams = parseServingGrams(servingSize);
    if (grams) {
      servingCarbs = Math.round((carbs / 100) * grams * 10) / 10;
    }
  }

  return {
    name: cleanName(name),
    carbsPer100g: Math.round(carbs * 10) / 10,
    servingSize,
    servingCarbs,
  };
};

/**
 * Calculate carbs for a given portion in grams.
 */
export const carbsForPortion = (carbsPer100g, portionGrams) => {
  return Math.round((carbsPer100g / 100) * portionGrams * 10) / 10;
};

// ── Helpers ──────────────────────────────────────────────

const parseServingGrams = (servingStr) => {
  if (!servingStr) return null;
  const match = servingStr.match(/(\d+(\.\d+)?)\s*g/i);
  return match ? parseFloat(match[1]) : null;
};

const cleanName = (name) => {
  return name
    .trim()
    .slice(0, 60)
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// ── Barcode lookup ────────────────────────────────────────

const BARCODE_URL = 'https://world.openfoodfacts.org/api/v0/product';

/**
 * Look up a product by barcode (EAN-13, EAN-8, UPC-A, UPC-E).
 * Returns { name, carbsPer100g, servingSize, servingCarbs } or null.
 */
export const lookupFoodByBarcode = async (barcode) => {
  const url = `${BARCODE_URL}/${encodeURIComponent(barcode)}.json`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'MyT1DMate/1.0 (contact@t1dmate.app)' },
  });

  if (!response.ok) throw new Error('Food Facts API unreachable');

  const data = await response.json();

  // status 0 = product not found
  if (data.status !== 1 || !data.product) return null;

  const product = data.product;
  const carbs = product.nutriments?.['carbohydrates_100g'];

  if (carbs === undefined || carbs === null) return null;

  const name = product.product_name || product.product_name_en || barcode;
  const servingSize = product.serving_size || null;

  let servingCarbs = null;
  if (servingSize) {
    const grams = parseServingGrams(servingSize);
    if (grams) {
      servingCarbs = Math.round((carbs / 100) * grams * 10) / 10;
    }
  }

  return {
    name: cleanName(name),
    carbsPer100g: Math.round(carbs * 10) / 10,
    servingSize,
    servingCarbs,
  };
};
