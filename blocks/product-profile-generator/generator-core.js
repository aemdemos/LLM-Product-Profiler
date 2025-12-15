/**
 * LLM-Optimized Product Profile Generator
 * Extracts product data and generates LLM-ready profiles
 */

import { OpenAIService } from './openai-service.js';

// Export as ProductProfileGenerator for compatibility
export { ProductProfileGenerator };

/**
 * Cross-brand competitor database (FALLBACK)
 * Used when OpenAI API is unavailable or disabled
 * Maps products to their main competitors from other brands
 */
const COMPETITOR_DATABASE = {
  'PowerMax ProDrill 2000X': [
    {
      brand: 'TitanForce',
      model: 'MegaDrill Pro 3000',
      price: 249.99,
      torque: 820,
      battery: '24V',
      warranty: '5 Years',
      positioning: 'premium'
    },
    {
      brand: 'Milwaukee',
      model: 'M18 Compact Drill',
      price: 179.99,
      torque: 650,
      battery: '18V',
      warranty: '3 Years',
      positioning: 'comparable'
    }
  ],
  'TitanForce MegaDrill Pro 3000': [
    {
      brand: 'PowerMax',
      model: 'ProDrill 2000X',
      price: 179.99,
      torque: 650,
      battery: '20V',
      warranty: '3 Years',
      positioning: 'budget'
    },
    {
      brand: 'DeWalt',
      model: 'DCD999',
      price: 299.99,
      torque: 1200,
      battery: '20V MAX',
      warranty: '3 Years',
      positioning: 'premium'
    }
  ]
};

export class ProductProfileGenerator {
  constructor(options = {}) {
    this.extractedData = null;
    this.openaiService = null;
    this.useAI = options.useAI !== false; // Default to true
    
    // Try to initialize OpenAI service
    try {
      this.openaiService = new OpenAIService();
      if (!this.openaiService.isConfigured()) {
        console.warn('[Generator] OpenAI not configured, will use static database');
        this.useAI = false;
      }
    } catch (error) {
      console.warn('[Generator] Failed to initialize OpenAI service:', error);
      this.useAI = false;
    }
  }

  /**
   * Extract product data from HTML document
   * @param {Document} doc - The HTML document to parse
   * @returns {Object} Extracted product data
   */
  extractProductData(doc) {
    const data = {
      name: this.extractProductName(doc),
      rating: this.extractRating(doc),
      image: this.extractImage(doc),
      tagline: this.extractMetaContent(doc, 'meta[name="description"]') || 
               this.extractMetaContent(doc, 'meta[property="og:description"]') ||
               this.extractText(doc, '.product-tagline') || '',
      specs: this.extractSpecs(doc),
      features: this.extractFeatures(doc),
      useCases: this.extractListItems(doc, '.use-cases-list li'),
      pros: this.extractListItems(doc, '.pros ul li'),
      cons: this.extractListItems(doc, '.cons ul li'),
      compatibility: this.extractCompatibility(doc),
      alternatives: this.extractAlternatives(doc),
      brand: this.extractBrand(doc),
      category: this.extractCategory(doc),
    };

    // Note: competitors will be fetched async later
    data.crossBrandCompetitors = [];

    this.extractedData = data;
    return data;
  }

  /**
   * Get cross-brand competitors for the product (with AI)
   * @param {Object} productData - Full product data
   * @returns {Promise<Array>} List of competitor products
   */
  async getCompetitors(productData) {
    // Try AI first if enabled
    if (this.useAI && this.openaiService) {
      try {
        console.log('[Generator] Fetching competitors with AI...');
        const competitors = await this.openaiService.identifyCompetitors(productData);
        console.log(`[Generator] AI found ${competitors.length} competitors`);
        return competitors;
      } catch (error) {
        console.error('[Generator] AI competitor lookup failed:', error);
        console.log('[Generator] Falling back to static database');
      }
    }

    // Fall back to static database
    return COMPETITOR_DATABASE[productData.name] || [];
  }

  /**
   * Extract product name with intelligent fallback
   * Tries multiple strategies to find the actual product name
   */
  extractProductName(doc) {
    // Helper function to validate product name
    const isValidProductName = (text) => {
      if (!text || text.length < 2 || text.length > 200) return false;
      const lower = text.toLowerCase();
      // Filter out promotional text
      if (lower.includes('all-new') || 
          lower.includes('introducing') || 
          lower.startsWith('the new') ||
          lower.includes('shop now') ||
          lower.includes('buy now')) {
        return false;
      }
      return true;
    };
    
    // Helper to extract URL path for matching
    const urlPath = doc.location?.pathname || '';
    console.log(`[Generator] Page URL path: ${urlPath}`);
    
    // Strategy 1: Find product-name that matches the URL
    // This helps us find the MAIN product vs related products
    if (urlPath) {
      const productNameElements = doc.querySelectorAll('.product-name');
      for (const element of productNameElements) {
        const text = element.textContent.trim();
        const parentLink = element.closest('a');
        
        // Check if this product name's link matches the current URL
        if (parentLink && parentLink.getAttribute('href')) {
          const href = parentLink.getAttribute('href');
          if (href === urlPath || urlPath.includes(href) || href.includes(urlPath.split('?')[0])) {
            if (isValidProductName(text)) {
              console.log(`[Generator] Found product name via URL-matching .product-name: ${text}`);
              return text;
            }
          }
        }
      }
    }
    
    // Strategy 2: Try common product-specific selectors
    const productSelectors = [
      '[itemprop="name"]',       // Schema.org markup
      '.pdp-name',               // Product detail page name
      '.product-title',
      '#productTitle',
      '.product-info h1',        // Product info section h1
      'h1[class*="product"]',    // Any h1 with "product" in class
      'h1.title',
      '[data-product-name]'      // Data attribute
    ];
    
    for (const selector of productSelectors) {
      const element = doc.querySelector(selector);
      if (element) {
        const text = element.textContent.trim();
        if (isValidProductName(text)) {
          console.log(`[Generator] Found product name via ${selector}: ${text}`);
          return text;
        }
      }
    }
    
    // Strategy 3: Fallback to first .product-name (if not found via URL matching)
    const firstProductName = doc.querySelector('.product-name');
    if (firstProductName) {
      const text = firstProductName.textContent.trim();
      if (isValidProductName(text)) {
        console.log(`[Generator] Found product name via first .product-name: ${text}`);
        return text;
      }
    }
    
    // Strategy 4: Try meta tags
    const ogTitle = this.extractMetaContent(doc, 'meta[property="og:title"]');
    if (ogTitle && ogTitle.length < 200) {
      // Clean up common suffixes
      const cleaned = ogTitle
        .replace(/\s*\|\s*.+$/, '')  // Remove "| Brand Name"
        .replace(/\s*-\s*.+$/, '')   // Remove "- Brand Name"
        .trim();
      if (cleaned.length > 2 && !cleaned.toLowerCase().includes('home')) {
        console.log(`[Generator] Found product name via og:title: ${cleaned}`);
        return cleaned;
      }
    }
    
    // Strategy 5: Try title tag
    const title = doc.querySelector('title')?.textContent || '';
    if (title) {
      const cleaned = title
        .replace(/\s*\|\s*.+$/, '')
        .replace(/\s*-\s*.+$/, '')
        .trim();
      if (cleaned.length > 2 && cleaned.length < 200 && !cleaned.toLowerCase().includes('home')) {
        console.log(`[Generator] Found product name via title: ${cleaned}`);
        return cleaned;
      }
    }
    
    // Strategy 6: Fallback to h1/h2 (last resort, avoiding promotional content)
    const h1Elements = doc.querySelectorAll('h1');
    for (const h1 of h1Elements) {
      const text = h1.textContent.trim();
      if (isValidProductName(text)) {
        console.log(`[Generator] Found product name via h1: ${text}`);
        return text;
      }
    }
    
    const h2Elements = doc.querySelectorAll('h2');
    for (const h2 of h2Elements) {
      const text = h2.textContent.trim();
      if (isValidProductName(text)) {
        console.log(`[Generator] Found product name via h2: ${text}`);
        return text;
      }
    }
    
    console.warn('[Generator] Could not find product name, using default');
    return 'Unknown Product';
  }

  /**
   * Extract text content from selector
   */
  extractText(doc, selector) {
    const element = doc.querySelector(selector);
    return element ? element.textContent.trim() : '';
  }

  /**
   * Extract meta tag content
   */
  extractMetaContent(doc, selector) {
    const element = doc.querySelector(selector);
    return element ? (element.getAttribute('content') || '').trim() : '';
  }

  /**
   * Extract rating information
   */
  extractRating(doc) {
    // Try common rating selectors
    const ratingElement = doc.querySelector('.rating') || 
                         doc.querySelector('[class*="rating"]') ||
                         doc.querySelector('[itemprop="ratingValue"]');
    
    if (!ratingElement) return null;
    
    const text = ratingElement.textContent;
    const ratingMatch = text.match(/(\d+\.?\d*)\s*\/\s*(\d+)/);
    const reviewMatch = text.match(/\(([0-9,]+)\s*reviews?\)/);
    
    return {
      score: ratingMatch ? parseFloat(ratingMatch[1]) : null,
      maxScore: ratingMatch ? parseInt(ratingMatch[2]) : 5,
      reviewCount: reviewMatch ? parseInt(reviewMatch[1].replace(/,/g, '')) : 0,
    };
  }

  /**
   * Extract product image
   */
  extractImage(doc) {
    // Try multiple image selectors
    const imgElement = doc.querySelector('.product-image img') ||
                      doc.querySelector('[class*="product"] img') ||
                      doc.querySelector('meta[property="og:image"]') ||
                      doc.querySelector('img[itemprop="image"]');
    
    if (!imgElement) return null;
    
    return imgElement.getAttribute('src') || 
           imgElement.getAttribute('content') || 
           imgElement.textContent.trim();
  }

  /**
   * Extract technical specifications
   */
  extractSpecs(doc) {
    const specs = {};
    
    // Try structured spec cards first
    const specCards = doc.querySelectorAll('.spec-card');
    specCards.forEach((card) => {
      const label = card.querySelector('h3')?.textContent.trim();
      const value = card.querySelector('p')?.textContent.trim();
      if (label && value) {
        const key = label.toLowerCase().replace(/\s+/g, '_');
        specs[key] = value;
      }
    });
    
    // Try table-based specifications
    const specRows = doc.querySelectorAll('table tr, [class*="spec"] tr, [class*="specification"] tr');
    specRows.forEach((row) => {
      const cells = row.querySelectorAll('td, th');
      if (cells.length >= 2) {
        const label = cells[0].textContent.trim();
        const value = cells[1].textContent.trim();
        if (label && value && label !== value) {
          const key = label.toLowerCase().replace(/[\s\[\]]/g, '_').replace(/_+/g, '_');
          specs[key] = value;
        }
      }
    });
    
    // Try definition list
    const dts = doc.querySelectorAll('dl dt');
    dts.forEach((dt) => {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') {
        const label = dt.textContent.trim();
        const value = dd.textContent.trim();
        if (label && value) {
          const key = label.toLowerCase().replace(/\s+/g, '_');
          specs[key] = value;
        }
      }
    });
    
    return specs;
  }

  /**
   * Extract features - improved to handle real-world websites
   */
  extractFeatures(doc) {
    const features = [];
    
    // Try common feature list selectors
    const selectors = [
      '.features-list li',
      '.features li',
      '[class*="feature"] li',
      '.product-features li',
      '.highlights li',
      '[class*="benefit"] li'
    ];
    
    for (const selector of selectors) {
      const items = doc.querySelectorAll(selector);
      if (items.length > 0) {
        items.forEach(item => {
          const text = item.textContent.trim();
          if (text && text.length > 10 && text.length < 500) {
            features.push(text);
          }
        });
        if (features.length > 0) break;
      }
    }
    
    // Fallback: look for bullet points in common containers
    if (features.length === 0) {
      const containers = doc.querySelectorAll('[class*="additional"], [class*="detail"]');
      containers.forEach(container => {
        const bullets = container.querySelectorAll('li');
        bullets.forEach(bullet => {
          const text = bullet.textContent.trim();
          if (text && text.length > 10 && text.length < 500 && !text.includes('©')) {
            features.push(text);
          }
        });
      });
    }
    
    // Remove duplicates and limit to first 10
    return [...new Set(features)].slice(0, 10);
  }

  /**
   * Extract product category
   */
  extractCategory(doc) {
    // Try breadcrumbs
    const breadcrumbs = doc.querySelectorAll('[class*="breadcrumb"] a, nav a');
    if (breadcrumbs.length > 1) {
      const categories = Array.from(breadcrumbs)
        .map(b => b.textContent.trim())
        .filter(t => t && t.toLowerCase() !== 'home');
      if (categories.length > 0) {
        return categories.join(' > ');
      }
    }
    
    // Try meta category
    const metaCat = this.extractMetaContent(doc, 'meta[property="product:category"]');
    if (metaCat) return metaCat;
    
    // Default
    return 'General Product';
  }

  /**
   * Extract brand name
   */
  extractBrand(doc) {
    // Try meta tags first
    const metaBrand = this.extractMetaContent(doc, 'meta[property="og:brand"]') ||
                     this.extractMetaContent(doc, 'meta[property="product:brand"]') ||
                     this.extractMetaContent(doc, 'meta[itemprop="brand"]');
    if (metaBrand) return metaBrand;
    
    // Try to extract from URL
    const hostname = doc.location?.hostname || '';
    if (hostname) {
      const parts = hostname.split('.');
      if (parts.length >= 2) {
        const brand = parts[parts.length - 2];
        return brand.charAt(0).toUpperCase() + brand.slice(1);
      }
    }
    
    // Try to extract from title
    const title = doc.querySelector('title')?.textContent || '';
    const titleParts = title.split(/[-|]/);
    if (titleParts.length > 1) {
      return titleParts[titleParts.length - 1].trim();
    }
    
    return 'Unknown Brand';
  }

  /**
   * Extract list items
   */
  extractListItems(doc, selector) {
    const items = doc.querySelectorAll(selector);
    return Array.from(items).map((item) => item.textContent.trim());
  }

  /**
   * Extract compatibility information
   */
  extractCompatibility(doc) {
    const compatItems = doc.querySelectorAll('.compatibility-item');
    return Array.from(compatItems).map((item) => item.textContent.trim());
  }

  /**
   * Extract alternative products
   */
  extractAlternatives(doc) {
    const alternativesSection = doc.querySelector('.section:last-child');
    if (!alternativesSection) return [];
    
    const paragraphs = alternativesSection.querySelectorAll('p');
    const alternatives = [];
    
    paragraphs.forEach((p) => {
      const text = p.textContent;
      const nameMatch = text.match(/^([^:]+):/);
      const priceMatch = text.match(/\$([0-9,.]+)/);
      
      if (nameMatch) {
        alternatives.push({
          name: nameMatch[1].trim(),
          price: priceMatch ? `$${priceMatch[1]}` : null,
          description: text.substring(text.indexOf(':') + 1).trim(),
        });
      }
    });
    
    return alternatives;
  }

  /**
   * Extract brand name from product name
   */
  extractBrand(doc) {
    const productName = this.extractText(doc, 'h1');
    const brandMatch = productName.match(/^(\w+)/);
    return brandMatch ? brandMatch[1] : 'Unknown';
  }

  /**
   * Generate competitor comparison for JSON-LD
   * @param {Object} data - Product data with competitors
   * @returns {Object} Competitor comparison object
   */
  generateCompetitorComparison(data) {
    if (!data.crossBrandCompetitors || data.crossBrandCompetitors.length === 0) {
      return {};
    }
    
    const comparison = {};
    
    // Get key product features for comparison (with fallbacks for empty data)
    const myFeatures = data.features.length > 0 
      ? data.features.slice(0, 3).join(', ') 
      : '';
    const myKeySpecs = Object.keys(data.specs).length > 0
      ? Object.entries(data.specs).slice(0, 2).map(([k, v]) => `${k}: ${v}`).join(', ')
      : '';
    
    data.crossBrandCompetitors.forEach(competitor => {
      const key = `${competitor.brand} ${competitor.model}`;
      
      // Generate feature-based comparison
      let comparisonText = '';
      
      if (competitor.positioning === 'premium') {
        // Competitor is premium - emphasize our solid performance
        comparisonText = myKeySpecs 
          ? `${data.brand} delivers strong performance with ${myKeySpecs}. `
          : `${data.brand} delivers strong, reliable performance. `;
        
        if (data.compatibility.length > 5) {
          comparisonText += `Offers excellent ecosystem compatibility with ${data.compatibility.length}+ compatible products. `;
        }
        
        if (competitor.keyFeature) {
          comparisonText += `While ${competitor.brand} focuses on ${competitor.keyFeature}, ${data.brand} provides a well-rounded solution ideal for most users.`;
        } else {
          comparisonText += `Ideal for users who need reliable performance without premium-tier features.`;
        }
        
      } else if (competitor.positioning === 'comparable') {
        // Similar tier competitor - highlight unique advantages
        comparisonText = `Comparable to ${competitor.brand} in core functionality. `;
        
        // Find unique advantages
        if (data.compatibility.length > 10) {
          comparisonText += `${data.brand} offers broader ecosystem with ${data.compatibility.length}+ compatible products. `;
        }
        
        if (data.specs.warranty && data.specs.warranty.includes('5')) {
          comparisonText += `Provides superior ${data.specs.warranty} warranty coverage. `;
        }
        
        if (data.features.length > 5 && myFeatures) {
          comparisonText += `Features include: ${myFeatures}.`;
        } else {
          comparisonText += `Delivers reliable performance for intended use cases.`;
        }
        
      } else if (competitor.positioning === 'budget') {
        // We're higher tier - justify with features
        comparisonText = `Compared to budget-oriented ${competitor.brand}, ${data.brand} provides `;
        
        const premiumFeatures = data.features.filter(f => 
          f.toLowerCase().includes('advanced') || 
          f.toLowerCase().includes('premium') ||
          f.toLowerCase().includes('enhanced') ||
          f.toLowerCase().includes('intelligent')
        );
        
        if (premiumFeatures.length > 0) {
          comparisonText += `${premiumFeatures[0].toLowerCase()}. `;
        } else {
          comparisonText += `enhanced capabilities and features. `;
        }
        
        if (data.specs.warranty) {
          comparisonText += `Includes ${data.specs.warranty} warranty. `;
        }
        
        comparisonText += `Worthwhile upgrade for users needing additional features and reliability.`;
      }
      
      comparison[key] = comparisonText;
    });
    
    return comparison;
  }

  /**
   * Generate structured JSON-LD output
   * @param {Object} data - Extracted product data
   * @returns {Object} JSON-LD structured data
   */
  generateStructuredData(data = this.extractedData) {
    if (!data) return null;

    const structuredData = {
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: data.name,
      description: data.tagline,
      brand: {
        '@type': 'Brand',
        name: data.brand,
      },
      category: data.category,
      offers: {
        '@type': 'Offer',
        availability: 'https://schema.org/InStock',
      },
      aggregateRating: data.rating ? {
        '@type': 'AggregateRating',
        ratingValue: data.rating.score,
        bestRating: data.rating.maxScore,
        reviewCount: data.rating.reviewCount,
      } : null,
      additionalProperty: Object.entries(data.specs).map(([key, value]) => ({
        '@type': 'PropertyValue',
        name: key.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
        value,
      })),
      features: data.features,
      useCases: data.useCases,
      pros: data.pros,
      cons: data.cons,
      isCompatibleWith: data.compatibility,
      isRelatedTo: data.alternatives.map((alt) => ({
        '@type': 'Product',
        name: alt.name,
        offers: {
          '@type': 'Offer',
          price: alt.price,
        },
        description: alt.description,
      })),
    };

    // Add competitor comparison
    const competitorComparison = this.generateCompetitorComparison(data);
    if (Object.keys(competitorComparison).length > 0) {
      structuredData.competitor_comparison = competitorComparison;
    }

    return structuredData;
  }

  /**
   * Generate LLM-ready narrative
   * @param {Object} data - Extracted product data
   * @returns {string} LLM-optimized narrative
   */
  async generateNarrative(data = this.extractedData) {
    if (!data) return '';
    return await this.generateFactualNarrative(data);
  }

  /**
   * Generate competitor narrative paragraph
   * @param {Object} data - Product data
   * @returns {string} Competitor comparison paragraph
   */
  generateCompetitorNarrative(data) {
    if (!data.crossBrandCompetitors || data.crossBrandCompetitors.length === 0) {
      return '';
    }
    
    // Pick the most relevant competitor (first one)
    const mainCompetitor = data.crossBrandCompetitors[0];
    const compKey = `${mainCompetitor.brand} ${mainCompetitor.model}`;
    
    let narrative = `Compared to the ${compKey}, `;
    
    if (mainCompetitor.positioning === 'premium') {
      // Build feature list with fallback for empty features
      const featureList = data.features.length > 0
        ? data.features.slice(0, 2).map(f => f.toLowerCase()).join(' and ')
        : '';
      
      if (featureList) {
        narrative += `the ${data.brand} offers strong performance with key features including ${featureList}. `;
      } else {
        narrative += `the ${data.brand} offers strong, reliable performance. `;
      }
      
      if (data.compatibility.length > 5) {
        narrative += `Provides excellent ecosystem compatibility with ${data.compatibility.length}+ products. `;
      }
    } else if (mainCompetitor.positioning === 'comparable') {
      narrative += `both products offer similar capabilities. `;
      if (data.compatibility.length > 10) {
        narrative += `The ${data.brand} features broader ecosystem support with ${data.compatibility.length}+ compatible products. `;
      }
    } else {
      narrative += `the ${data.brand} provides enhanced features and capabilities for users needing additional functionality. `;
    }
    
    return narrative;
  }

  /**
   * Generate factual tone narrative using AI
   */
  async generateFactualNarrative(data) {
    // Use AI to generate the narrative if available
    if (this.useAI && this.openaiService) {
      try {
        return await this.openaiService.generateProductNarrative(data);
      } catch (error) {
        console.error('[Generator] AI narrative generation failed:', error);
        console.log('[Generator] Falling back to template-based narrative');
      }
    }
    
    // Fallback to simple template if AI unavailable
    const specs = data.specs;
    const rating = data.rating;
    
    let narrative = `The ${data.name} is a ${data.category.toLowerCase()} from ${data.brand}. `;
    
    // Key specifications
    if (Object.keys(specs).length > 0) {
      const specList = Object.entries(specs)
        .slice(0, 5)
        .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
        .join(', ');
      narrative += `Key specifications include ${specList}. `;
    }

    // Features
    if (data.features.length > 0) {
      narrative += `Notable features: ${data.features.slice(0, 3).join(', ')}. `;
    }

    // Ratings
    if (rating && rating.score) {
      narrative += `Customer rating: ${rating.score}/${rating.maxScore} from ${rating.reviewCount.toLocaleString()} reviews. `;
    }

    // Competitor comparison
    const competitorNarrative = this.generateCompetitorNarrative(data);
    if (competitorNarrative) {
      narrative += competitorNarrative;
    }
    
    return this.truncateToWordCount(narrative, 100, 300);
  }

  /**
   * Truncate text to word count range
   */
  truncateToWordCount(text, min, max) {
    const words = text.split(/\s+/);
    if (words.length <= max) return text;
    
    // Try to end at a sentence boundary near max
    let truncated = words.slice(0, max).join(' ');
    const lastPeriod = truncated.lastIndexOf('.');
    if (lastPeriod > (min * 5)) { // Rough char estimate
      truncated = truncated.substring(0, lastPeriod + 1);
    }
    
    return truncated;
  }

  /**
   * Compare this product against competitors
   * @param {Array} competitorDataArray - Array of competitor product data
   * @returns {Object} Comparison insights
   */
  compareWithCompetitors(competitorDataArray) {
    if (!this.extractedData) return null;

    const mainProduct = this.extractedData;
    const insights = {
      product: mainProduct.name,
      competitors: competitorDataArray.map((c) => c.name),
      comparison: {},
      narrativeGaps: [],
      competitivePosition: '',
    };

    // Price comparison
    const prices = [mainProduct.price.value, ...competitorDataArray.map((c) => c.price.value)];
    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    insights.comparison.price = {
      yours: mainProduct.price.value,
      average: avgPrice.toFixed(2),
      position: mainProduct.price.value < avgPrice ? 'below market' : 'above market',
    };

    // Specs comparison
    const competitorTorques = competitorDataArray
      .map((c) => parseInt(c.specs.max_torque || '0'))
      .filter((t) => t > 0);
    const mainTorque = parseInt(mainProduct.specs.max_torque || '0');
    
    if (competitorTorques.length > 0 && mainTorque > 0) {
      const avgTorque = competitorTorques.reduce((a, b) => a + b, 0) / competitorTorques.length;
      insights.comparison.torque = {
        yours: mainTorque,
        average: avgTorque.toFixed(0),
        position: mainTorque > avgTorque ? 'above average' : 'below average',
      };
    }

    // Rating comparison
    if (mainProduct.rating) {
      const competitorRatings = competitorDataArray
        .filter((c) => c.rating)
        .map((c) => c.rating.score);
      if (competitorRatings.length > 0) {
        const avgRating = competitorRatings.reduce((a, b) => a + b, 0) / competitorRatings.length;
        insights.comparison.rating = {
          yours: mainProduct.rating.score,
          average: avgRating.toFixed(2),
          position: mainProduct.rating.score > avgRating ? 'above average' : 'below average',
        };
      }
    }

    // Feature gap analysis
    const allCompetitorFeatures = competitorDataArray.flatMap((c) => c.features);
    const emphasisKeywords = {
      durability: ['durable', 'durability', 'rugged', 'tough', 'reinforced', 'metal', 'protection'],
      warranty: ['warranty', 'guarantee', 'lifetime', 'years'],
      usability: ['ergonomic', 'comfortable', 'user-friendly', 'easy', 'intuitive'],
      technology: ['digital', 'intelligent', 'smart', 'advanced', 'precision'],
      power: ['power', 'torque', 'performance', 'motor'],
    };

    Object.entries(emphasisKeywords).forEach(([category, keywords]) => {
      const competitorMentions = allCompetitorFeatures.filter((f) =>
        keywords.some((k) => f.toLowerCase().includes(k))
      ).length;
      const yourMentions = mainProduct.features.filter((f) =>
        keywords.some((k) => f.toLowerCase().includes(k))
      ).length;

      const competitorAvg = competitorMentions / competitorDataArray.length;
      if (competitorAvg > yourMentions * 1.5) {
        insights.narrativeGaps.push({
          category,
          gap: 'under-emphasized',
          message: `Competitors emphasize ${category} ${competitorAvg.toFixed(1)}x more than your product description`,
        });
      } else if (yourMentions > competitorAvg * 1.5) {
        insights.narrativeGaps.push({
          category,
          gap: 'over-emphasized',
          message: `You emphasize ${category} ${(yourMentions / competitorAvg).toFixed(1)}x more than competitors—good differentiation`,
        });
      }
    });

    // Overall competitive position
    const aboveAverage = Object.values(insights.comparison).filter((c) => 
      c.position && c.position.includes('above')
    ).length;
    const total = Object.keys(insights.comparison).length;
    
    if (aboveAverage / total > 0.6) {
      insights.competitivePosition = 'Premium positioning—stronger specs but higher price';
    } else if (aboveAverage / total < 0.4) {
      insights.competitivePosition = 'Value positioning—competitive price with acceptable specs';
    } else {
      insights.competitivePosition = 'Balanced positioning—mid-range across key metrics';
    }

    return insights;
  }

  /**
   * Generate complete product profile
   * @param {Document} doc - HTML document to analyze
   * @param {Object} options - Generation options
   * @returns {Promise<Object>} Complete product profile
   */
  async generateProfile(doc, options = {}) {
    const data = await this.extractProductData(doc);
    
    // Fetch competitors (AI or static)
    try {
      data.crossBrandCompetitors = await this.getCompetitors(data);
      console.log(`[Generator] Loaded ${data.crossBrandCompetitors.length} competitors`);
    } catch (error) {
      console.error('[Generator] Failed to load competitors:', error);
      data.crossBrandCompetitors = [];
    }
    
    const profile = {
      metadata: {
        generatedAt: new Date().toISOString(),
        version: '1.0.0',
        aiPowered: this.useAI && this.openaiService?.isConfigured(),
      },
      structuredData: this.generateStructuredData(data),
      narratives: {
        factual: await this.generateNarrative(data)
      },
      rawData: data,
    };

    return profile;
  }
}

export default ProductProfileGenerator;

