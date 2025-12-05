// RSS Feed Manager for Catch Up Later
// Manages RSS feed subscriptions and checks for new items

const RSSManager = {
  STORAGE_KEY: 'rss_feeds',
  STATE_KEY: 'rss_feed_states',
  
  /**
   * Get all RSS feeds
   * @returns {Promise<Array>}
   */
  async getFeeds() {
    const { [this.STORAGE_KEY]: feeds = [] } = await chrome.storage.sync.get(this.STORAGE_KEY);
    return feeds;
  },
  
  /**
   * Get feed states (local storage - new items, last check, etc.)
   * @returns {Promise<Object>}
   */
  async getFeedStates() {
    const { [this.STATE_KEY]: states = {} } = await chrome.storage.local.get(this.STATE_KEY);
    return states;
  },
  
  /**
   * Add a new RSS feed
   * @param {string} feedUrl - RSS feed URL
   * @param {string} displayName - Optional display name
   * @returns {Promise<{success: boolean, feed?: Object, error?: string}>}
   */
  async addFeed(feedUrl, displayName = '') {
    try {
      const feeds = await this.getFeeds();
      
      // Check for duplicates
      if (feeds.some(f => f.url === feedUrl)) {
        return { success: false, error: 'Feed already exists' };
      }
      
      // Validate and fetch feed info
      const { items, feedInfo } = await self.RSSParser.fetchAndParse(feedUrl);
      
      if (items.length === 0) {
        return { success: false, error: 'No items found in feed' };
      }
      
      const feed = {
        id: Date.now().toString(),
        url: feedUrl,
        name: displayName || feedInfo.title || this.extractDomain(feedUrl),
        description: feedInfo.description || '',
        image: feedInfo.image || null,
        addedAt: new Date().toISOString()
      };
      
      feeds.push(feed);
      await chrome.storage.sync.set({ [this.STORAGE_KEY]: feeds });
      
      // Initialize state
      const states = await this.getFeedStates();
      states[feed.id] = {
        lastCheck: new Date().toISOString(),
        lastItemGuids: items.slice(0, 50).map(i => i.guid),
        newCount: 0,
        newItems: []
      };
      await chrome.storage.local.set({ [this.STATE_KEY]: states });
      
      return { success: true, feed, itemCount: items.length };
      
    } catch (error) {
      console.error('[RSSManager] Add feed failed:', error);
      return { success: false, error: error.message || 'Failed to add feed' };
    }
  },
  
  /**
   * Remove a feed
   * @param {string} feedId - Feed ID
   * @returns {Promise<{success: boolean}>}
   */
  async removeFeed(feedId) {
    try {
      const feeds = await this.getFeeds();
      const newFeeds = feeds.filter(f => f.id !== feedId);
      await chrome.storage.sync.set({ [this.STORAGE_KEY]: newFeeds });
      
      // Remove state
      const states = await this.getFeedStates();
      delete states[feedId];
      await chrome.storage.local.set({ [this.STATE_KEY]: states });
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Check a single feed for new items
   * @param {string} feedId - Feed ID
   * @returns {Promise<{success: boolean, count: number, items: Array}>}
   */
  async checkFeed(feedId) {
    try {
      const feeds = await this.getFeeds();
      const feed = feeds.find(f => f.id === feedId);
      
      if (!feed) {
        return { success: false, error: 'Feed not found' };
      }
      
      const { items } = await self.RSSParser.fetchAndParse(feed.url);
      const states = await this.getFeedStates();
      const state = states[feedId] || { lastItemGuids: [], newCount: 0, newItems: [] };
      
      // Find new items
      const oldGuids = new Set(state.lastItemGuids);
      const newItems = items.filter(item => !oldGuids.has(item.guid));
      
      // Update state
      states[feedId] = {
        lastCheck: new Date().toISOString(),
        lastItemGuids: items.slice(0, 50).map(i => i.guid),
        newCount: newItems.length,
        newItems: newItems.slice(0, 20).map(item => ({
          title: item.title,
          link: item.link,
          pubDate: item.pubDate || null,  // Already ISO string from parser
          author: item.author || ''
        }))
      };
      
      await chrome.storage.local.set({ [this.STATE_KEY]: states });
      
      return { 
        success: true, 
        count: newItems.length, 
        items: states[feedId].newItems 
      };
      
    } catch (error) {
      console.error('[RSSManager] Check feed failed:', error);
      return { success: false, error: error.message, count: 0, items: [] };
    }
  },
  
  /**
   * Check all feeds for new items
   * @returns {Promise<{totalCount: number, results: Object}>}
   */
  async checkAllFeeds() {
    console.log('[RSSManager] Checking all feeds...');
    const feeds = await this.getFeeds();
    console.log('[RSSManager] Found', feeds.length, 'feeds to check');
    
    const results = {};
    let totalCount = 0;
    
    for (const feed of feeds) {
      console.log('[RSSManager] Checking feed:', feed.name, feed.id);
      const result = await this.checkFeed(feed.id);
      results[feed.id] = result;
      totalCount += result.count || 0;
      console.log('[RSSManager] Feed result:', feed.name, '- new items:', result.count || 0);
    }
    
    console.log('[RSSManager] Total new items:', totalCount);
    return { totalCount, results };
  },
  
  /**
   * Mark a feed as read
   * @param {string} feedId - Feed ID
   * @returns {Promise<{success: boolean}>}
   */
  async markFeedAsRead(feedId) {
    try {
      const states = await this.getFeedStates();
      
      if (states[feedId]) {
        states[feedId].newCount = 0;
        states[feedId].newItems = [];
        await chrome.storage.local.set({ [this.STATE_KEY]: states });
      }
      
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Mark all feeds as read
   * @returns {Promise<{success: boolean}>}
   */
  async markAllFeedsAsRead() {
    try {
      const states = await this.getFeedStates();
      
      Object.keys(states).forEach(feedId => {
        states[feedId].newCount = 0;
        states[feedId].newItems = [];
      });
      
      await chrome.storage.local.set({ [this.STATE_KEY]: states });
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Get feeds with their current state
   * @returns {Promise<Array>}
   */
  async getFeedsWithState() {
    const feeds = await this.getFeeds();
    const states = await this.getFeedStates();
    
    return feeds.map(feed => ({
      ...feed,
      ...(states[feed.id] || { newCount: 0, newItems: [], lastCheck: null })
    }));
  },
  
  /**
   * Get total new items count across all feeds
   * @returns {Promise<number>}
   */
  async getTotalNewCount() {
    const states = await this.getFeedStates();
    return Object.values(states).reduce((sum, state) => sum + (state.newCount || 0), 0);
  },
  
  /**
   * Auto-detect RSS feed from a webpage URL
   * @param {string} pageUrl - Webpage URL
   * @returns {Promise<{success: boolean, feedUrl?: string, error?: string}>}
   */
  async autoDetect(pageUrl) {
    try {
      const feedUrl = await self.RSSParser.autoDetectFeed(pageUrl);
      
      if (feedUrl) {
        return { success: true, feedUrl };
      }
      
      return { success: false, error: 'No RSS feed found' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },
  
  /**
   * Get RSS status summary
   * @returns {Promise<{connected: boolean, feedCount: number, totalNewCount: number}>}
   */
  async getRSSStatus() {
    const feeds = await this.getFeeds();
    const totalNewCount = await this.getTotalNewCount();
    
    return {
      connected: feeds.length > 0,
      feedCount: feeds.length,
      totalNewCount
    };
  },
  
  // ===== Helper Methods =====
  
  extractDomain(url) {
    try {
      const hostname = new URL(url).hostname.replace('www.', '');
      return hostname.split('.')[0];
    } catch {
      return 'RSS Feed';
    }
  },
  
  /**
   * Popular RSS feeds for suggestions
   */
  getPopularFeeds() {
    return [
      { name: 'GeekNews', url: 'https://news.hada.io/rss/news', description: '한국 개발자 뉴스' },
      { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', description: 'Tech news' },
      { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', description: 'Tech startup news' },
      { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', description: 'Tech & science' },
      { name: 'Ars Technica', url: 'https://feeds.arstechnica.com/arstechnica/index', description: 'Tech analysis' }
    ];
  }
};

// Export for service worker
if (typeof self !== 'undefined') {
  self.RSSManager = RSSManager;
}

