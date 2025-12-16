/**
 * Product Profile Generator Block
 * EDS block for generating LLM-optimized product profiles
 */

import { ProductProfileGenerator as Generator } from './generator-core.js';

export default async function decorate(block) {
  // Build the UI
  block.innerHTML = `
    <div class="profile-generator-container">
      <div class="generator-panel">
        <div class="panel-header">
          <h2>Product Selection & Configuration</h2>
        </div>
        <div class="panel-body">
          <div class="control-group">
            <label>Product Page URL</label>
            <p class="help-text">
              Enter a product page URL to generate an AI-optimized profile with competitive analysis.
            </p>
            <div class="url-input-wrapper">
              <input 
                type="url" 
                id="productUrl"
                class="url-input" 
                placeholder="https://example.com/product-page" 
              />
            </div>
          </div>

          <div class="action-buttons">
            <button class="btn btn-primary" id="generateBtn">Generate Profile</button>
          </div>
        </div>
      </div>

      <div id="results" class="results" style="display: none;"></div>
    </div>
  `;

  // Initialize the generator
  const generator = new Generator();

  const urlInput = block.querySelector('#productUrl');
  const generateBtn = block.querySelector('#generateBtn');
  const resultsDiv = block.querySelector('#results');

  // Helper functions defined first
  function validateUrl(input) {
    const value = input.value.trim();

    if (!value) {
      input.classList.remove('error', 'valid');
      return false;
    }

    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        input.classList.remove('error');
        input.classList.add('valid');
        return true;
      }
      input.classList.add('error');
      input.classList.remove('valid');
      return false;
    } catch {
      input.classList.add('error');
      input.classList.remove('valid');
      return false;
    }
  }

  async function generateProfile(url) {
    // Check if it's a local file or external URL
    const isLocalFile = url.includes('localhost') || url.includes('127.0.0.1') || url.startsWith(window.location.origin);

    let html;

    if (isLocalFile) {
      // Local file - fetch directly
      const response = await fetch(url);
      html = await response.text();
    } else {
      // External URL - try multiple proxy options (local Python proxy first, then Cloudflare Worker)
      const proxies = [
        {
          name: 'Local Python Proxy',
          url: `http://localhost:8081/api/fetch-url?url=${encodeURIComponent(url)}`
        },
        {
          name: 'Cloudflare Worker',
          url: `https://llm-product-profiler-worker.chrislotton.workers.dev/api/fetch-url?url=${encodeURIComponent(url)}`
        }
      ];

      let lastError;
      
      for (const proxy of proxies) {
        try {
          console.log(`[Generator] Trying ${proxy.name}...`);
          const response = await fetch(proxy.url, { 
            signal: AbortSignal.timeout(15000) // 15 second timeout
          });

          if (response.ok) {
            html = await response.text();
            console.log(`[Generator] Successfully fetched via ${proxy.name}`);
            break;
          }
          
          const errorText = await response.text();
          lastError = new Error(`${proxy.name} failed: ${errorText}`);
          console.warn(`[Generator] ${proxy.name} returned ${response.status}`, errorText);
        } catch (error) {
          lastError = error;
          console.warn(`[Generator] ${proxy.name} error:`, error.message);
        }
      }

      if (!html) {
        // Check if it's a bot protection error
        const errorMsg = lastError?.message || '';
        const isBotProtection = errorMsg.includes('403') || 
                               errorMsg.includes('Forbidden') || 
                               errorMsg.includes('redirect') ||
                               errorMsg.includes('bot protection');
        
        if (isBotProtection) {
          throw new Error(`⚠️ This site has bot protection that blocks automated access.\n\n` +
            `Sites like TaylorMade, Home Depot, Nike, and other major retailers use advanced security that prevents our service from accessing their pages.\n\n` +
            `✅ What you can try:\n` +
            `• Use product pages from smaller retailers\n` +
            `• Try manufacturer sites without heavy security\n` +
            `• Contact us for enterprise API access\n\n` +
            `💡 During development, you can run the local Python proxy to bypass these restrictions.\n\n` +
            `Technical details: ${errorMsg}`);
        }
        
        throw new Error(`Failed to fetch product page.\n\n` +
          `${errorMsg}\n\n` +
          `Please check:\n` +
          `• Is the URL accessible?\n` +
          `• Does the page load in a browser?\n` +
          `• Is the URL correct?`);
      }
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    return generator.generateProfile(doc);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function generateEmbedCode(profile) {
    const narrative = profile.narratives.factual;
    const competitors = profile.structuredData.competitor_comparison || {};
    const competitorHTML = Object.keys(competitors).length > 0
      ? `\n\n  <!-- Competitive Analysis -->\n  <div class="product-competitive-analysis">\n${Object.entries(competitors).map(([comp, text]) => `    <p><strong>vs ${comp}:</strong> ${text}</p>`).join('\n')}\n  </div>`
      : '';

    const scriptOpen = '<script type="application/ld+json">';
    const scriptClose = '</script>';
    const styleOpen = '<style>';
    const styleClose = '</style>';

    return `<!-- GEO-Optimized Product Content -->
<!-- Generated by LLM-Optimized Product Profile Generator -->

<!-- Step 1: Add this JSON-LD script to your <head> section -->
${scriptOpen}
${JSON.stringify(profile.structuredData, null, 2)}
${scriptClose}

<!-- Step 2: Add this conversational narrative to your product description area -->
<div class="llm-optimized-product-description" data-llm-enhanced="true">
  ${narrative}${competitorHTML}
</div>

<!-- Optional: Add this CSS for styling -->
${styleOpen}
.llm-optimized-product-description {
  line-height: 1.8;
  color: #333;
  font-size: 16px;
}
.product-competitive-analysis {
  margin-top: 1.5rem;
  padding: 1rem;
  background: #f8f9fa;
  border-left: 3px solid #1473e6;
  border-radius: 4px;
}
.product-competitive-analysis p {
  margin-bottom: 0.75rem;
}
${styleClose}`;
  }

  function markdownToHtml(text) {
    if (!text) return '';

    let html = text;

    // Escape HTML entities first
    html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Headers
    html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // Lists
    html = html.replace(/^[*\-•] (.+)$/gm, '<li>$1</li>');
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, (match) => `<ul>${match}</ul>`);

    // Paragraphs
    const lines = html.split('\n');
    const processedLines = [];
    let paragraphContent = [];

    lines.forEach((line) => {
      const trimmed = line.trim();
      const isBlockElement = /^<(h[1-4]|ul|ol|li|blockquote|hr|p)/.test(trimmed)
                             || /<\/(h[1-4]|ul|ol|blockquote|p)>$/.test(trimmed);

      if (trimmed === '') {
        if (paragraphContent.length > 0) {
          processedLines.push(`<p>${paragraphContent.join(' ')}</p>`);
          paragraphContent = [];
        }
      } else if (isBlockElement) {
        if (paragraphContent.length > 0) {
          processedLines.push(`<p>${paragraphContent.join(' ')}</p>`);
          paragraphContent = [];
        }
        processedLines.push(trimmed);
      } else {
        paragraphContent.push(trimmed);
      }
    });

    if (paragraphContent.length > 0) {
      processedLines.push(`<p>${paragraphContent.join(' ')}</p>`);
    }

    return processedLines.join('\n');
  }

  function setupTabs(container) {
    container.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const tabId = tab.dataset.tab;
        const parent = tab.closest('.result-section');

        parent.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        parent.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));

        tab.classList.add('active');
        parent.querySelector(`#${tabId}`).classList.add('active');
      });
    });
  }

  function setupCopyButtons(container, profile) {
    // Copy narrative button
    const narrativeBtn = container.querySelector('[data-copy-narrative]');
    if (narrativeBtn) {
      narrativeBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(profile.narratives.factual).then(() => {
          // eslint-disable-next-line no-alert
          alert('✅ Profile copied to clipboard!');
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to copy:', err);
          // eslint-disable-next-line no-alert
          alert('Failed to copy. Please try again.');
        });
      });
    }

    // Copy embed code button
    const embedBtn = container.querySelector('[data-copy-embed]');
    if (embedBtn) {
      embedBtn.addEventListener('click', () => {
        const embedCode = generateEmbedCode(profile);
        navigator.clipboard.writeText(embedCode).then(() => {
          // eslint-disable-next-line no-alert
          alert('✅ Embed code copied to clipboard!\n\nPaste it into your product page HTML.');
        }).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('Failed to copy:', err);
          // eslint-disable-next-line no-alert
          alert('Failed to copy. Please try again.');
        });
      });
    }
  }

  function displayError(error) {
    const errorMessage = error.message || 'Unknown error occurred';
    const lines = errorMessage.split('\n').filter((line) => line.trim());
    
    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = `
      <div class="result-section error-container">
        <div class="error-header">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#e34850" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <h2 style="color: #e34850; margin: 0;">Unable to Generate Profile</h2>
        </div>
        <div class="error-message">
          ${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  function displayProfile(profile) {
    const productName = profile.structuredData.name;
    const embedCodeHtml = escapeHtml(generateEmbedCode(profile));
    window.currentNarrative = profile.narratives.factual;

    const html = `
      <div class="result-section">
        <h2>${productName}${profile.metadata.aiPowered ? '<span class="ai-powered-badge">🤖 AI Powered</span>' : ''}</h2>
        
        <div class="tabs">
          <button class="tab active" data-tab="narrative">Product Profile</button>
          <button class="tab" data-tab="embed">📋 Embed Code</button>
          <button class="tab" data-tab="structured">Structured Data</button>
          <button class="tab" data-tab="raw">Raw Extracted Data</button>
        </div>

        <div class="tab-content active" id="narrative">
          ${profile.structuredData.competitor_comparison && Object.keys(profile.structuredData.competitor_comparison).length > 0 ? `
            <div class="competitive-edge-box">
              <h4>
                <span>${profile.metadata.aiPowered ? '🤖' : '🔍'}</span> 
                Competitive Edge ${profile.metadata.aiPowered ? '(AI-Detected)' : ''}
              </h4>
              ${Object.entries(profile.structuredData.competitor_comparison).map(([comp, text]) => `
                <div class="competitor-item">
                  <strong>vs ${comp}</strong>
                  <span>${text}</span>
                </div>
              `).join('')}
            </div>
          ` : ''}
          
          <div class="narrative-output">${markdownToHtml(profile.narratives.factual)}</div>
          <div class="word-count">${profile.narratives.factual.split(/\s+/).length} words</div>
          <button class="btn-copy" data-copy-narrative>📋 Copy Profile</button>
        </div>

        <div class="tab-content" id="embed">
          <div class="embed-info">
            <h3>🚀 Ready-to-Embed HTML for Your Product Page</h3>
            <p>Copy this code and paste it into your product page HTML. It includes:</p>
            <ul>
              <li>✅ Schema.org JSON-LD in the &lt;head&gt; (for structured data)</li>
              <li>✅ AI-generated conversational narrative (LLM-readable)</li>
              <li>✅ Competitor comparisons (unique GEO advantage)</li>
              <li>✅ Optimized for ChatGPT, Perplexity, Google AI, and other LLMs</li>
            </ul>
          </div>
          <pre class="json-output">${embedCodeHtml}</pre>
          <button class="btn-copy" data-copy-embed>📋 Copy Embed Code</button>
        </div>

        <div class="tab-content" id="structured">
          <pre class="json-output">${JSON.stringify(profile.structuredData, null, 2)}</pre>
        </div>

        <div class="tab-content" id="raw">
          <pre class="json-output">${JSON.stringify(profile.rawData, null, 2)}</pre>
        </div>
      </div>
    `;

    resultsDiv.innerHTML = html;
    setupTabs(resultsDiv);
    setupCopyButtons(resultsDiv, profile);
  }

  // Event listeners
  urlInput.addEventListener('input', (e) => {
    validateUrl(e.target);
  });

  generateBtn.addEventListener('click', async () => {
    const url = urlInput.value.trim();

    if (!url || !validateUrl(urlInput)) {
      // eslint-disable-next-line no-alert
      alert('Please enter a valid product URL');
      return;
    }

    resultsDiv.style.display = 'block';
    resultsDiv.innerHTML = '<div class="loading"><div class="spinner"></div>Generating product profile with AI-powered competitor detection...</div>';

    try {
      const profile = await generateProfile(url);
      displayProfile(profile);
    } catch (error) {
      console.error('Error generating profile:', error);
      displayError(error);
    }
  });
}
