// Offscreen document for HTML parsing (DOM API available here)

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'parseHtml') {
    const result = parseHtmlAndExtractPosts(message.html, message.selector, message.baseUrl);
    sendResponse(result);
  }
  return true;
});

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
          link = titleEl.href || titleEl.getAttribute('href') || '';
          break;
        }
      }
      
      if (!title) {
        title = el.textContent.trim().substring(0, 100) || `Post ${index + 1}`;
      }
      
      // 상대 URL을 절대 URL로 변환
      if (link && !link.startsWith('http')) {
        try {
          link = new URL(link, baseUrl).href;
        } catch (e) {
          link = baseUrlObj.origin + (link.startsWith('/') ? '' : '/') + link;
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

