// Catch Up Later - Background Service Worker

// ===== Storage 상수 =====
const SYNC_QUOTA_BYTES = 102400; // 100KB
const SYNC_WARNING_THRESHOLD = 0.8; // 80%에서 경고
const SYNC_BLOCK_THRESHOLD = 0.95; // 95%에서 차단

// 확장 프로그램 설치 시 초기화
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Catch Up Later 설치됨');
  
  // 기존 local 데이터를 sync로 마이그레이션
  await migrateToSync();
  
  // 저장된 체크 시간으로 알람 설정
  const { checkTime } = await chrome.storage.sync.get('checkTime');
  await setupScheduledAlarm(checkTime || { hour: 9, minute: 0, ampm: 'AM' });
  
  // 뱃지 초기화
  await updateBadge(0);
});

// 서비스 워커 시작 시 알람 확인 및 복구
chrome.runtime.onStartup.addListener(async () => {
  console.log('서비스 워커 시작');
  await ensureAlarmExists();
});

// 알람이 없으면 생성
async function ensureAlarmExists() {
  const alarm = await chrome.alarms.get('checkPosts');
  if (!alarm) {
    console.log('알람이 없음 - 복구 중...');
    const { checkTime } = await chrome.storage.sync.get('checkTime');
    await setupScheduledAlarm(checkTime || { hour: 9, minute: 0, ampm: 'AM' });
  } else {
    console.log(`다음 체크: ${new Date(alarm.scheduledTime).toLocaleString()}`);
  }
}

// local에서 sync로 마이그레이션
async function migrateToSync() {
  const localData = await chrome.storage.local.get(['sites', 'checkInterval', 'showNotification']);
  const syncData = await chrome.storage.sync.get(['sites']);
  
  // sync에 데이터가 없고 local에 있으면 마이그레이션
  if (!syncData.sites && localData.sites && localData.sites.length > 0) {
    // 용량 최적화: lastPosts 제거
    const optimizedSites = localData.sites.map(site => ({
      url: site.url,
      selector: site.selector,
      addedAt: site.addedAt
    }));
    
    await chrome.storage.sync.set({
      sites: optimizedSites,
      checkInterval: localData.checkInterval || 30,
      showNotification: localData.showNotification !== false
    });
    
    console.log('데이터 마이그레이션 완료');
  }
}

// 스케줄된 알람 설정 (매일 특정 시간)
async function setupScheduledAlarm(checkTime) {
  await chrome.alarms.clear('checkPosts');
  
  // 12시간 형식을 24시간 형식으로 변환
  let hour24 = checkTime.hour;
  if (checkTime.ampm === 'PM' && checkTime.hour !== 12) {
    hour24 = checkTime.hour + 12;
  }
  if (checkTime.ampm === 'AM' && checkTime.hour === 12) {
    hour24 = 0;
  }
  
  // 다음 알람 시간 계산
  const now = new Date();
  const nextAlarm = new Date();
  nextAlarm.setHours(hour24, checkTime.minute, 0, 0);
  
  // 이미 지났으면 내일로 설정
  if (nextAlarm <= now) {
    nextAlarm.setDate(nextAlarm.getDate() + 1);
  }
  
  // 알람 생성 (when: 밀리초 타임스탬프, periodInMinutes: 24시간 = 1440분)
  chrome.alarms.create('checkPosts', {
    when: nextAlarm.getTime(),
    periodInMinutes: 1440 // 24시간마다 반복
  });
  
  console.log(`알람 설정: 매일 ${checkTime.hour}:${String(checkTime.minute).padStart(2, '0')} ${checkTime.ampm}`);
  console.log(`다음 체크: ${nextAlarm.toLocaleString()}`);
}

// 알람 이벤트
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'checkPosts') {
    console.log(`[${new Date().toLocaleTimeString()}] 주기적 체크 시작...`);
    const result = await checkAllSites();
    console.log(`[${new Date().toLocaleTimeString()}] 체크 완료: 새 글 ${result.newCount || 0}개`);
  }
});

// 메시지 리스너
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message).then(sendResponse);
  return true;
});

// 메시지 핸들러
async function handleMessage(message) {
  switch (message.action) {
    case 'checkNow':
      return await checkAllSites();
    
    case 'checkSingleSite':
      return await checkSingleSiteByIndex(message.index);
    
    case 'updateScheduledAlarm':
      await setupScheduledAlarm(message.checkTime);
      return { success: true };
    
    case 'clearBadge':
      await updateBadge(0);
      // siteStates의 모든 newCount 초기화
      const { siteStates: states = {} } = await chrome.storage.local.get('siteStates');
      Object.values(states).forEach(state => {
        state.newCount = 0;
        state.newPosts = [];
      });
      await chrome.storage.local.set({ siteStates: states });
      return { success: true };
    
    case 'updateBadgeFromStorage':
      return await updateBadgeFromStorage();
    
    case 'registerSiteWithSelector':
      return await registerSiteWithSelector(message.url, message.selector);
    
    case 'getStorageUsage':
      return await getStorageUsage();
    
    case 'getAlarmStatus':
      const alarm = await chrome.alarms.get('checkPosts');
      if (alarm) {
        return {
          active: true,
          periodInMinutes: alarm.periodInMinutes,
          nextCheck: new Date(alarm.scheduledTime).toLocaleTimeString()
        };
      }
      return { active: false };
    
    default:
      return { success: false, error: '알 수 없는 액션' };
  }
}

// ===== Storage 용량 관리 =====

// 현재 sync 스토리지 사용량 확인
async function getStorageUsage() {
  const bytesInUse = await chrome.storage.sync.getBytesInUse(null);
  const percentage = (bytesInUse / SYNC_QUOTA_BYTES) * 100;
  
  return {
    bytesInUse,
    totalBytes: SYNC_QUOTA_BYTES,
    percentage: Math.round(percentage * 10) / 10,
    remainingBytes: SYNC_QUOTA_BYTES - bytesInUse,
    isWarning: percentage >= SYNC_WARNING_THRESHOLD * 100,
    isBlocked: percentage >= SYNC_BLOCK_THRESHOLD * 100
  };
}

// 새 사이트 추가 가능 여부 확인
async function canAddSite(newSiteData) {
  const usage = await getStorageUsage();
  
  // 새 사이트 예상 크기 (URL + 선택자 + 메타데이터)
  const estimatedSize = JSON.stringify(newSiteData).length * 2; // UTF-16 고려
  const newPercentage = ((usage.bytesInUse + estimatedSize) / SYNC_QUOTA_BYTES) * 100;
  
  if (newPercentage >= SYNC_BLOCK_THRESHOLD * 100) {
    return {
      canAdd: false,
      reason: `저장 공간이 부족합니다. (${usage.percentage}% 사용 중)\n일부 사이트를 삭제해주세요.`,
      usage
    };
  }
  
  if (newPercentage >= SYNC_WARNING_THRESHOLD * 100) {
    return {
      canAdd: true,
      warning: `저장 공간이 ${Math.round(newPercentage)}%입니다. 곧 한계에 도달합니다.`,
      usage
    };
  }
  
  return { canAdd: true, usage };
}

// 사이트 등록 (선택자와 함께) - 용량 체크 포함
async function registerSiteWithSelector(url, selector) {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  
  // 중복 체크
  if (sites.some(site => site.url === url)) {
    return { success: false, error: '이미 등록된 사이트입니다' };
  }
  
  const newSite = {
    url,
    selector,
    addedAt: new Date().toISOString()
  };
  
  // 용량 체크
  const checkResult = await canAddSite(newSite);
  
  if (!checkResult.canAdd) {
    return { 
      success: false, 
      error: checkResult.reason,
      quotaExceeded: true,
      usage: checkResult.usage
    };
  }
  
  sites.push(newSite);
  
  try {
    await chrome.storage.sync.set({ sites });
    
    // 로컬에 체크 상태 초기화
    const { siteStates = {} } = await chrome.storage.local.get('siteStates');
    siteStates[url] = {
      lastCheck: null,
      lastHash: null,
      lastPosts: null,
      newCount: 0,
      newPosts: [],
      status: 'active'
    };
    await chrome.storage.local.set({ siteStates });
    
    const result = { 
      success: true, 
      selector,
      usage: checkResult.usage
    };
    
    if (checkResult.warning) {
      result.warning = checkResult.warning;
    }
    
    return result;
    
  } catch (error) {
    if (error.message.includes('QUOTA_BYTES')) {
      return {
        success: false,
        error: '저장 공간이 부족합니다. 일부 사이트를 삭제해주세요.',
        quotaExceeded: true
      };
    }
    throw error;
  }
}

// 단일 사이트 체크 (인덱스로)
async function checkSingleSiteByIndex(index) {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  if (!sites[index]) {
    return { success: false, error: '사이트를 찾을 수 없습니다' };
  }
  
  const site = sites[index];
  const siteState = siteStates[site.url] || {};
  
  try {
    const result = await checkSite(site, siteState);
    
    if (result.needsSelector) {
      siteState.status = 'needs_selector';
      siteState.lastCheck = new Date().toISOString();
      siteStates[site.url] = siteState;
      await chrome.storage.local.set({ siteStates });
      return { success: true, needsSelector: true, newCount: 0 };
    }
    
    if (result.needsLogin) {
      siteState.status = 'login_required';
      siteState.lastCheck = new Date().toISOString();
      siteStates[site.url] = siteState;
      await chrome.storage.local.set({ siteStates });
      return { success: true, needsLogin: true, newCount: 0 };
    }
    
    siteState.status = 'active';
    
    if (result.hasNewPosts && result.newPosts.length > 0) {
      siteState.newCount = result.newPosts.length;
      siteState.newPosts = result.newPosts.slice(0, 30);
    } else {
      siteState.newCount = 0;
      siteState.newPosts = [];
    }
    
    siteState.lastCheck = new Date().toISOString();
    siteState.lastCount = result.currentCount;
    siteState.lastHash = result.hash;
    siteState.lastPosts = result.posts;
    
    siteStates[site.url] = siteState;
    await chrome.storage.local.set({ siteStates });
    await updateBadgeFromStorage();
    
    return { 
      success: true, 
      needsLogin: false, 
      newCount: siteState.newCount,
      status: siteState.status
    };
    
  } catch (error) {
    console.error(`체크 실패: ${site.url}`, error);
    siteState.status = 'error';
    siteState.errorMessage = error.message || '알 수 없는 오류';
    siteStates[site.url] = siteState;
    await chrome.storage.local.set({ siteStates });
    return { success: false, error: error.message, newCount: 0 };
  }
}

// 스토리지에서 총 새 글 수 계산하여 뱃지 업데이트
async function updateBadgeFromStorage() {
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  let total = 0;
  Object.values(siteStates).forEach(state => {
    if (state.newCount > 0) {
      total += state.newCount;
    }
  });
  
  await updateBadge(total);
  
  return { success: true, total };
}

// 뱃지 업데이트
async function updateBadge(count) {
  if (count > 0) {
    await chrome.action.setBadgeText({ text: count.toString() });
    await chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
  } else {
    await chrome.action.setBadgeText({ text: '' });
  }
}

// 모든 사이트 체크
async function checkAllSites() {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  if (sites.length === 0) {
    return { success: false, error: '등록된 사이트가 없습니다' };
  }
  
  let totalNewCount = 0;
  const allNewPosts = [];
  
  for (const site of sites) {
    const siteState = siteStates[site.url] || {};
    
    try {
      const result = await checkSite(site, siteState);
      
      if (result.needsSelector) {
        siteState.status = 'needs_selector';
        siteState.lastCheck = new Date().toISOString();
        continue;
      }
      
      if (result.needsLogin) {
        siteState.status = 'login_required';
        siteState.lastCheck = new Date().toISOString();
        continue;
      }
      
      siteState.status = 'active';
      
      if (result.hasNewPosts && result.newPosts.length > 0) {
        totalNewCount += result.newPosts.length;
        
        result.newPosts.forEach(post => {
          allNewPosts.push({
            ...post,
            hostname: new URL(site.url).hostname,
            siteUrl: site.url
          });
        });
        
        siteState.newCount = result.newPosts.length;
        siteState.newPosts = result.newPosts.slice(0, 30);
      } else {
        siteState.newCount = 0;
        siteState.newPosts = [];
      }
      
      siteState.lastCheck = new Date().toISOString();
      siteState.lastCount = result.currentCount;
      siteState.lastHash = result.hash;
      siteState.lastPosts = result.posts;
      
    } catch (error) {
      console.error(`체크 실패: ${site.url}`, error);
      
      if (error.message.includes('로그인')) {
        siteState.status = 'login_required';
        siteState.errorMessage = '로그인이 필요합니다';
      } else {
        siteState.status = 'error';
        siteState.errorMessage = error.message || '알 수 없는 오류';
      }
    }
    
    siteStates[site.url] = siteState;
  }
  
  // 로그인 필요한 사이트가 있으면 알림
  const loginRequiredSites = sites.filter(s => siteStates[s.url]?.status === 'login_required');
  if (loginRequiredSites.length > 0) {
    await showLoginRequiredNotification(loginRequiredSites);
  }
  
  // 사이트 상태 저장 (local)
  await chrome.storage.local.set({ siteStates });
  
  // 뱃지 업데이트 (siteStates의 newCount 합계로 통일)
  await updateBadgeFromStorage();
  
  // 새 글이 있으면 알림
  if (totalNewCount > 0) {
    const { showNotification = true } = await chrome.storage.sync.get('showNotification');
    if (showNotification) {
      await showBrowserNotification(totalNewCount, allNewPosts);
    }
  }
  
  return { success: true, newCount: totalNewCount };
}

// Offscreen document 생성/확인
let creatingOffscreen = null;

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
  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }
  
  // 새로 생성
  creatingOffscreen = chrome.offscreen.createDocument({
    url: offscreenUrl,
    reasons: ['DOM_PARSER'],
    justification: 'Parse HTML to extract posts without opening tabs'
  });
  
  await creatingOffscreen;
  creatingOffscreen = null;
}

// 개별 사이트 체크 (fetch 방식 - 탭 열지 않음)
async function checkSite(site, siteState) {
  if (!site.selector) {
    return { needsSelector: true, currentCount: 0, hash: '', hasNewPosts: false, newPosts: [] };
  }
  
  try {
    // fetch로 HTML 가져오기
    const response = await fetch(site.url, {
      credentials: 'include',
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'ko-KR,ko;q=0.9,en;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const html = await response.text();
    
    // Offscreen document에서 HTML 파싱
    await ensureOffscreenDocument();
    
    const { posts, isLoggedIn, error } = await chrome.runtime.sendMessage({
      action: 'parseHtml',
      html: html,
      selector: site.selector,
      baseUrl: site.url
    });
    
    if (!isLoggedIn) {
      return { needsLogin: true, currentCount: 0, hash: '', hasNewPosts: false, newPosts: [] };
    }
    
    if (error) throw new Error(error);
    
    const currentHash = await hashPosts(posts);
    const currentCount = posts.length;
    
    let hasNewPosts = false;
    let newPosts = [];
    
    if (siteState.lastHash && siteState.lastHash !== currentHash) {
      hasNewPosts = true;
      
      if (siteState.lastPosts) {
        const oldLinks = new Set(siteState.lastPosts.map(p => p.link));
        newPosts = posts.filter(p => !oldLinks.has(p.link));
      } else {
        const newCount = Math.max(0, currentCount - (siteState.lastCount || 0));
        newPosts = posts.slice(0, newCount);
      }
    }
    
    return { currentCount, hash: currentHash, hasNewPosts, newPosts, posts: posts.slice(0, 50) };
    
  } catch (fetchError) {
    console.log(`Fetch failed for ${site.url}, falling back to tab method:`, fetchError.message);
    return await checkSiteWithTab(site, siteState);
  }
}

// 기존 탭 방식 (폴백용)
async function checkSiteWithTab(site, siteState) {
  const tab = await chrome.tabs.create({
    url: site.url,
    active: false
  });
  
  await waitForTabLoad(tab.id);
  
  const results = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPosts,
    args: [site.selector]
  });
  
  await chrome.tabs.remove(tab.id);
  
  const { posts, isLoggedIn, error } = results[0].result;
  
  if (!isLoggedIn) {
    return { needsLogin: true, currentCount: 0, hash: '', hasNewPosts: false, newPosts: [] };
  }
  
  if (error) throw new Error(error);
  
  const currentHash = await hashPosts(posts);
  const currentCount = posts.length;
  
  let hasNewPosts = false;
  let newPosts = [];
  
  if (siteState.lastHash && siteState.lastHash !== currentHash) {
    hasNewPosts = true;
    
    if (siteState.lastPosts) {
      const oldLinks = new Set(siteState.lastPosts.map(p => p.link));
      newPosts = posts.filter(p => !oldLinks.has(p.link));
    } else {
      const newCount = Math.max(0, currentCount - (siteState.lastCount || 0));
      newPosts = posts.slice(0, newCount);
    }
  }
  
  return { currentCount, hash: currentHash, hasNewPosts, newPosts, posts: posts.slice(0, 50) };
}

// 게시글 추출
function extractPosts(selector) {
  try {
    const url = window.location.href.toLowerCase();
    const loginUrlPatterns = ['/login', '/logon', '/signin', '/sign-in', '/sso', '/auth', '/account', '/session'];
    const isLoginUrl = loginUrlPatterns.some(pattern => url.includes(pattern));
    
    const bodyText = document.body?.innerText?.toLowerCase() || '';
    const loginPageKeywords = ['로그인', 'login', 'sign in', '비밀번호', 'password', '아이디를 입력', '사용자 이름'];
    const hasLoginForm = document.querySelector('input[type="password"]') !== null;
    const hasLoginKeyword = loginPageKeywords.some(keyword => bodyText.includes(keyword));
    const isLoginPage = isLoginUrl || (hasLoginForm && hasLoginKeyword);
    
    if (isLoginPage) {
      return { posts: [], isLoggedIn: false };
    }
    
    const elements = document.querySelectorAll(selector);
    
    if (elements.length === 0) {
      return { posts: [], isLoggedIn: true, error: '요소를 찾을 수 없습니다' };
    }
    
    const posts = [];
    
    elements.forEach((el, index) => {
      const titleSelectors = ['a', '.title', '.subject', 'h2', 'h3', 'h4'];
      let title = '';
      let link = '';
      
      for (const sel of titleSelectors) {
        const titleEl = el.querySelector(sel);
        if (titleEl && titleEl.textContent.trim()) {
          title = titleEl.textContent.trim();
          if (titleEl.tagName === 'A') link = titleEl.href;
          break;
        }
      }
      
      if (!title) title = el.textContent.trim().substring(0, 100) || `게시글 ${index + 1}`;
      if (!link) {
        const linkEl = el.querySelector('a');
        link = linkEl?.href || window.location.href;
      }
      
      let date = '';
      const dateEl = el.querySelector('.date, .time, time, [class*="date"]');
      if (dateEl) date = dateEl.textContent.trim();
      
      let author = '';
      const authorEl = el.querySelector('.author, .writer, [class*="author"]');
      if (authorEl) author = authorEl.textContent.trim();
      
      posts.push({ title: title.substring(0, 150), link, date, author });
    });
    
    return { posts, isLoggedIn: true };
    
  } catch (error) {
    return { posts: [], isLoggedIn: true, error: error.message };
  }
}

// 탭 로드 대기
function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (id, info) => {
      if (id === tabId && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        setTimeout(resolve, 1000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

// 해시 생성
async function hashPosts(posts) {
  const text = posts.map(p => p.title).join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// 브라우저 알림
async function showBrowserNotification(count, posts) {
  const title = `🔔 새 글 ${count}개!`;
  const message = posts.slice(0, 3).map(p => `• ${p.title.substring(0, 40)}`).join('\n');
  
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: title,
    message: message,
    priority: 2
  });
}

// 로그인 필요 알림
async function showLoginRequiredNotification(sites) {
  const siteNames = sites.map(s => new URL(s.url).hostname).join(', ');
  
  chrome.notifications.create('login-required', {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: '⚠️ 로그인이 필요합니다',
    message: `${siteNames}에 다시 로그인해주세요.`,
    priority: 2,
    requireInteraction: true
  });
  
  await chrome.action.setBadgeText({ text: '!' });
  await chrome.action.setBadgeBackgroundColor({ color: '#f59e0b' });
}
