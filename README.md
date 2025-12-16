# LLM Product Profiler - Adobe EDS Site

Transform any product page into AI-ready content for Generative Engine Optimization (GEO). Generate conversational product narratives, structured data, and competitive analysis optimized for ChatGPT, Perplexity, Google AI Overview, and other LLMs.

## Features

- **AI-Powered Competitor Detection** - Azure OpenAI identifies real competing products
- **AI-Generated Product Narratives** - 200-300 word professional descriptions optimized for LLMs
- **Structured Data Output** - Schema.org-compliant JSON-LD
- **Competitive Analysis** - Feature-based comparisons with AI-generated insights
- **Ready-to-Embed** - Copy-paste HTML for any CMS
- **24-hour Caching** - Minimizes API costs

## Architecture

```
EDS Frontend (Adobe Experience Manager)
    ↓
Cloudflare Worker (Backend API)
    ├─→ CORS Proxy (fetch external product pages)
    └─→ Azure OpenAI Proxy (AI-powered features)
```

## Getting Started

### Prerequisites

- Node.js 18+
- [Adobe Experience Manager CLI](https://www.hlx.live/docs/) (`aem` command)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/clotton/LLM-Product-Profiler.git
   cd LLM-Product-Profiler
   ```

2. **Install AEM CLI:**
   ```bash
   npm install -g @adobe/aem-cli
   ```

3. **Start local development server:**
   ```bash
   aem up
   ```

4. **Access the site:**
   - Open http://localhost:3000
   - Navigate to the Product Profile Generator page

### Using the Tool

1. Enter any product page URL
2. Click "Generate Profile"
3. View results in four tabs:
   - **Product Profile** - AI narrative + competitive edge
   - **Embed Code** - Ready-to-paste HTML
   - **Structured Data** - JSON-LD for schema.org
   - **Raw Data** - Debug view of extracted data

### Working with Protected Sites

Many e-commerce sites (TaylorMade, Home Depot, etc.) have bot protection that may block the Cloudflare Worker proxy. For maximum compatibility:

**Option 1: Use Local Python Proxy (Recommended for Development)**

The original garage week app included a Python proxy that works better with protected sites. The frontend automatically tries this first:

1. **Clone the original app:**
   ```bash
   cd /Users/clotton/repos
   git clone https://github.com/ckkovac/gw20251208.git
   cd gw20251208
   ```

2. **Start the Python proxy:**
   ```bash
   python3 proxy-server.py
   ```
   Server runs at: http://localhost:8081

3. **Keep both running:**
   - Python proxy: http://localhost:8081 (handles protected sites)
   - AEM dev server: http://localhost:3000 (your EDS site)

The frontend will automatically try the local proxy first, then fall back to the Cloudflare Worker.

**Option 2: Use Less Protected Sites**

Some sites work fine with the Cloudflare Worker:
- Product pages without aggressive bot detection
- Sites that don't use Demandware, Cloudflare Bot Management, or similar
- Static product pages without JavaScript challenges

## Project Structure

```
/
├── blocks/
│   └── product-profile-generator/      # Main block
│       ├── product-profile-generator.js
│       ├── product-profile-generator.css
│       ├── generator-core.js           # Product extraction logic
│       └── openai-service.js           # Cloudflare Worker client
├── scripts/
│   ├── scripts.js                       # Site-wide JavaScript
│   └── aem.js                           # AEM/Franklin framework
├── styles/
│   └── styles.css                       # Global styles
├── head.html                            # Site metadata
└── fstab.yaml                           # Mount points configuration
```

## Backend

The backend is powered by a Cloudflare Worker that provides:
- CORS proxy for fetching external product pages
- Secure Azure OpenAI API access

**Worker Repository:** [LLM-Product-Profiler-Worker](https://github.com/clotton/LLM-Product-Profiler-Worker)

**Worker URL:** `https://llm-product-profiler-worker.chrislotton.workers.dev`

## Deployment

This site uses Adobe's Edge Delivery Services (EDS). Deployment is automatic via GitHub:

1. Push changes to the `main` branch
2. EDS automatically builds and deploys
3. Access at your configured domain

## Configuration

### Cloudflare Worker Endpoint

The worker URL is configured in:
```javascript
// blocks/product-profile-generator/openai-service.js
const WORKER_URL = 'https://llm-product-profiler-worker.chrislotton.workers.dev';
```

### Caching

- AI responses are cached for 24 hours in localStorage
- Reduces API costs and improves performance
- Clear cache via browser developer tools

## Development

### Adding New Blocks

1. Create a new directory in `/blocks/`
2. Add `blockname.js` and `blockname.css`
3. Follow [AEM Block Development Guide](https://www.hlx.live/docs/block-collection)

### Modifying the Generator

- **Product extraction logic:** `blocks/product-profile-generator/generator-core.js`
- **OpenAI integration:** `blocks/product-profile-generator/openai-service.js`
- **UI and interactions:** `blocks/product-profile-generator/product-profile-generator.js`
- **Styling:** `blocks/product-profile-generator/product-profile-generator.css`

## Browser Support

- Modern browsers (Chrome, Firefox, Safari, Edge)
- Requires ES6 module support
- LocalStorage for caching

## Related Repositories

- **Cloudflare Worker:** [LLM-Product-Profiler-Worker](https://github.com/clotton/LLM-Product-Profiler-Worker)
- **Original Prototype:** [gw20251208](https://github.com/ckkovac/gw20251208)

## License

Proprietary - Adobe Garage Week 2025

## Support

For questions or issues, see project documentation or create an issue in the repository.

---

**Built with Adobe Edge Delivery Services** | **Powered by Azure OpenAI** | **Deployed on Cloudflare Workers**
