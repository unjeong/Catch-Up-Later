// RSS/Atom Parser for Catch Up Later
// Uses offscreen document for DOM parsing (DOMParser not available in Service Worker)

const RSSParser = {
  /**
   * Parse RSS/Atom feed from URL
   * @param {string} feedUrl - Feed URL
   * @returns {Promise<{items: Array, feedInfo: Object}>}
   */
  async fetchAndParse(feedUrl) {
    try {
      const response = await fetch(feedUrl, {
        headers: {
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
          'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const xmlText = await response.text();
      return await this.parseXML(xmlText, feedUrl);
    } catch (error) {
      console.error('[RSSParser] Fetch failed:', error);
      throw error;
    }
  },
  
  /**
   * Parse XML string using offscreen document
   * @param {string} xmlString - XML content
   * @param {string} baseUrl - Base URL for relative links
   * @returns {Promise<{items: Array, feedInfo: Object}>}
   */
  async parseXML(xmlString, baseUrl) {
    // Offscreen document 확인/생성
    await ensureOffscreenDocument();
    
    // Offscreen document에서 파싱
    const result = await chrome.runtime.sendMessage({
      action: 'parseRSS',
      xml: xmlString,
      baseUrl: baseUrl
    });
    
    if (!result || !result.success) {
      throw new Error(result?.error || 'Failed to parse feed');
    }
    
    return {
      items: result.items || [],
      feedInfo: result.feedInfo || {}
    };
  },
  
  /**
   * Auto-detect RSS feed URL from a webpage
   * @param {string} pageUrl - Webpage URL
   * @returns {Promise<string|null>} - Feed URL or null
   */
  async autoDetectFeed(pageUrl) {
    try {
      // Common RSS paths to try
      const commonPaths = [
        '/feed',
        '/rss',
        '/rss.xml',
        '/feed.xml',
        '/atom.xml',
        '/feeds/posts/default',
        '/index.xml',
        '/feed/rss',
        '/rss/feed',
        '/.rss'
      ];
      
      const baseUrl = new URL(pageUrl).origin;
      
      // Try common paths first
      for (const path of commonPaths) {
        try {
          const feedUrl = baseUrl + path;
          const response = await fetch(feedUrl, { method: 'HEAD' });
          
          if (response.ok) {
            const contentType = response.headers.get('Content-Type') || '';
            if (contentType.includes('xml') || contentType.includes('rss') || contentType.includes('atom')) {
              return feedUrl;
            }
          }
        } catch (e) {
          // Continue to next path
        }
      }
      
      // Fetch the page and look for RSS link in HTML
      const response = await fetch(pageUrl);
      const html = await response.text();
      
      // Look for <link type="application/rss+xml" ...>
      const rssMatch = html.match(/<link[^>]*type=["']application\/rss\+xml["'][^>]*href=["']([^"']+)["']/i);
      if (rssMatch) {
        return this.resolveUrl(rssMatch[1], pageUrl);
      }
      
      // Look for <link type="application/atom+xml" ...>
      const atomMatch = html.match(/<link[^>]*type=["']application\/atom\+xml["'][^>]*href=["']([^"']+)["']/i);
      if (atomMatch) {
        return this.resolveUrl(atomMatch[1], pageUrl);
      }
      
      // Alternative patterns
      const altMatch = html.match(/href=["']([^"']*(?:rss|feed|atom)[^"']*)["']/i);
      if (altMatch && (altMatch[1].includes('.xml') || altMatch[1].includes('/feed'))) {
        return this.resolveUrl(altMatch[1], pageUrl);
      }
      
      return null;
    } catch (error) {
      console.error('[RSSParser] Auto-detect failed:', error);
      return null;
    }
  },
  
  /**
   * Resolve relative URL to absolute
   */
  resolveUrl(url, baseUrl) {
    if (!url) return '';
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    try {
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }
};

// Offscreen document 생성/확인
let creatingOffscreenForRSS = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = 'offscreen.html';
  
  // 이미 존재하는지 확인
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [chrome.runtime.getURL(offscreenUrl)]
  });
  
  if (existingContexts.length > 0) {
    return;
  }
  
  // 생성 중이면 대기
  if (creatingOffscreenForRSS) {
    await creatingOffscreenForRSS;
    return;
  }
  
  // 새로 생성
  creatingOffscreenForRSS = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['DOM_PARSER'],
    justification: 'Parse RSS/Atom feeds and HTML'
  });
  
  await creatingOffscreenForRSS;
  creatingOffscreenForRSS = null;
}

// Export for service worker
if (typeof self !== 'undefined') {
  self.RSSParser = RSSParser;
}
