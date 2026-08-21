import type { DishTemplate } from './types.js';

const MATCH_THRESHOLD = 0.45;

const normalize = (value: string | null | undefined) =>
  (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = (value: string) => {
  if (!value) return new Set<string>();
  return new Set(value.split(' ').filter(Boolean));
};

const jaccard = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let intersection = 0;
  a.forEach((token) => {
    if (b.has(token)) {
      intersection += 1;
    }
  });
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
};

const bigrams = (value: string) => {
  const grams: string[] = [];
  for (let i = 0; i < value.length - 1; i += 1) {
    grams.push(value.slice(i, i + 2));
  }
  return grams;
};

const diceCoefficient = (a: string, b: string) => {
  if (!a || !b) return 0;
  const aBigrams = bigrams(a);
  const bBigrams = bigrams(b);
  if (aBigrams.length === 0 || bBigrams.length === 0) {
    return 0;
  }
  let matches = 0;
  const bMap = new Map<string, number>();
  bBigrams.forEach((gram) => bMap.set(gram, (bMap.get(gram) ?? 0) + 1));

  aBigrams.forEach((gram) => {
    const count = bMap.get(gram) ?? 0;
    if (count > 0) {
      matches += 1;
      bMap.set(gram, count - 1);
    }
  });

  return (2 * matches) / (aBigrams.length + bBigrams.length);
};

const longestSubstringRatio = (a: string, b: string) => {
  if (!a || !b) return 0;
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  let maxLen = 0;

  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      if (a[i - 1] === b[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1] + 1;
        maxLen = Math.max(maxLen, matrix[i][j]);
      }
    }
  }

  return maxLen / Math.max(a.length, b.length);
};

const computeNameScore = (target: string, candidate: string | null | undefined) => {
  const normalizedTarget = normalize(target);
  const normalizedCandidate = normalize(candidate);

  if (!normalizedTarget || !normalizedCandidate) {
    return 0;
  }

  if (normalizedTarget === normalizedCandidate) {
    return 1;
  }

  const tokenScore = jaccard(tokenSet(normalizedTarget), tokenSet(normalizedCandidate));
  const diceScore = diceCoefficient(normalizedTarget, normalizedCandidate);
  const substringScore = longestSubstringRatio(normalizedTarget, normalizedCandidate);

  return Math.max(tokenScore, diceScore, substringScore);
};

const mergeReviewAndPhotoDish = (reviewDish: DishTemplate, photoDish: DishTemplate): DishTemplate => {
  const descriptionParts = [reviewDish.description, photoDish.photo_insight?.caption].filter(Boolean);

  return {
    ...reviewDish,
    image_url: photoDish.image_url ?? reviewDish.image_url,
    googlePhotoReference: photoDish.googlePhotoReference ?? reviewDish.googlePhotoReference,
    source_photo_reference: photoDish.source_photo_reference ?? reviewDish.source_photo_reference,
    price: reviewDish.price ?? photoDish.price,
    cuisine_type: reviewDish.cuisine_type ?? photoDish.cuisine_type,
    dietary_tags: reviewDish.dietary_tags ?? photoDish.dietary_tags ?? null,
    confidence: Math.max(reviewDish.confidence ?? 0, photoDish.confidence ?? 0),
    description: descriptionParts.join(' ').trim() || reviewDish.description,
    photo_insight: photoDish.photo_insight ?? reviewDish.photo_insight ?? null,
    photo_classification: photoDish.photo_classification ?? reviewDish.photo_classification ?? null,
    prehydrated: true,
  };
};

const candidateNames = (dish: DishTemplate) => {
  const names = new Set<string>();
  if (dish.name) names.add(dish.name);
  if (dish.photo_insight?.dish_guess) names.add(dish.photo_insight.dish_guess);
  dish.photo_insight?.alternate_names?.forEach((alias) => {
    if (alias) names.add(alias);
  });
  return Array.from(names);
};

const computeDishMatchScore = (reviewDish: DishTemplate, photoDish: DishTemplate) => {
  const names = candidateNames(photoDish);
  if (names.length === 0) {
    return 0;
  }
  return names.reduce((best, candidate) => Math.max(best, computeNameScore(reviewDish.name, candidate)), 0);
};

export const matchReviewDishesToPhotos = (
  reviewDishes: DishTemplate[],
  photoDishes: DishTemplate[]
): {
  matchedReviews: DishTemplate[];
  remainingPhotos: DishTemplate[];
} => {
  if (reviewDishes.length === 0 || photoDishes.length === 0) {
    return {
      matchedReviews: [],
      remainingPhotos: photoDishes,
    };
  }

  const usedPhotoIndexes = new Set<number>();
  const matchedReviews: DishTemplate[] = [];

  for (const reviewDish of reviewDishes) {
    let bestMatch: { score: number; index: number; photoDish: DishTemplate } | null = null;

    for (let index = 0; index < photoDishes.length; index += 1) {
      if (usedPhotoIndexes.has(index)) {
        continue;
      }

      const photoDish = photoDishes[index];
      const score = computeDishMatchScore(reviewDish, photoDish);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { score, index, photoDish };
      }
    }

    if (bestMatch && bestMatch.score >= MATCH_THRESHOLD) {
      usedPhotoIndexes.add(bestMatch.index);
      matchedReviews.push(mergeReviewAndPhotoDish(reviewDish, bestMatch.photoDish));
    }
  }

  const remainingPhotos = photoDishes.filter((_, index) => !usedPhotoIndexes.has(index));

  return {
    matchedReviews,
    remainingPhotos,
  };
};


