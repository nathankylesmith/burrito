export interface CompletenessInput {
  imageUrl?: string | null;
  description?: string | null;
  price?: number | null;
  optionSets?: Array<unknown> | null;
}

export interface CompletenessResult {
  score: number;
  missingFields: {
    image: boolean;
    description: boolean;
    price: boolean;
    options: boolean;
  };
  needsManualReview: boolean;
}

const DESIRED_DESCRIPTION_LENGTH = 20;

export const computeDishCompleteness = (input: CompletenessInput): CompletenessResult => {
  const missingFields = {
    image: !input.imageUrl,
    description: !(input.description && input.description.trim().length >= DESIRED_DESCRIPTION_LENGTH),
    price: !(typeof input.price === 'number' && Number.isFinite(input.price) && input.price > 0),
    options: !(Array.isArray(input.optionSets) && input.optionSets.length > 0),
  };

  const penalties = {
    image: 30,
    description: 25,
    price: 25,
    options: 20,
  } as const;

  let score = 100;
  (Object.keys(missingFields) as Array<keyof typeof missingFields>).forEach((key) => {
    if (missingFields[key]) {
      score -= penalties[key];
    }
  });

  score = Math.max(0, Math.min(100, Math.round(score)));
  const needsManualReview = score < 70 || missingFields.image || missingFields.price;

  return { score, missingFields, needsManualReview };
};

export const summarizeMissingFields = (missing: CompletenessResult['missingFields']): string[] => {
  const labels: Record<keyof CompletenessResult['missingFields'], string> = {
    image: 'Image',
    description: 'Description',
    price: 'Price',
    options: 'Option sets',
  };

  return (Object.keys(missing) as Array<keyof CompletenessResult['missingFields']>)
    .filter((key) => missing[key])
    .map((key) => labels[key]);
};
