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
export declare const computeDishCompleteness: (input: CompletenessInput) => CompletenessResult;
export declare const summarizeMissingFields: (missing: CompletenessResult["missingFields"]) => string[];
