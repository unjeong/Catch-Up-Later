// Offscreen document for HTML/RSS parsing (DOM API available here)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parseHtml') {
    const result = parseHtmlAndExtractPosts(message.html, message.selector, message.baseUrl);
    sendResponse(result);
  }
  
  if (message.action === 'parseRSS') {
    const result = parseRSSFeed(message.xml, message.baseUrl);
    sendResponse(result);
  }
  
  return true;
});

// ===== RSS/Atom 파싱 =====
function parseRSSFeed(xmlString, baseUrl) {
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlString, 'text/xml');
    
    // Check for parse errors
    const parseError = xml.querySelector('parsererror');
    if (parseError) {
      return { success: false, error: 'Invalid XML format' };
    }
    
    // Try RSS 2.0 first
    const rssChannel = xml.querySelector('rss > channel');
    if (rssChannel) {
      return { success: true, ...parseRSS2(rssChannel, baseUrl) };
    }
    
    // Try Atom
    const atomFeed = xml.querySelector('feed');
    if (atomFeed) {
      return { success: true, ...parseAtom(atomFeed, baseUrl) };
    }
    
    // Try RDF/RSS 1.0
    const rdfChannel = xml.querySelector('channel');
    const rdfItems = xml.querySelectorAll('item');
    if (rdfChannel && rdfItems.length > 0) {
      return { success: true, ...parseRDF(rdfChannel, rdfItems, baseUrl) };
    }
    
    return { success: false, error: 'Unknown feed format' };
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function parseRSS2(channel, baseUrl) {
  const feedInfo = {
    title: getTextContent(channel, 'title'),
    description: getTextContent(channel, 'description'),
    link: getTextContent(channel, 'link'),
    language: getTextContent(channel, 'language'),
    lastBuildDate: getTextContent(channel, 'lastBuildDate'),
    image: getTextContent(channel, 'image > url') || null
  };
  
  const itemElements = channel.querySelectorAll('item');
  const items = Array.from(itemElements).map(item => {
    const link = getTextContent(item, 'link') || getTextContent(item, 'guid');
    
    return {
      title: getTextContent(item, 'title') || 'Untitled',
      link: resolveUrl(link, baseUrl),
      description: cleanHtml(getTextContent(item, 'description')),
      pubDate: parseDate(getTextContent(item, 'pubDate')),
      author: getTextContent(item, 'author') || getTextContent(item, 'dc\\:creator'),
      guid: getTextContent(item, 'guid') || link
    };
  });
  
  return { items, feedInfo };
}

function parseAtom(feed, baseUrl) {
  const feedInfo = {
    title: getTextContent(feed, 'title'),
    description: getTextContent(feed, 'subtitle'),
    link: getAtomLink(feed, 'alternate') || getAtomLink(feed),
    language: feed.getAttribute('xml:lang'),
    lastBuildDate: getTextContent(feed, 'updated'),
    image: getTextContent(feed, 'logo') || getTextContent(feed, 'icon')
  };
  
  const entryElements = feed.querySelectorAll('entry');
  const items = Array.from(entryElements).map(entry => {
    const link = getAtomLink(entry, 'alternate') || getAtomLink(entry);
    
    return {
      title: getTextContent(entry, 'title') || 'Untitled',
      link: resolveUrl(link, baseUrl),
      description: cleanHtml(
        getTextContent(entry, 'content') || 
        getTextContent(entry, 'summary')
      ),
      pubDate: parseDate(
        getTextContent(entry, 'published') || 
        getTextContent(entry, 'updated')
      ),
      author: getTextContent(entry, 'author > name'),
      guid: getTextContent(entry, 'id') || link
    };
  });
  
  return { items, feedInfo };
}

function parseRDF(channel, itemElements, baseUrl) {
  const feedInfo = {
    title: getTextContent(channel, 'title'),
    description: getTextContent(channel, 'description'),
    link: getTextContent(channel, 'link'),
    language: getTextContent(channel, 'dc\\:language'),
    lastBuildDate: getTextContent(channel, 'dc\\:date')
  };
  
  const items = Array.from(itemElements).map(item => {
    const link = getTextContent(item, 'link') || item.getAttribute('rdf:about');
    
    return {
      title: getTextContent(item, 'title') || 'Untitled',
      link: resolveUrl(link, baseUrl),
      description: cleanHtml(getTextContent(item, 'description')),
      pubDate: parseDate(getTextContent(item, 'dc\\:date')),
      author: getTextContent(item, 'dc\\:creator'),
      guid: link
    };
  });
  
  return { items, feedInfo };
}

// Helper functions for RSS parsing
function getTextContent(element, selector) {
  const el = element.querySelector(selector);
  return el ? el.textContent.trim() : '';
}

function getAtomLink(element, rel = null) {
  const links = element.querySelectorAll('link');
  for (const link of links) {
    const linkRel = link.getAttribute('rel') || 'alternate';
    if (!rel || linkRel === rel) {
      return link.getAttribute('href');
    }
  }
  return null;
}

function parseDate(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    return isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function resolveUrl(url, baseUrl) {
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

function cleanHtml(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let text = doc.body.textContent || '';
  if (text.length > 300) {
    text = text.substring(0, 297) + '...';
  }
  return text.trim();
}

function parseHtmlAndExtractPosts(html, selector, baseUrl) {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    
    // 로그인 페이지 감지
    const bodyText = doc.body?.innerText?.toLowerCase() || '';
    const loginPageKeywords = ['로그인', 'login', 'sign in', '비밀번호', 'password'];
    const hasLoginForm = doc.querySelector('input[type="password"]') !== null;
    const hasLoginKeyword = loginPageKeywords.some(keyword => bodyText.includes(keyword));
    
    // 선택자로 요소 찾기
    const elements = doc.querySelectorAll(selector);
    
    // 로그인 페이지인지 확인 (요소가 없고 로그인 폼이 있는 경우)
    const isLoginPage = elements.length === 0 && hasLoginForm && hasLoginKeyword;
    
    if (isLoginPage) {
      return { posts: [], isLoggedIn: false };
    }
    
    if (elements.length === 0) {
      return { posts: [], isLoggedIn: true, error: 'Elements not found' };
    }
    
    const posts = [];
    const baseUrlObj = new URL(baseUrl);
    
    elements.forEach((el, index) => {
      // 제목 추출
      const titleSelectors = [
        'a.title', '.title a', '.subject a', 'a.subject', 
        '.tit a', 'a.tit', 'h2 a', 'h3 a', '.list_subject a',
        'td.title a', 'td.subject a', '.article-title a',
        '.table_row .subject a', '.deco', // 루리웹
        'a'
      ];
      let title = '';
      let link = '';
      
      for (const sel of titleSelectors) {
        const titleEl = el.querySelector(sel);
        if (titleEl && titleEl.textContent.trim()) {
          title = titleEl.textContent.trim();
          // getAttribute를 먼저 사용해서 원본 href 값을 가져옴 (href 프로퍼티는 extension origin으로 해석됨)
          link = titleEl.getAttribute('href') || '';
          break;
        }
      }
      
      if (!title) {
        title = el.textContent.trim().substring(0, 100) || `Post ${index + 1}`;
      }
      
      // 상대 URL을 절대 URL로 변환
      if (link) {
        if (!link.startsWith('http://') && !link.startsWith('https://')) {
          try {
            link = new URL(link, baseUrl).href;
          } catch (e) {
            link = baseUrlObj.origin + (link.startsWith('/') ? '' : '/') + link;
          }
        }
      }
      
      // 날짜 추출
      const dateSelectors = ['.date', '.time', '.timestamp', '.regdate', 
                            'td.date', 'td.time', '.list_date', 'time'];
      let date = '';
      for (const sel of dateSelectors) {
        const dateEl = el.querySelector(sel);
        if (dateEl) {
          date = dateEl.textContent.trim();
          break;
        }
      }
      
      if (title && title.length > 1) {
        posts.push({ title, link: link || baseUrl, date, author: '' });
      }
    });
    
    return { posts, isLoggedIn: true };
    
  } catch (e) {
    return { posts: [], isLoggedIn: true, error: e.message };
  }
}

