interface ApiCall {
    service: 'google-places' | 'google-vision' | 'local-vision' | 'llm' | 'storage';
    operation: string;
    timestamp: Date;
    cost?: number;
    metadata?: Record<string, any>;
}
interface CostBreakdown {
    googlePlaces: {
        searches: number;
        details: number;
        photos: number;
        totalCost: number;
    };
    googleVision: {
        calls: number;
        totalCost: number;
    };
    localVision: {
        calls: number;
        totalCost: number;
    };
    llm: {
        calls: number;
        totalCost: number;
    };
    storage: {
        uploads: number;
        bandwidth: number;
        totalCost: number;
    };
    totalCost: number;
    savingsVsFullApi: number;
}
export declare class CostMonitor {
    private calls;
    private startTime;
    constructor();
    /**
     * Track an API call for cost monitoring
     */
    trackCall(call: Omit<ApiCall, 'timestamp'>): void;
    /**
     * Track Google Places API usage
     */
    trackGooglePlaces(operation: 'search' | 'details' | 'photo', metadata?: Record<string, any>): void;
    /**
     * Track Google Vision API usage
     */
    trackGoogleVision(metadata?: Record<string, any>): void;
    /**
     * Track local vision processing (typically free)
     */
    trackLocalVision(metadata?: Record<string, any>): void;
    /**
     * Track LLM API usage
     */
    trackLLM(provider: 'openai' | 'anthropic' | 'local', model: string, tokens?: number, metadata?: Record<string, any>): void;
    /**
     * Track storage usage
     */
    trackStorage(operation: 'upload' | 'download', sizeBytes: number, metadata?: Record<string, any>): void;
    /**
     * Generate cost breakdown report
     */
    generateReport(): CostBreakdown;
    /**
     * Estimate what it would cost to use Google Places API for everything
     */
    private estimateFullApiCost;
    /**
     * Print a human-readable cost report
     */
    printReport(): void;
    /**
     * Export raw call data for analysis
     */
    exportData(): ApiCall[];
    /**
     * Reset monitoring data
     */
    reset(): void;
}
export declare const globalCostMonitor: CostMonitor;
export {};
