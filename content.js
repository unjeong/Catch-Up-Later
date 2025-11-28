// Catch Up Later - Content Script

// 요소 선택 모드 상태
let isSelectMode = false;
let selectOverlay = null;
let hoveredElement = null;
let pendingUrl = null;

// 페이지 로드 시 실행
(function() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'extractPosts') {
      const result = extractPostsFromPage(message.selector);
      sendResponse(result);
    }
    
    if (message.action === 'autoDetectPosts') {
      const result = autoDetectBestSelector();
      sendResponse(result);
    }
    
    if (message.action === 'startSelectMode') {
      pendingUrl = message.url;
      startSelectMode();
      sendResponse({ success: true });
    }
    
    if (message.action === 'stopSelectMode') {
      stopSelectMode();
      sendResponse({ success: true });
    }
    
    return true;
  });
})();

// ===== 게시글 자동 감지 =====

function autoDetectBestSelector() {
  // 제외해야 할 컨테이너들 (네비게이션, 메뉴, 사이드바 등)
  const excludeSelectors = [
    'nav', 'header', 'footer', 
    '.nav', '.header', '.footer', '.menu', '.sidebar', '.navigation',
    '[role="navigation"]', '[role="menu"]', '[role="menubar"]',
    '.gnb', '.lnb', '.snb', '.quick', '.quickmenu',
    '.top-menu', '.main-menu', '.sub-menu', '.site-menu',
    '.breadcrumb', '.pagination', '.paging'
  ].join(', ');
  
  const results = [];
  
  // ===== 1. 테이블 기반 게시판 감지 (우선) =====
  const tableResult = detectTableBoard(excludeSelectors);
  if (tableResult) results.push(tableResult);
  
  // ===== 2. Article 태그 감지 =====
  const articleResult = detectArticles(excludeSelectors);
  if (articleResult) results.push(articleResult);
  
  // ===== 3. 게시글 관련 클래스 감지 =====
  const classResult = detectByClass(excludeSelectors);
  if (classResult) results.push(classResult);
  
  // ===== 4. 리스트 기반 게시판 감지 =====
  const listResult = detectListBoard(excludeSelectors);
  if (listResult) results.push(listResult);
  
  // 최고 점수 선택
  if (results.length === 0) {
    return { success: false, error: '게시글을 찾을 수 없습니다' };
  }
  
  results.sort((a, b) => b.score - a.score);
  const best = results[0];
  
  if (best.score >= 50) {
    return {
      success: true,
      selector: best.selector,
      count: best.count,
      score: best.score
    };
  }
  
  return { success: false, error: '게시글을 찾을 수 없습니다' };
}

// 테이블 기반 게시판 감지
function detectTableBoard(excludeSelectors) {
  // 먼저 특수한 테이블 행 클래스 패턴 확인 (뽐뿌, Hacker News 등)
  const specialRowPatterns = [
    { selector: '.table_body .table_row', priority: 135 },  // 루리웹
    { selector: 'tr.baseList', priority: 130 },  // 뽐뿌
    { selector: 'tr.athing', priority: 130 },    // Hacker News
    { selector: 'tr.list0, tr.list1', priority: 125 },  // 제로보드 스타일
    { selector: 'tr[class*="post"]', priority: 120 },
    { selector: 'tr[class*="article"]', priority: 120 },
  ];
  
  for (const { selector, priority } of specialRowPatterns) {
    try {
      const rows = document.querySelectorAll(selector);
      const valid = Array.from(rows).filter(row => 
        !row.closest(excludeSelectors) && row.querySelector('a[href]')
      );
      
      if (valid.length >= 5) {
        return { selector, count: valid.length, score: priority, type: 'table-special' };
      }
    } catch (e) { continue; }
  }
  
  const tables = document.querySelectorAll('table');
  let bestTable = null;
  let bestScore = 0;
  let bestSelector = '';
  
  for (const table of tables) {
    // 제외 영역 안에 있으면 스킵
    if (table.closest(excludeSelectors)) continue;
    
    const tbody = table.querySelector('tbody');
    const rows = tbody ? tbody.querySelectorAll('tr') : table.querySelectorAll('tr');
    
    // 최소 5개 이상의 행이 있어야 함
    if (rows.length < 5) continue;
    
    let score = 0;
    let validRowCount = 0;
    
    // 각 행 분석
    for (const row of rows) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 2) continue; // 최소 2개 셀
      
      const hasLink = row.querySelector('a[href]');
      const text = row.textContent.trim();
      
      // 링크가 있고 텍스트가 적절한 길이면 게시글 행으로 판단
      if (hasLink && text.length > 10 && text.length < 500) {
        validRowCount++;
      }
    }
    
    // 유효한 행이 5개 이상이면 게시판으로 판단
    if (validRowCount >= 5) {
      score = 120; // 테이블 기본 점수 높게
      
      // 행 개수 보너스
      if (validRowCount >= 10 && validRowCount <= 100) {
        score += 30;
      } else if (validRowCount >= 5) {
        score += 15;
      }
      
      // 날짜 컬럼이 있으면 보너스
      const hasDateColumn = Array.from(rows).some(row => {
        const text = row.textContent;
        return /\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/.test(text) || 
               /\d{1,2}[.\-\/]\d{1,2}/.test(text);
      });
      if (hasDateColumn) score += 20;
      
      // 테이블 클래스에 게시판 관련 키워드가 있으면 보너스
      const tableClass = (table.className + ' ' + table.closest('div')?.className).toLowerCase();
      if (/board|list|bbs|notice|post|article|tbl|table/.test(tableClass)) {
        score += 25;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestTable = table;
        
        // 선택자 생성
        const parent = table.closest('div[class]');
        if (parent) {
          const parentClass = parent.className.split(' ')[0];
          bestSelector = `.${parentClass} table tbody tr`;
          // 검증
          if (document.querySelectorAll(bestSelector).length !== validRowCount) {
            bestSelector = `.${parentClass} table tr`;
          }
        } else if (table.id) {
          bestSelector = `#${table.id} tbody tr`;
        } else {
          bestSelector = 'table tbody tr';
        }
      }
    }
  }
  
  if (bestTable && bestScore > 0) {
    const count = document.querySelectorAll(bestSelector).length;
    return { selector: bestSelector, count, score: bestScore, type: 'table' };
  }
  
  return null;
}

// Article 태그 감지
function detectArticles(excludeSelectors) {
  const articles = document.querySelectorAll('article');
  const validArticles = Array.from(articles).filter(el => !el.closest(excludeSelectors));
  
  if (validArticles.length < 3) return null;
  
  let score = 100; // article은 시맨틱하게 게시글을 의미
  
  // 링크 포함 비율
  const withLinks = validArticles.filter(el => el.querySelector('a[href]')).length;
  score += (withLinks / validArticles.length) * 30;
  
  // 적절한 개수 보너스
  if (validArticles.length >= 5 && validArticles.length <= 50) {
    score += 20;
  }
  
  // 제목 태그 포함
  if (validArticles.some(el => el.querySelector('h1, h2, h3, h4'))) {
    score += 15;
  }
  
  return { selector: 'article', count: validArticles.length, score, type: 'article' };
}

// 클래스 기반 감지
function detectByClass(excludeSelectors) {
  const classPatterns = [
    // ===== 사이트별 특수 패턴 (우선순위 최상) =====
    { pattern: '.topic_row', priority: 100 },           // GeekNews
    { pattern: '.crayons-story', priority: 100 },       // Dev.to
    { pattern: '.table_body .table_row', priority: 100 }, // 루리웹
    { pattern: '.board_list_table tbody tr', priority: 100 }, // 루리웹 테이블
    { pattern: '.list_item:not(.notice)', priority: 98 },  // 클리앙
    { pattern: '.symph_row', priority: 98 },            // 클리앙 게시글 행
    { pattern: '.content_list > div', priority: 95 },   // 컨텐츠 리스트
    
    // ===== Reddit 스타일 =====
    { pattern: '[data-testid="post-container"]', priority: 95 },  // Reddit
    { pattern: '.Post', priority: 90 },                 // Reddit old
    
    // ===== 일반 게시글 패턴 =====
    { pattern: '[class*="post-item"]', priority: 90 },
    { pattern: '[class*="article-item"]', priority: 90 },
    { pattern: '[class*="board-item"]', priority: 90 },
    { pattern: '[class*="news-item"]', priority: 88 },
    { pattern: '[class*="story-item"]', priority: 88 },
    { pattern: '[class*="list-item"]:not([class*="menu"])', priority: 85 },
    { pattern: '[class*="content-item"]', priority: 85 },
    
    // ===== 카드/엔트리 스타일 =====
    { pattern: '.card:not(.menu-card):not(.nav-card)', priority: 75 },
    { pattern: '.post:not(.menu-post)', priority: 75 },
    { pattern: '.article:not(.menu-article)', priority: 75 },
    { pattern: '.item:not(.menu-item):not(.nav-item)', priority: 70 },
    { pattern: '.entry', priority: 70 },
    { pattern: '.story', priority: 70 },
  ];
  
  let best = null;
  
  for (const { pattern, priority } of classPatterns) {
    try {
      const elements = document.querySelectorAll(pattern);
      const valid = Array.from(elements).filter(el => !el.closest(excludeSelectors));
      
      if (valid.length < 3) continue;
      
      let score = priority;
      
      // 링크 비율
      const withLinks = valid.filter(el => el.querySelector('a[href]')).length;
      score += (withLinks / valid.length) * 30;
      
      // 개수 보너스
      if (valid.length >= 5 && valid.length <= 50) {
        score += 20;
      } else if (valid.length > 100) {
        score -= 20;
      }
      
      if (!best || score > best.score) {
        best = { selector: pattern, count: valid.length, score, type: 'class' };
      }
    } catch (e) {
      continue;
    }
  }
  
  return best;
}

// 리스트 기반 게시판 감지 (개선된 버전)
function detectListBoard(excludeSelectors) {
  // 메뉴/네비게이션/슬라이더 ul은 명시적으로 제외
  const menuExcludes = [
    'ul.menu', 'ul.nav', 'ul.navigation', 'ul.gnb', 'ul.lnb', 'ul.snb',
    'ul.main-menu', 'ul.sub-menu', 'ul.site-menu', 'ul.top-menu',
    'nav ul', 'header ul', '.nav ul', '.menu ul', '.navigation ul',
    '[role="navigation"] ul', '[role="menu"] ul'
  ];
  
  // 게시글이 아닌 리스트 클래스 (제외)
  const nonPostListClasses = /favorite|slider|banner|carousel|swiper|tab|gnb|lnb|snb|menu|nav|footer|info/i;
  
  // 게시글 리스트로 추정되는 클래스 (높은 우선순위)
  const postListClasses = /popular|best|hot|new|recent|latest|article|post|board|notice|bbs|news|list_article|list_post/i;
  
  // 게시판 ul/ol 후보 찾기 (우선순위 순)
  const boardListPatterns = [
    // 인기/최신 게시글 패턴 (가장 높은 우선순위) - ol, ul 둘 다 체크
    { selector: 'ol.list_popular > li', priority: 100 },
    { selector: 'ol.list_best > li', priority: 100 },
    { selector: 'ol.list_hot > li', priority: 100 },
    { selector: 'ol.list_new > li', priority: 100 },
    { selector: 'ol.list_recent > li', priority: 100 },
    { selector: 'ol[class*="popular"] > li', priority: 98 },
    { selector: 'ol[class*="best"] > li', priority: 98 },
    { selector: '.list_popular > li', priority: 95 },
    { selector: '.list_best > li', priority: 95 },
    { selector: '.list_hot > li', priority: 95 },
    { selector: '.list_new > li', priority: 95 },
    { selector: '.list_recent > li', priority: 95 },
    { selector: '.list_latest > li', priority: 95 },
    { selector: '[class*="popular"] > li', priority: 90 },
    { selector: '[class*="best"] > li', priority: 90 },
    // 일반 게시판 패턴
    { selector: 'ol.board-list > li', priority: 88 },
    { selector: 'ol.post-list > li', priority: 88 },
    { selector: 'ul.board-list > li', priority: 85 },
    { selector: 'ul.post-list > li', priority: 85 },
    { selector: 'ul.article-list > li', priority: 85 },
    { selector: 'ul.notice-list > li', priority: 85 },
    { selector: 'ul.bbs-list > li', priority: 85 },
    { selector: '.board-list > li', priority: 80 },
    { selector: '.list-wrap > li', priority: 75 },
    { selector: '.list-body > li', priority: 75 },
  ];
  
  let best = null;
  
  // 명시적인 게시판 리스트 먼저 찾기
  for (const { selector, priority } of boardListPatterns) {
    try {
      const elements = document.querySelectorAll(selector);
      const valid = Array.from(elements).filter(el => !el.closest(excludeSelectors));
      
      if (valid.length < 3) continue;
      
      let score = priority;
      
      // 링크 비율
      const withLinks = valid.filter(el => el.querySelector('a[href]')).length;
      score += (withLinks / valid.length) * 30;
      
      // 개수 보너스
      if (valid.length >= 5 && valid.length <= 50) {
        score += 20;
      }
      
      // 게시글 패턴 보너스 (숫자 순위, 카페명 등)
      const hasRanking = valid.some(el => /^\d+\s/.test(el.textContent.trim()));
      if (hasRanking) score += 15;
      
      if (!best || score > best.score) {
        best = { selector, count: valid.length, score, type: 'list' };
      }
    } catch (e) {
      continue;
    }
  }
  
  if (best && best.score >= 80) return best;
  
  // 일반 ul/ol > li 탐색 (더 엄격한 조건)
  const allLists = document.querySelectorAll('ul, ol');
  
  for (const list of allLists) {
    // 메뉴/네비게이션 ul 제외
    if (list.closest(excludeSelectors)) continue;
    if (menuExcludes.some(sel => {
      try { return list.matches(sel) || list.closest(sel); } catch { return false; }
    })) continue;
    
    const listClass = list.className.toLowerCase();
    const parentClass = (list.parentElement?.className || '').toLowerCase();
    const combinedClass = listClass + ' ' + parentClass;
    
    // 게시글이 아닌 리스트 제외
    if (nonPostListClasses.test(combinedClass)) continue;
    
    // 부모 클래스에 menu, nav 등이 있으면 제외
    if (/menu|nav|gnb|lnb|snb|quick|sitemap|breadcrumb|footer/.test(combinedClass)) continue;
    
    const lis = list.querySelectorAll(':scope > li');
    if (lis.length < 5) continue; // 최소 5개
    
    // 각 li가 게시글처럼 보이는지 확인
    let validCount = 0;
    for (const li of lis) {
      const hasLink = li.querySelector('a[href]');
      const text = li.textContent.trim();
      
      // 링크가 있고, 텍스트가 적절한 길이 (메뉴는 보통 짧음)
      if (hasLink && text.length > 20 && text.length < 500) {
        validCount++;
      }
    }
    
    // 유효한 li가 전체의 70% 이상이어야 함
    if (validCount < 5 || validCount / lis.length < 0.7) continue;
    
    let score = 50; // 일반 ul/ol > li는 기본 점수 낮게
    
    // 유효 개수 보너스
    if (validCount >= 10) score += 20;
    else if (validCount >= 5) score += 10;
    
    // 날짜 패턴이 있으면 보너스
    const hasDate = Array.from(lis).some(li => 
      /\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}/.test(li.textContent)
    );
    if (hasDate) score += 15;
    
    // 게시글 관련 클래스가 있으면 높은 보너스 (popular, best, hot 등)
    if (postListClasses.test(combinedClass)) {
      score += 40;
    }
    // 부모 클래스에 list, board 등이 있으면 보너스
    else if (/list|board|bbs|notice|post|article/.test(parentClass)) {
      score += 25;
    }
    
    // 선택자 생성 (ul/ol 구분)
    const tagName = list.tagName.toLowerCase();
    let selector = `${tagName} > li`;
    if (list.className) {
      const className = list.className.split(' ')[0];
      selector = `${tagName}.${className} > li`;
    } else if (list.parentElement?.className) {
      const parentClassName = list.parentElement.className.split(' ')[0];
      selector = `.${parentClassName} > ${tagName} > li`;
    }
    
    if (!best || score > best.score) {
      best = { selector, count: validCount, score, type: 'list' };
    }
  }
  
  return best;
}

// ===== 요소 선택 모드 =====

function startSelectMode() {
  if (isSelectMode) return;
  isSelectMode = true;
  
  // 오버레이 생성
  selectOverlay = document.createElement('div');
  selectOverlay.id = 'catchup-select-overlay';
  selectOverlay.innerHTML = `
    <div class="catchup-select-banner">
      <span>📌 게시글 아무 곳이나 클릭하세요 (파란 영역이 선택됩니다)</span>
      <button id="catchup-cancel-btn">취소</button>
    </div>
  `;
  document.body.appendChild(selectOverlay);
  
  // 스타일 추가
  const style = document.createElement('style');
  style.id = 'catchup-select-style';
  style.textContent = `
    #catchup-select-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      pointer-events: none;
    }
    .catchup-select-banner {
      background: linear-gradient(135deg, #3b82f6, #2563eb);
      color: white;
      padding: 12px 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 10px rgba(0,0,0,0.2);
      pointer-events: auto;
    }
    #catchup-cancel-btn {
      background: rgba(255,255,255,0.2);
      border: 1px solid rgba(255,255,255,0.3);
      color: white;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
    }
    #catchup-cancel-btn:hover {
      background: rgba(255,255,255,0.3);
    }
    .catchup-highlight {
      outline: 3px solid #3b82f6 !important;
      outline-offset: 2px !important;
      background-color: rgba(59, 130, 246, 0.1) !important;
      cursor: pointer !important;
    }
  `;
  document.head.appendChild(style);
  
  // 취소 버튼
  document.getElementById('catchup-cancel-btn').addEventListener('click', stopSelectMode);
  
  // 이벤트 리스너
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  document.addEventListener('click', handleClick, true);
  document.addEventListener('keydown', handleKeyDown, true);
}

function stopSelectMode() {
  if (!isSelectMode) return;
  isSelectMode = false;
  
  // 하이라이트 제거
  if (hoveredElement) {
    hoveredElement.classList.remove('catchup-highlight');
    hoveredElement = null;
  }
  
  // 오버레이 제거
  selectOverlay?.remove();
  document.getElementById('catchup-select-style')?.remove();
  
  // 이벤트 리스너 제거
  document.removeEventListener('mouseover', handleMouseOver, true);
  document.removeEventListener('mouseout', handleMouseOut, true);
  document.removeEventListener('click', handleClick, true);
  document.removeEventListener('keydown', handleKeyDown, true);
}

function handleMouseOver(e) {
  if (!isSelectMode) return;
  
  const target = e.target;
  
  // 오버레이 요소는 무시
  if (target.closest('#catchup-select-overlay')) return;
  
  // 실제 선택될 컨테이너 찾기
  const container = findPostContainer(target);
  if (!container) return;
  
  // 이전 하이라이트 제거
  if (hoveredElement && hoveredElement !== container) {
    hoveredElement.classList.remove('catchup-highlight');
  }
  
  // 새 하이라이트 (컨테이너 전체)
  container.classList.add('catchup-highlight');
  hoveredElement = container;
}

function handleMouseOut(e) {
  if (!isSelectMode) return;
  
  // 마우스가 하이라이트된 요소 밖으로 나갔는지 확인
  if (hoveredElement && !hoveredElement.contains(e.relatedTarget)) {
    hoveredElement.classList.remove('catchup-highlight');
  }
}

// 게시글 컨테이너 찾기 (우선순위 적용)
function findPostContainer(element) {
  // nav, header, footer 안의 요소는 바로 제외
  if (element.closest('nav, header, footer, .nav, .header, .footer, .menu, .sidebar, .navigation')) {
    return null;
  }
  
  // 우선순위 1: article 태그 (가장 명확한 게시글 컨테이너)
  const article = element.closest('article');
  if (article && !article.closest('nav, header, footer')) {
    return article;
  }
  
  // 우선순위 2: 게시글 관련 클래스가 있는 요소
  const postClasses = element.closest('[class*="post"], [class*="article"], [class*="item"], [class*="card"], [class*="entry"], [class*="content-item"], [class*="list-item"]');
  if (postClasses && !postClasses.closest('nav, header, footer')) {
    // 형제 요소가 2개 이상인지 확인 (반복되는 패턴)
    const siblings = postClasses.parentElement?.querySelectorAll(`:scope > ${postClasses.tagName}.${postClasses.className.split(' ')[0]}`);
    if (siblings && siblings.length >= 2) {
      return postClasses;
    }
  }
  
  // 우선순위 3: li, tr 태그 (목록형 게시판)
  const listItem = element.closest('li, tr');
  if (listItem && !listItem.closest('nav, header, footer, .menu, .nav, ul.menu, ol.menu')) {
    // 부모가 게시판 목록인지 확인 (형제가 여러 개)
    const siblings = listItem.parentElement?.children;
    if (siblings && siblings.length >= 3) {
      return listItem;
    }
  }
  
  // 우선순위 4: div 중 링크를 포함하고 형제가 있는 것
  const div = element.closest('div[class]');
  if (div && !div.closest('nav, header, footer')) {
    const hasLink = div.querySelector('a[href]');
    const siblings = div.parentElement?.querySelectorAll(`:scope > div.${div.className.split(' ')[0]}`);
    if (hasLink && siblings && siblings.length >= 2) {
      return div;
    }
  }
  
  return null;
}

async function handleClick(e) {
  if (!isSelectMode) return;
  
  // 오버레이 클릭은 무시
  if (e.target.closest('#catchup-select-overlay')) return;
  
  e.preventDefault();
  e.stopPropagation();
  
  // 게시글 컨테이너 찾기
  const container = findPostContainer(e.target);
  if (!container) {
    showPageToast('⚠️ 게시글 영역을 찾을 수 없습니다. 다른 곳을 클릭해주세요.', 'error');
    return;
  }
  
  // 선택자 생성
  const selector = generateSelector(container);
  
  // 선택자 검증 - 몇 개의 요소가 있는지 확인
  const matchCount = document.querySelectorAll(selector).length;
  
  if (matchCount < 2) {
    showPageToast(`⚠️ 게시글이 ${matchCount}개만 발견됨. 다른 곳을 선택해주세요.`, 'error');
    return;
  }
  
  // 선택 완료 - background로 전송 (URL + 선택자)
  const result = await chrome.runtime.sendMessage({
    action: 'registerSiteWithSelector',
    url: pendingUrl,
    selector: selector
  });
  
  stopSelectMode();
  
  // 저장 완료 토스트 표시
  if (result.success) {
    showPageToast(`✅ 등록 완료! ${matchCount}개의 게시글을 모니터링합니다`);
  } else {
    showPageToast('❌ ' + (result.error || '등록 실패'), 'error');
  }
}

// 페이지 내 토스트 메시지
function showPageToast(message, type = 'success') {
  // 기존 토스트 제거
  document.getElementById('catchup-toast')?.remove();
  
  const toast = document.createElement('div');
  toast.id = 'catchup-toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 30px;
    left: 50%;
    transform: translateX(-50%);
    padding: 14px 24px;
    background: ${type === 'error' ? '#ef4444' : '#22c55e'};
    color: white;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    z-index: 2147483647;
    animation: catchupToastIn 0.3s ease;
  `;
  
  // 애니메이션 스타일 추가
  const style = document.createElement('style');
  style.id = 'catchup-toast-style';
  style.textContent = `
    @keyframes catchupToastIn {
      from { opacity: 0; transform: translateX(-50%) translateY(20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
    @keyframes catchupToastOut {
      from { opacity: 1; transform: translateX(-50%) translateY(0); }
      to { opacity: 0; transform: translateX(-50%) translateY(20px); }
    }
  `;
  document.head.appendChild(style);
  document.body.appendChild(toast);
  
  // 3초 후 제거
  setTimeout(() => {
    toast.style.animation = 'catchupToastOut 0.3s ease forwards';
    setTimeout(() => {
      toast.remove();
      style.remove();
    }, 300);
  }, 3000);
}

function handleKeyDown(e) {
  if (e.key === 'Escape') {
    stopSelectMode();
  }
}

// 선택자 생성
function generateSelector(container) {
  const parent = container.parentElement;
  if (!parent) return container.tagName.toLowerCase();
  
  // 1. 컨테이너의 클래스로 선택자 생성
  if (container.className) {
    const classes = container.className.split(' ').filter(c => c && !c.includes('catchup'));
    if (classes.length > 0) {
      const classSelector = '.' + classes[0];
      // 같은 선택자로 여러 요소가 있는지 확인 (게시글이 여러 개)
      const count = document.querySelectorAll(classSelector).length;
      if (count > 1) {
        return classSelector;
      }
    }
  }
  
  // 2. 부모 클래스 + 태그 조합
  if (parent.className) {
    const parentClasses = parent.className.split(' ').filter(c => c && !c.includes('catchup'));
    if (parentClasses.length > 0) {
      const selector = `.${parentClasses[0]} > ${container.tagName.toLowerCase()}`;
      const count = document.querySelectorAll(selector).length;
      if (count > 1) {
        return selector;
      }
    }
  }
  
  // 3. 부모 ID + 태그 조합
  if (parent.id) {
    const selector = `#${parent.id} > ${container.tagName.toLowerCase()}`;
    const count = document.querySelectorAll(selector).length;
    if (count > 1) {
      return selector;
    }
  }
  
  // 4. 태그만
  return container.tagName.toLowerCase();
}

// 게시글 추출
function extractPostsFromPage(selector) {
  try {
    // 로그인 페이지 감지
    const url = window.location.href.toLowerCase();
    if (url.includes('/login') || url.includes('/sso') || url.includes('/auth') || url.includes('/signin')) {
      return { success: false, isLoggedIn: false, error: '로그인 필요', posts: [] };
    }
    
    // 로그인 관련 문구 체크
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    if (bodyText.includes('로그인이 필요') || bodyText.includes('please login') || bodyText.includes('세션이 만료')) {
      return { success: false, isLoggedIn: false, error: '세션 만료', posts: [] };
    }
    
    // 게시글 요소 찾기
    const elements = document.querySelectorAll(selector);
    
    if (elements.length === 0) {
      return { success: false, isLoggedIn: true, error: '요소를 찾을 수 없습니다', posts: [] };
    }
    
    const posts = [];
    
    elements.forEach((el, index) => {
      const post = extractPostInfo(el, index);
      if (post) posts.push(post);
    });
    
    return { success: true, isLoggedIn: true, posts, count: posts.length };
    
  } catch (error) {
    return { success: false, isLoggedIn: true, error: error.message, posts: [] };
  }
}

// 개별 게시글 정보 추출
function extractPostInfo(element, index) {
  // 제목
  const titleSelectors = ['a', '.title', '.subject', '.tit', 'h2', 'h3', 'h4'];
  let title = '';
  let link = '';
  
  for (const sel of titleSelectors) {
    const el = element.querySelector(sel);
    if (el && el.textContent.trim()) {
      title = el.textContent.trim();
      if (el.tagName === 'A') link = el.href;
      break;
    }
  }
  
  if (!title) title = element.textContent.trim().substring(0, 100) || `게시글 ${index + 1}`;
  if (!link) {
    const linkEl = element.querySelector('a');
    link = linkEl?.href || window.location.href;
  }
  
  // 날짜
  let date = '';
  const dateEl = element.querySelector('.date, .time, time, [class*="date"]');
  if (dateEl) date = dateEl.textContent.trim();
  
  // 작성자
  let author = '';
  const authorEl = element.querySelector('.author, .writer, [class*="author"]');
  if (authorEl) author = authorEl.textContent.trim();
  
  return {
    title: title.substring(0, 150),
    link,
    date,
    author
  };
}
