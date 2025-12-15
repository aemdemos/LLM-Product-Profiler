/**
 * OpenAI Service - Cloudflare Worker Client
 * Handles API calls to Cloudflare Worker for Azure OpenAI access
 */

const WORKER_URL = 'https://llm-product-profiler-worker.chrislotton.workers.dev';

export class OpenAIService {
  constructor() {
    this.enableCache = true;
    this.cacheTTL = 24 * 60 * 60 * 1000; // 24 hours
    this.workerEndpoint = `${WORKER_URL}/api/openai`;
  }

  /**
   * Check if service is available
   */
  async isConfigured() {
    try {
      const response = await fetch(`${WORKER_URL}/health`);
      return response.ok;
    } catch (error) {
      console.error('[OpenAI] Worker health check failed:', error);
      return false;
    }
  }

  /**
   * Get cached data if available and not expired
   */
  getCache(key) {
    if (!this.enableCache) return null;
    
    try {
      const cached = localStorage.getItem(`openai_cache_${key}`);
      if (!cached) return null;
      
      const { data, timestamp } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      
      if (age < this.cacheTTL) {
        console.log(`[OpenAI] Cache hit for ${key} (age: ${Math.round(age / 1000)}s)`);
        return data;
      }
      
      // Cache expired
      localStorage.removeItem(`openai_cache_${key}`);
      return null;
    } catch (error) {
      console.error('[OpenAI] Cache read error:', error);
      return null;
    }
  }

  /**
   * Set cache data
   */
  setCache(key, data) {
    if (!this.enableCache) return;
    
    try {
      localStorage.setItem(`openai_cache_${key}`, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
      console.log(`[OpenAI] Cached result for ${key}`);
    } catch (error) {
      console.error('[OpenAI] Cache write error:', error);
    }
  }

  /**
   * Make API call to Cloudflare Worker (which proxies to Azure OpenAI)
   */
  async callAPI(messages, options = {}) {
    const requestBody = {
      messages: messages,
      max_completion_tokens: options.maxCompletionTokens || 1500
    };

    // Add response format if specified (for JSON mode)
    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }

    console.log('[OpenAI] Making API request via Cloudflare Worker');
    
    try {
      const response = await fetch(this.workerEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(`Worker API error: ${error.error || response.statusText}`);
      }

      const result = await response.json();
      console.log('[OpenAI] API call successful');
      
      return result.choices[0].message.content;
    } catch (error) {
      console.error('[OpenAI] API call failed:', error);
      throw error;
    }
  }

  /**
   * Identify competing products for a given product
   */
  async identifyCompetitors(productData) {
    const cacheKey = `competitors_${productData.name}`;
    
    // Check cache first
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    const prompt = this.buildCompetitorPrompt(productData);
    
    const messages = [
      {
        role: 'system',
        content: 'You are a product market analyst with expertise across all product categories including consumer electronics, hardware, software, home goods, fashion, and more. You have deep knowledge of current products, market trends, and competitive positioning. Provide accurate, real product information.'
      },
      {
        role: 'user',
        content: prompt
      }
    ];

    try {
      const response = await this.callAPI(messages, {
        maxCompletionTokens: 1500,
        responseFormat: { type: 'json_object' }
      });

      // Parse the JSON response
      const parsed = JSON.parse(response);
      const competitors = parsed.competitors || [];

      // Validate and normalize the data
      const normalized = this.normalizeCompetitorData(competitors, productData);

      // Cache the result
      this.setCache(cacheKey, normalized);

      return normalized;
    } catch (error) {
      console.error('[OpenAI] Failed to identify competitors:', error);
      throw error;
    }
  }

  /**
   * Build prompt for competitor identification
   */
  buildCompetitorPrompt(productData) {
    const specs = productData.specs;
    const category = productData.category || 'product';
    
    const keyFeatures = Object.entries(specs)
      .slice(0, 5)
      .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
      .join('\n');
    
    return `Identify 3 real competing ${category} products from different brands for this product:

Product: ${productData.name}
Brand: ${productData.brand || 'N/A'}
Category: ${category}

Key Specifications:
${keyFeatures || 'N/A'}

Return ONLY valid JSON in this exact format (no markdown, no explanation):
{
  "competitors": [
    {
      "brand": "string (different brand name)",
      "model": "string (specific model number/name)",
      "keyFeature": "string (main differentiating feature)",
      "positioning": "string (premium/comparable/budget relative to the product)"
    }
  ]
}

Rules:
- Only include real, currently available products (2023-2025)
- Different brands for each competitor
- Mix of market positions (one premium, one comparable, one budget-oriented)
- Accurate specifications based on real product data
- No fictional products
- Focus on feature differences, not pricing`;
  }

  /**
   * Validate and normalize competitor data from AI
   */
  normalizeCompetitorData(competitors, productData) {
    return competitors.map(comp => ({
      brand: comp.brand || 'Unknown',
      model: comp.model || '',
      keyFeature: comp.keyFeature || '',
      positioning: this.validatePositioning(comp.positioning),
      price: 0,
      torque: 0,
      battery: comp.battery || '',
      warranty: comp.warranty || '3 Years'
    }));
  }

  /**
   * Validate positioning value
   */
  validatePositioning(positioning) {
    const valid = ['premium', 'comparable', 'budget'];
    const normalized = (positioning || '').toLowerCase();
    return valid.includes(normalized) ? normalized : 'comparable';
  }

  /**
   * Generate enhanced comparison text using AI
   */
  async generateComparisonText(product1, product2) {
    const cacheKey = `comparison_${product1.name}_${product2.brand}_${product2.model}`;
    
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    const messages = [
      {
        role: 'system',
        content: 'You are a product comparison expert. Write concise, informative product comparisons that help buyers make decisions based on features and capabilities, not pricing.'
      },
      {
        role: 'user',
        content: `Compare these two products in 1-2 sentences. Focus on feature differences and use cases.

Product 1: ${product1.name} (${product1.brand})
Category: ${product1.category}
Key Features: ${Object.values(product1.specs).slice(0, 3).join(', ')}

Product 2: ${product2.brand} ${product2.model}
Position: ${product2.positioning}
${product2.keyFeature ? `Key Feature: ${product2.keyFeature}` : ''}

Write naturally and conversationally. Explain why someone might choose Product 1 over Product 2 based on features and capabilities.`
      }
    ];

    try {
      const response = await this.callAPI(messages, {
        maxCompletionTokens: 300
      });

      this.setCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[OpenAI] Failed to generate comparison:', error);
      return null;
    }
  }

  /**
   * Generate complete product narrative using AI
   */
  async generateProductNarrative(productData) {
    const cacheKey = `narrative_${productData.name}_${productData.brand}`;
    
    const cached = this.getCache(cacheKey);
    if (cached) {
      return cached;
    }

    const specsList = Object.entries(productData.specs)
      .map(([key, value]) => `- ${key.replace(/_/g, ' ')}: ${value}`)
      .join('\n');
    
    const featuresList = productData.features.length > 0 
      ? productData.features.slice(0, 10).map(f => `- ${f}`).join('\n')
      : 'N/A';

    const messages = [
      {
        role: 'system',
        content: 'You are an expert product analyst and technical writer. Generate clear, factual, and informative product descriptions that help buyers understand the product\'s key capabilities, specifications, and ideal use cases. Write in a professional yet accessible tone. Focus on features and technical details, not pricing.'
      },
      {
        role: 'user',
        content: `Generate a comprehensive product profile (200-300 words) for the following product:

Product Name: ${productData.name}
Brand: ${productData.brand}
Category: ${productData.category}

Specifications:
${specsList || 'N/A'}

Key Features:
${featuresList}

${productData.rating ? `Customer Rating: ${productData.rating.score}/${productData.rating.maxScore} from ${productData.rating.reviewCount} reviews\n` : ''}
${productData.tagline ? `Product Tagline: ${productData.tagline}\n` : ''}

Write a factual, informative narrative that:
1. Introduces the product and its primary purpose
2. Highlights key specifications and technical capabilities
3. Describes notable features and their benefits
4. Mentions any standout characteristics or innovations
5. Notes the target use cases or ideal users
${productData.rating ? '6. References customer satisfaction data' : ''}

Be specific and technical where appropriate. Use natural language appropriate to the product, and avoid marketing hype. Focus on helping buyers understand what the product does and who it's for.`
      }
    ];

    try {
      const response = await this.callAPI(messages, {
        maxCompletionTokens: 500
      });

      this.setCache(cacheKey, response);
      return response;
    } catch (error) {
      console.error('[OpenAI] Failed to generate narrative:', error);
      throw error;
    }
  }

  /**
   * Clear all cached data
   */
  clearCache() {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('openai_cache_')) {
        localStorage.removeItem(key);
      }
    });
    console.log('[OpenAI] Cache cleared');
  }
}

export default OpenAIService;

