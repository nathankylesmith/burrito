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
    totalCost: number; // Usually $0
  };
  llm: {
    calls: number;
    totalCost: number;
  };
  storage: {
    uploads: number;
    bandwidth: number; // GB
    totalCost: number;
  };
  totalCost: number;
  savingsVsFullApi: number;
}

export class CostMonitor {
  private calls: ApiCall[] = [];
  private startTime: Date;

  constructor() {
    this.startTime = new Date();
  }

  /**
   * Track an API call for cost monitoring
   */
  trackCall(call: Omit<ApiCall, 'timestamp'>): void {
    const apiCall: ApiCall = {
      ...call,
      timestamp: new Date(),
    };
    this.calls.push(apiCall);
  }

  /**
   * Track Google Places API usage
   */
  trackGooglePlaces(operation: 'search' | 'details' | 'photo', metadata?: Record<string, any>): void {
    let cost = 0;

    // Google Places API pricing (per 1000 calls)
    switch (operation) {
      case 'search':
        cost = 32 / 1000; // $32 per 1000 Place Search calls
        break;
      case 'details':
        cost = 17 / 1000; // $17 per 1000 Place Details calls
        break;
      case 'photo':
        cost = 7 / 1000; // $7 per 1000 Place Photos calls
        break;
    }

    this.trackCall({
      service: 'google-places',
      operation,
      cost,
      metadata,
    });
  }

  /**
   * Track Google Vision API usage
   */
  trackGoogleVision(metadata?: Record<string, any>): void {
    // Gemini Pro Vision pricing: ~$0.0018 per image
    const cost = 0.0018;
    this.trackCall({
      service: 'google-vision',
      operation: 'analyze-image',
      cost,
      metadata,
    });
  }

  /**
   * Track local vision processing (typically free)
   */
  trackLocalVision(metadata?: Record<string, any>): void {
    this.trackCall({
      service: 'local-vision',
      operation: 'analyze-image',
      cost: 0, // Free with Ollama
      metadata,
    });
  }

  /**
   * Track LLM API usage
   */
  trackLLM(provider: 'openai' | 'anthropic' | 'local', model: string, tokens?: number, metadata?: Record<string, any>): void {
    let cost = 0;

    if (provider === 'local') {
      cost = 0; // Free with local models
    } else if (provider === 'openai' && tokens) {
      // GPT-4 pricing: ~$0.03 per 1K input tokens, $0.06 per 1K output tokens
      // Rough estimate: $0.045 per 1K tokens
      cost = (tokens / 1000) * 0.045;
    }

    this.trackCall({
      service: 'llm',
      operation: `${provider}-${model}`,
      cost,
      metadata: { ...metadata, tokens },
    });
  }

  /**
   * Track storage usage
   */
  trackStorage(operation: 'upload' | 'download', sizeBytes: number, metadata?: Record<string, any>): void {
    // Supabase storage pricing: $0.02 per GB stored per month
    // For bandwidth, it's minimal for our use case
    const sizeGB = sizeBytes / (1024 * 1024 * 1024);
    const cost = operation === 'upload' ? sizeGB * 0.02 : 0; // Monthly storage cost

    this.trackCall({
      service: 'storage',
      operation,
      cost,
      metadata: { ...metadata, sizeBytes, sizeGB },
    });
  }

  /**
   * Generate cost breakdown report
   */
  generateReport(): CostBreakdown {
    const googlePlaces = this.calls.filter(c => c.service === 'google-places');
    const googleVision = this.calls.filter(c => c.service === 'google-vision');
    const localVision = this.calls.filter(c => c.service === 'local-vision');
    const llm = this.calls.filter(c => c.service === 'llm');
    const storage = this.calls.filter(c => c.service === 'storage');

    const breakdown: CostBreakdown = {
      googlePlaces: {
        searches: googlePlaces.filter(c => c.operation === 'search').length,
        details: googlePlaces.filter(c => c.operation === 'details').length,
        photos: googlePlaces.filter(c => c.operation === 'photo').length,
        totalCost: googlePlaces.reduce((sum, c) => sum + (c.cost || 0), 0),
      },
      googleVision: {
        calls: googleVision.length,
        totalCost: googleVision.reduce((sum, c) => sum + (c.cost || 0), 0),
      },
      localVision: {
        calls: localVision.length,
        totalCost: localVision.reduce((sum, c) => sum + (c.cost || 0), 0),
      },
      llm: {
        calls: llm.length,
        totalCost: llm.reduce((sum, c) => sum + (c.cost || 0), 0),
      },
      storage: {
        uploads: storage.filter(c => c.operation === 'upload').length,
        bandwidth: storage.reduce((sum, c) => {
          const sizeGB = (c.metadata?.sizeGB || 0);
          return sum + sizeGB;
        }, 0),
        totalCost: storage.reduce((sum, c) => sum + (c.cost || 0), 0),
      },
      totalCost: 0,
      savingsVsFullApi: 0,
    };

    breakdown.totalCost = breakdown.googlePlaces.totalCost +
                         breakdown.googleVision.totalCost +
                         breakdown.localVision.totalCost +
                         breakdown.llm.totalCost +
                         breakdown.storage.totalCost;

    // Estimate what full Google Places API usage would cost
    const estimatedFullApiCost = this.estimateFullApiCost();
    breakdown.savingsVsFullApi = Math.max(0, estimatedFullApiCost - breakdown.totalCost);

    return breakdown;
  }

  /**
   * Estimate what it would cost to use Google Places API for everything
   */
  private estimateFullApiCost(): number {
    const restaurantCount = Math.max(1, this.calls.filter(c =>
      c.service === 'google-places' && c.operation === 'details'
    ).length);

    // For a full API approach, you'd typically need:
    // 1 nearby search per region
    // 1 details call per restaurant
    // 3-5 photos per restaurant for dishes
    // Vision analysis for all photos

    const nearbySearches = 1; // Assume 1 region
    const detailsCalls = restaurantCount;
    const photoCalls = restaurantCount * 3; // 3 photos per restaurant
    const visionCalls = photoCalls; // Vision analysis for each photo

    const apiCost = (nearbySearches * 32/1000) +
                   (detailsCalls * 17/1000) +
                   (photoCalls * 7/1000) +
                   (visionCalls * 0.0018);

    return apiCost;
  }

  /**
   * Print a human-readable cost report
   */
  printReport(): void {
    const report = this.generateReport();
    const runtime = (new Date().getTime() - this.startTime.getTime()) / 1000;

    console.log('\n=== COST MONITORING REPORT ===');
    console.log(`Runtime: ${runtime.toFixed(1)} seconds`);
    console.log(`Total API calls: ${this.calls.length}`);

    console.log('\n--- Google Places API ---');
    console.log(`Searches: ${report.googlePlaces.searches} (${(report.googlePlaces.searches * 32/1000 * 100).toFixed(4)}¢)`);
    console.log(`Details: ${report.googlePlaces.details} (${(report.googlePlaces.details * 17/1000 * 100).toFixed(4)}¢)`);
    console.log(`Photos: ${report.googlePlaces.photos} (${(report.googlePlaces.photos * 7/1000 * 100).toFixed(4)}¢)`);
    console.log(`Places Total: $${report.googlePlaces.totalCost.toFixed(4)}`);

    console.log('\n--- Vision Processing ---');
    console.log(`Google Vision: ${report.googleVision.calls} calls ($${report.googleVision.totalCost.toFixed(4)})`);
    console.log(`Local Vision: ${report.localVision.calls} calls (FREE)`);

    console.log('\n--- Other Services ---');
    console.log(`LLM Calls: ${report.llm.calls} ($${report.llm.totalCost.toFixed(4)})`);
    console.log(`Storage: ${report.storage.uploads} uploads (${report.storage.bandwidth.toFixed(3)} GB) - $${report.storage.totalCost.toFixed(4)}/month`);

    console.log('\n--- Summary ---');
    console.log(`Total Cost: $${report.totalCost.toFixed(4)}`);
    console.log(`Savings vs Full API: $${report.savingsVsFullApi.toFixed(4)}`);
    console.log(`Cost per restaurant: $${(report.totalCost / Math.max(1, report.googlePlaces.details)).toFixed(4)}`);

    if (report.savingsVsFullApi > 0) {
      console.log(`🎉 ${((report.savingsVsFullApi / (report.totalCost + report.savingsVsFullApi)) * 100).toFixed(1)}% cost savings!`);
    }
  }

  /**
   * Export raw call data for analysis
   */
  exportData(): ApiCall[] {
    return [...this.calls];
  }

  /**
   * Reset monitoring data
   */
  reset(): void {
    this.calls = [];
    this.startTime = new Date();
  }
}

// Global cost monitor instance
export const globalCostMonitor = new CostMonitor();
