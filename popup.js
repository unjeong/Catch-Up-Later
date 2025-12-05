// 등록 제한 상수
const LIMITS = {
  sites: 10,
  rssFeeds: 20,
  // 경고 표시 시점 (80%)
  sitesWarning: 8,
  rssFeedsWarning: 16
};

// DOM 요소들
const elements = {
  // 뷰
  mainView: document.getElementById('mainView'),
  settingsView: document.getElementById('settingsView'),
  
  // 메인 헤더
  openSettings: document.getElementById('openSettings'),
  backToMain: document.getElementById('backToMain'),
  
  // 통합 알림 카드
  totalAlertCard: document.getElementById('totalAlertCard'),
  alertClickArea: document.getElementById('alertClickArea'),
  totalCount: document.getElementById('totalCount'),
  lastCheckTime: document.getElementById('lastCheckTime'),
  refreshAll: document.getElementById('refreshAll'),
  
  // 사이트 그리드 (메인)
  siteGrid: document.getElementById('siteGrid'),
  
  // 사이트 등록 (메인)
  currentUrl: document.getElementById('currentUrl'),
  addCurrentPage: document.getElementById('addCurrentPage'),
  
  // 설정 - 사이트 관리
  siteListManage: document.getElementById('siteListManage'),
  
  // 설정 - 옵션
  checkHour: document.getElementById('checkHour'),
  checkMinute: document.getElementById('checkMinute'),
  checkAmPm: document.getElementById('checkAmPm'),
  nextCheckInfo: document.getElementById('nextCheckInfo'),
  showNotification: document.getElementById('showNotification'),
  
  // 설정 - 데이터
  resetData: document.getElementById('resetData'),
  
  // 저장 공간 표시
  storageUsage: document.getElementById('storageUsage'),
  
  // 사이트 개수 뱃지 및 제한 카운터
  siteCountBadge: document.getElementById('siteCountBadge'),
  siteLimitCounter: document.getElementById('siteLimitCounter'),
  
  // 메인 뷰 플랫폼 섹션
  connectedPlatformsMain: document.getElementById('connectedPlatformsMain'),
  connectedPlatformsGrid: document.getElementById('connectedPlatformsGrid'),
  
  // RSS 관련 요소
  rssFeedsSection: document.getElementById('rssFeedsSection'),
  rssFeedGrid: document.getElementById('rssFeedGrid'),
  rssFeedListManage: document.getElementById('rssFeedListManage'),
  rssFeedCountSettings: document.getElementById('rssFeedCountSettings'),
  rssLimitCounter: document.getElementById('rssLimitCounter'),
  
  
  // 토글 관련 요소
  enablePlatforms: document.getElementById('enablePlatforms'),
  platformsDetailContent: document.getElementById('platformsDetailContent'),
  enableRSSFeeds: document.getElementById('enableRSSFeeds'),
  rssFeedsDetailContent: document.getElementById('rssFeedsDetailContent'),
  
  // RSS 인라인 폼 (Settings)
  rssFeedUrlInline: document.getElementById('rssFeedUrlInline'),
  rssFeedNameInline: document.getElementById('rssFeedNameInline'),
  autoDetectRssInline: document.getElementById('autoDetectRssInline'),
  addRssFeedInline: document.getElementById('addRssFeedInline'),
  rssInlineMessage: document.getElementById('rssInlineMessage'),
  popularFeedsListInline: document.getElementById('popularFeedsListInline')
};

// RSS 피드 상태 캐시
let rssFeeds = [];

// 플랫폼 연결 상태 캐시
let platformsStatus = {
  gmail: { connected: false, count: 0 },
  youtube: { connected: false, count: 0 },
  github: { connected: false, count: 0 },
  reddit: { connected: false, count: 0 },
  discord: { connected: false, count: 0 }
};

let currentTabId = null;

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadPlatformsStatus();
  await loadSettings();
    await loadToggleStates(); // 토글 상태 로드
  await loadSites();
    await loadRSSFeeds();
  await getCurrentTab();
    await updateTotalCount();
    await updateLastCheckTime();
    await updateStorageUsage();
  setupEventListeners();
    setupStorageListener();
    setupPlatformEventListeners();
    setupPlatformChipEvents();
    setupToggleEventListeners(); // 토글 이벤트 리스너
    setupInlineRSSEventListeners(); // 인라인 RSS 폼 이벤트
  } catch (error) {
    console.error('초기화 오류:', error);
  }
});

// 스토리지 변경 감지 - 백그라운드에서 업데이트되면 자동 반영
function setupStorageListener() {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    // local 스토리지의 siteStates가 변경되면 UI 업데이트
    if (areaName === 'local' && changes.siteStates) {
      console.log('사이트 상태 변경 감지 - UI 업데이트');
      loadSites();
      updateTotalCount();
      updateLastCheckTime();
    }
    
    // sync 스토리지의 sites가 변경되면 UI 업데이트
    if (areaName === 'sync' && changes.sites) {
      console.log('사이트 목록 변경 감지 - UI 업데이트');
      loadSites();
      updateStorageUsage();
    }
  });
}

// 이벤트 리스너 설정
function setupEventListeners() {
  // 화면 전환
  elements.openSettings.addEventListener('click', () => showView('settings'));
  elements.backToMain.addEventListener('click', () => showView('main'));
  
  // 새로고침
  elements.refreshAll.addEventListener('click', refreshAll);
  
  // 총 새글 수 클릭 - 모든 새글 보기
  elements.alertClickArea.addEventListener('click', showAllNewPostsDropdown);
  
  // 사이트 등록
  elements.addCurrentPage.addEventListener('click', addCurrentSite);
  
  // 설정 변경 시 자동 저장
  elements.checkHour.addEventListener('change', saveSettings);
  elements.checkMinute.addEventListener('change', saveSettings);
  elements.checkAmPm.addEventListener('change', saveSettings);
  elements.showNotification.addEventListener('change', saveSettings);
  
  // 데이터 초기화
  elements.resetData.addEventListener('click', resetData);
}

// 화면 전환
function showView(view) {
  elements.mainView.classList.toggle('active', view === 'main');
  elements.settingsView.classList.toggle('active', view === 'settings');
  
  if (view === 'settings') {
    updateStorageUsage();
  }
}

// 현재 탭 URL 가져오기
async function getCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      elements.currentUrl.value = tab.url;
      currentTabId = tab.id;
    }
  } catch (error) {
    console.error('탭 정보 가져오기 실패:', error);
  }
}

// ===== 저장 공간 관리 =====

async function updateStorageUsage() {
  const storageBar = document.getElementById('storageBar');
  const storageUsed = document.getElementById('storageUsed');
  const storageTotal = document.getElementById('storageTotal');
  
  if (!storageBar || !storageUsed || !storageTotal) return;
  
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getStorageUsage' });
    
    if (result) {
      const usedKB = (result.bytesInUse / 1024).toFixed(1);
      const totalKB = (result.totalBytes / 1024).toFixed(0);
      const percentage = Math.min(result.percentage, 100);
      
      // 프로그레스 바 업데이트
      storageBar.style.width = `${percentage}%`;
      storageBar.classList.remove('warning', 'danger');
      
      if (result.isBlocked) {
        storageBar.classList.add('danger');
      } else if (result.isWarning) {
        storageBar.classList.add('warning');
      }
      
      // 텍스트 업데이트
      storageUsed.textContent = `${usedKB}KB`;
      storageTotal.textContent = `${totalKB}KB`;
    }
  } catch (error) {
    console.error('저장 공간 확인 실패:', error);
    storageUsed.textContent = '-';
    storageTotal.textContent = '-';
  }
}

// ===== 알림 카운트 =====

// 총 새 글 수 업데이트 (사이트 + 플랫폼 + RSS)
async function updateTotalCount() {
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  const { platformsStatus: pStatus = {} } = await chrome.storage.local.get('platformsStatus');
  const { rss_feed_states: rssStates = {} } = await chrome.storage.local.get('rss_feed_states');
  
  // 토글 상태 확인
  const { enablePlatforms = true, enableRSSFeeds = true } = await chrome.storage.sync.get(['enablePlatforms', 'enableRSSFeeds']);
  
  let total = 0;
  
  // 사이트 새 글 수 (항상 포함)
  Object.values(siteStates).forEach(state => {
    if (state.newCount) {
      total += state.newCount;
    }
  });
  
  // 플랫폼 새 알림 수 (토글이 활성화된 경우에만)
  if (enablePlatforms) {
    Object.values(pStatus).forEach(platform => {
      if (platform.count) {
        total += platform.count;
      }
    });
  }
  
  // RSS 새 글 수 (토글이 활성화된 경우에만)
  if (enableRSSFeeds) {
    Object.values(rssStates).forEach(state => {
      if (state.newCount) {
        total += state.newCount;
      }
    });
  }
  
  elements.totalCount.textContent = total;
  elements.totalAlertCard.classList.toggle('has-alerts', total > 0);
  
  // UPDATE / UPDATES 라벨 업데이트
  const alertLabel = document.querySelector('.alert-label');
  if (alertLabel) {
    alertLabel.textContent = total <= 1 ? 'UPDATE' : 'UPDATES';
  }
  
  // 클릭 가능 여부 설정
  if (total > 0) {
    elements.alertClickArea.title = `🔔 ${total} new updates - Click to view all`;
    elements.alertClickArea.classList.add('clickable');
  } else {
    elements.alertClickArea.title = '';
    elements.alertClickArea.classList.remove('clickable');
  }
  
  // 브라우저 확장프로그램 뱃지도 업데이트
  chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
}

// 마지막 체크 시간 업데이트
async function updateLastCheckTime() {
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  // 가장 최근 체크 시간 찾기
  let latestCheck = null;
  Object.values(siteStates).forEach(state => {
    if (state.lastCheck) {
      const checkTime = new Date(state.lastCheck);
      if (!latestCheck || checkTime > latestCheck) {
        latestCheck = checkTime;
      }
    }
  });
  
  if (latestCheck && elements.lastCheckTime) {
    const year = latestCheck.getFullYear().toString().slice(-2);
    const month = String(latestCheck.getMonth() + 1).padStart(2, '0');
    const day = String(latestCheck.getDate()).padStart(2, '0');
    const hours = String(latestCheck.getHours()).padStart(2, '0');
    const minutes = String(latestCheck.getMinutes()).padStart(2, '0');
    
    elements.lastCheckTime.textContent = `${year}/${month}/${day} ${hours}:${minutes}`;
  } else if (elements.lastCheckTime) {
    elements.lastCheckTime.textContent = '-';
  }
}

// 전체 새로고침
let isRefreshing = false;

async function refreshAll() {
  // 이미 새로고침 중이면 무시
  if (isRefreshing) {
    showToast('Checking... Please wait', '');
    return;
  }
  
  const { sites = [], enablePlatforms = true, enableRSSFeeds = true } = await chrome.storage.sync.get(['sites', 'enablePlatforms', 'enableRSSFeeds']);
  
  isRefreshing = true;
  elements.refreshAll.disabled = true;
  elements.refreshAll.classList.add('spinning');
  elements.refreshAll.style.opacity = '0.7';
  
  // 새로고침 중 모든 수정 비활성화
  setAllItemsDisabled(true);
  
  let totalNewCount = 0;
  let platformNewCount = 0;
  
  try {
    // 1. 웹사이트 체크
    for (let i = 0; i < sites.length; i++) {
      // 체크 중 하이라이트
      setSiteChecking(i, true);
      
      try {
        const result = await chrome.runtime.sendMessage({ 
          action: 'checkSingleSite', 
          index: i 
        });
        
        if (result.newCount > 0) {
          totalNewCount += result.newCount;
        }
        
        // 체크 완료 - 체크마크 표시
        setSiteChecking(i, false);
        showSiteCheckDone(i, result);
        
      } catch (err) {
        console.error(`사이트 ${i} 체크 실패:`, err);
        setSiteChecking(i, false);
      }
    }
    
    // 2. 플랫폼 체크 (토글이 활성화되고 연결된 플랫폼만)
    if (enablePlatforms) {
      const connectedPlatforms = Object.keys(platformsStatus).filter(p => platformsStatus[p]?.connected);
      
      // 모든 연결된 플랫폼 체크 중 표시
      connectedPlatforms.forEach(platform => setPlatformChecking(platform, true));
      
      const platformResults = await chrome.runtime.sendMessage({ action: 'checkAllPlatforms' });
      
      if (platformResults) {
        platformNewCount = platformResults.totalCount || 0;
        totalNewCount += platformNewCount;
        
        // 플랫폼 상태 업데이트 및 체크 완료 표시
        const platformList = ['gmail', 'youtube', 'github', 'reddit', 'discord'];
        for (const platform of platformList) {
          if (platformResults[platform] && platformsStatus[platform]?.connected) {
            platformsStatus[platform].count = platformResults[platform].count;
            platformsStatus[platform].items = platformResults[platform].items;
            
            // 체크 완료 표시
            setPlatformChecking(platform, false);
            showPlatformCheckDone(platform, platformResults[platform].count > 0);
          }
        }
        
        await savePlatformsStatus();
        await updatePlatformUI();
    } else {
        // 에러 시 체크 중 상태 제거
        connectedPlatforms.forEach(platform => setPlatformChecking(platform, false));
      }
    }
    
    // 3. RSS 피드 체크 (토글이 활성화된 경우만)
    console.log('[RSS] enableRSSFeeds:', enableRSSFeeds, 'rssFeeds.length:', rssFeeds.length);
    if (enableRSSFeeds && rssFeeds.length > 0) {
      console.log('[RSS] Starting RSS check for', rssFeeds.length, 'feeds');
      // 모든 RSS 피드 체크 중 표시
      rssFeeds.forEach(feed => setRSSFeedChecking(feed.id, true));
      
      try {
        const rssResults = await chrome.runtime.sendMessage({ action: 'checkAllRSSFeeds' });
        console.log('[RSS] Results received:', rssResults);
        
        // results는 { feedId: { count, items, ... } } 형태의 객체
        if (rssResults?.results) {
          let rssNewCount = 0;
          
          // 각 피드 ID별로 처리
          Object.entries(rssResults.results).forEach(([feedId, feedResult]) => {
            console.log('[RSS] Feed', feedId, '- new items:', feedResult.count || 0);
            rssNewCount += feedResult.count || 0;
            setRSSFeedChecking(feedId, false);
            showRSSCheckDone(feedId, feedResult.count > 0);
          });
          
          totalNewCount += rssNewCount;
          console.log('[RSS] Total new RSS items:', rssNewCount);
        } else {
          console.log('[RSS] No results in response');
          // 체크 중 상태 제거
          rssFeeds.forEach(feed => setRSSFeedChecking(feed.id, false));
        }
      } catch (err) {
        console.error('[RSS] Check failed:', err);
        rssFeeds.forEach(feed => setRSSFeedChecking(feed.id, false));
      }
    } else {
      console.log('[RSS] Skipped - toggle off or no feeds');
    }
    
    // 4. 체크마크가 보이도록 대기 (체크마크 2초 + 여유 0.5초)
    const hasConnectedPlatforms = enablePlatforms && Object.keys(platformsStatus).some(p => platformsStatus[p]?.connected);
    const hasRSSFeeds = enableRSSFeeds && rssFeeds.length > 0;
    const hasItems = sites.length > 0 || hasConnectedPlatforms || hasRSSFeeds;
    if (hasItems) {
      await new Promise(resolve => setTimeout(resolve, 2500));
    }
    
    // 5. 최종 결과 업데이트
    await loadSites();
    await loadRSSFeeds(); // 체크마크 표시 후에 RSS 다시 로드
    await updateTotalCount();
    await updateLastCheckTime();
    
    // 6. 결과 토스트 - 간단하게 통일
    if (totalNewCount > 0) {
      showToast(`🔔 ${totalNewCount} new updates!`, 'success');
    } else {
      showToast('✓ All caught up!', 'success');
    }
    
  } catch (error) {
    console.error('새로고침 오류:', error);
    showToast('Error occurred', 'error');
  }
  
  // 버튼 상태 복원
  isRefreshing = false;
  elements.refreshAll.disabled = false;
  elements.refreshAll.classList.remove('spinning');
  elements.refreshAll.style.opacity = '1';
  
  // 수정 가능 상태로 복원
  setAllItemsDisabled(false);
}

// 새로고침 중 모든 항목 수정 비활성화/활성화
function setAllItemsDisabled(disabled) {
  // 사이트 칩 삭제 버튼
  document.querySelectorAll('.site-chip-delete').forEach(btn => {
    btn.disabled = disabled;
    btn.style.pointerEvents = disabled ? 'none' : 'auto';
    btn.style.opacity = disabled ? '0' : ''; // 새로고침 중 삭제 버튼 숨김
  });
  
  // 사이트 추가 버튼
  if (elements.addCurrentPage) {
    elements.addCurrentPage.disabled = disabled;
    elements.addCurrentPage.style.opacity = disabled ? '0.5' : '1';
    elements.addCurrentPage.style.cursor = disabled ? 'not-allowed' : 'pointer';
  }
  
  // 플랫폼 칩 삭제 버튼
  document.querySelectorAll('.platform-chip-delete').forEach(btn => {
    btn.disabled = disabled;
    btn.style.pointerEvents = disabled ? 'none' : 'auto';
    btn.style.opacity = disabled ? '0' : '';
  });
  
  // RSS 칩 삭제 버튼
  document.querySelectorAll('.rss-chip-delete').forEach(btn => {
    btn.disabled = disabled;
    btn.style.pointerEvents = disabled ? 'none' : 'auto';
    btn.style.opacity = disabled ? '0' : '';
  });
}

// 사이트 체크 중 하이라이트
function setSiteChecking(index, isChecking) {
  const chip = elements.siteGrid.querySelector(`.site-chip[data-index="${index}"]`);
  if (!chip) return;
  
  if (isChecking) {
    chip.classList.add('checking');
  } else {
    chip.classList.remove('checking');
  }
}

// 플랫폼 체크 중 하이라이트
function setPlatformChecking(platform, isChecking) {
  const chip = elements.connectedPlatformsGrid?.querySelector(`.platform-chip[data-platform="${platform}"]`);
  if (!chip) return;
  
  if (isChecking) {
    chip.classList.add('checking');
    chip.classList.remove('check-done');
  } else {
    chip.classList.remove('checking');
  }
}

// 플랫폼 체크 완료 표시 (사이트와 동일한 체크마크)
function showPlatformCheckDone(platform, result) {
  const chip = elements.connectedPlatformsGrid?.querySelector(`.platform-chip[data-platform="${platform}"]`);
  if (!chip) return;
  
  chip.classList.remove('checking');
  
  // 기존 체크 뱃지 찾기 또는 생성
  let checkBadge = chip.querySelector('.check-badge');
  if (!checkBadge) {
    checkBadge = document.createElement('span');
    checkBadge.className = 'check-badge';
    chip.appendChild(checkBadge);
  }
  
  // 새 알림이 있으면 숫자는 기존 뱃지에서 처리됨
  // 체크 완료 표시
  checkBadge.textContent = '✓';
  checkBadge.className = 'check-badge show done';
  
  // 2초 후 체크마크 숨김
  setTimeout(() => {
    if (checkBadge.textContent === '✓') {
      checkBadge.classList.remove('show', 'done');
      checkBadge.textContent = '';
    }
  }, 2000);
}

// RSS 피드 체크 중 하이라이트
function setRSSFeedChecking(feedId, isChecking) {
  const chip = elements.rssFeedGrid?.querySelector(`.rss-chip[data-feed-id="${feedId}"]`);
  if (!chip) return;
  
  if (isChecking) {
    chip.classList.add('checking');
    chip.classList.remove('check-done');
  } else {
    chip.classList.remove('checking');
  }
}

// RSS 피드 체크 완료 표시 (사이트와 동일한 체크마크)
function showRSSCheckDone(feedId, hasNew) {
  const chip = elements.rssFeedGrid?.querySelector(`.rss-chip[data-feed-id="${feedId}"]`);
  if (!chip) return;
  
  chip.classList.remove('checking');
  
  // 기존 체크 뱃지 찾기 또는 생성
  let checkBadge = chip.querySelector('.check-badge');
  if (!checkBadge) {
    checkBadge = document.createElement('span');
    checkBadge.className = 'check-badge';
    chip.appendChild(checkBadge);
  }
  
  // 체크 완료 표시
  checkBadge.textContent = '✓';
  checkBadge.className = 'check-badge show done';
  
  // 2초 후 체크마크 숨김
  setTimeout(() => {
    if (checkBadge && checkBadge.textContent === '✓') {
      checkBadge.classList.remove('show', 'done');
      checkBadge.textContent = '';
    }
  }, 2000);
}

// 사이트 체크 완료 표시 (초록색 체크마크 2초)
function showSiteCheckDone(index, result) {
  const chip = elements.siteGrid.querySelector(`.site-chip[data-index="${index}"]`);
  if (!chip) return;
  
  // 기존 뱃지 찾기 또는 생성
  let badge = chip.querySelector('.site-badge');
  if (!badge) {
    badge = document.createElement('span');
    badge.className = 'site-badge';
    chip.appendChild(badge);
  }
  
  // 선택자 필요 상태
  if (result.needsSelector) {
    badge.textContent = '📌';
    badge.className = 'site-badge show error';
    badge.title = 'Selector needed. Set it in Settings.';
    return;
  }
  
  // 로그인 필요 상태
  if (result.needsLogin) {
    badge.textContent = '🔐';
    badge.className = 'site-badge show login';
    badge.title = 'Login required. Please login first.';
    return;
  }
  
  // 에러 상태
  if (!result.success) {
    badge.textContent = '!';
    badge.className = 'site-badge show error';
    badge.title = result.error || 'Posts not found. Page structure may have changed.';
    return;
  }
  
  // 새 글이 있으면 숫자 표시
  if (result.newCount > 0) {
    badge.textContent = result.newCount;
    badge.className = 'site-badge show clickable';
    badge.title = `🔔 ${result.newCount} new posts - Click to view`;
    badge.style.cursor = 'pointer';
    return;
  }
  
  // 새 글 없으면 체크마크 2초 표시 후 숨김
  badge.textContent = '✓';
  badge.className = 'site-badge show done';
  badge.title = 'No new posts';
  
  setTimeout(() => {
    if (badge.textContent === '✓') {
      badge.classList.remove('show', 'done');
      badge.textContent = '';
    }
  }, 2000);
}

// ===== 사이트 관리 =====

// 사이트 목록 불러오기 (sync에서 사이트, local에서 상태)
async function loadSites() {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  // 사이트와 상태 병합
  const sitesWithState = sites.map(site => ({
    ...site,
    ...(siteStates[site.url] || {})
  }));
  
  // 사이트 개수 뱃지 업데이트
  if (elements.siteCountBadge) {
    elements.siteCountBadge.textContent = sites.length;
    elements.siteCountBadge.style.display = sites.length > 0 ? 'inline-flex' : 'none';
  }
  
  // 사이트 제한 카운터 업데이트
  updateSiteLimitCounter(sites.length);
  
  renderSiteGrid(sitesWithState);
  renderSiteListManage(sitesWithState);
}

// 드래그 앤 드롭 상태
let draggedItem = null;
let draggedIndex = null;

// 사이트 그리드 렌더링 (메인)
function renderSiteGrid(sites) {
  if (sites.length === 0) {
    elements.siteGrid.innerHTML = '<div class="site-empty">No sites added yet</div>';
    return;
  }
  
  elements.siteGrid.innerHTML = sites.map((site, index) => {
    const hostname = new URL(site.url).hostname.replace('www.', '');
    const shortName = hostname.split('.')[0];
    
    let badgeHtml = '';
    let chipClass = 'site-chip';
    let badgeTitle = '';
    
    if (site.status === 'login_required') {
      badgeTitle = 'Login required. Please login first.';
      badgeHtml = `<span class="site-badge login show" title="${badgeTitle}">🔐</span>`;
      chipClass += ' needs-login';
    } else if (site.status === 'error' || site.status === 'no_posts') {
      badgeTitle = site.errorMessage || 'Posts not found. Page structure may have changed.';
      badgeHtml = `<span class="site-badge error show" title="${badgeTitle}">!</span>`;
      chipClass += ' has-error';
    } else if (site.newCount > 0) {
      badgeTitle = `🔔 ${site.newCount} new posts - Click to view`;
      badgeHtml = `<span class="site-badge show clickable" data-index="${index}" title="${badgeTitle}" style="cursor:pointer">${site.newCount}</span>`;
    }
    
    return `
      <div class="${chipClass}" draggable="true" data-url="${site.url}" data-index="${index}" title="${hostname}${site.status === 'login_required' ? ' - Login required' : ''}">
        <img class="site-favicon" src="https://www.google.com/s2/favicons?domain=${hostname}&sz=32" alt="">
        <span class="site-name">${shortName}</span>
        ${badgeHtml}
        <button class="site-chip-delete" data-index="${index}" title="Delete">×</button>
      </div>
    `;
  }).join('');
  
  // 드래그 앤 드롭 이벤트
  elements.siteGrid.querySelectorAll('.site-chip').forEach(chip => {
    chip.addEventListener('dragstart', handleDragStart);
    chip.addEventListener('dragend', handleDragEnd);
    chip.addEventListener('dragover', handleDragOver);
    chip.addEventListener('dragenter', handleDragEnter);
    chip.addEventListener('dragleave', handleDragLeave);
    chip.addEventListener('drop', handleDrop);
  });
  
  // 뱃지 클릭 이벤트 (새 글 목록 드롭다운)
  elements.siteGrid.querySelectorAll('.site-badge.clickable').forEach(badge => {
    badge.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(badge.dataset.index);
      await showNewPostsDropdown(index, badge);
    });
  });
  
  // 사이트 클릭 이벤트 (새 탭 열기 + 읽음 처리)
  elements.siteGrid.querySelectorAll('.site-chip').forEach(chip => {
    chip.addEventListener('click', async (e) => {
      // 삭제 버튼 또는 뱃지 클릭 시 무시
      if (e.target.classList.contains('site-chip-delete')) return;
      if (e.target.classList.contains('site-badge')) return;
      
      const index = parseInt(chip.dataset.index);
      const url = chip.dataset.url;
      
      // 새 탭 열기
      chrome.tabs.create({ url });
      
      // 읽음 처리 (새 글 카운트 리셋)
      await markSiteAsRead(index);
    });
  });
  
  // 삭제 버튼 클릭 이벤트
  elements.siteGrid.querySelectorAll('.site-chip-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const index = parseInt(btn.dataset.index);
      await removeSite(index);
    });
  });
}

// ===== 드래그 앤 드롭 핸들러 =====

function handleDragStart(e) {
  draggedItem = this;
  draggedIndex = parseInt(this.dataset.index);
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  document.querySelectorAll('.site-chip').forEach(chip => {
    chip.classList.remove('drag-over');
  });
  draggedItem = null;
  draggedIndex = null;
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

function handleDragEnter(e) {
  e.preventDefault();
  if (this !== draggedItem) {
    this.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  this.classList.remove('drag-over');
}

async function handleDrop(e) {
  e.preventDefault();
  this.classList.remove('drag-over');
  
  if (this === draggedItem) return;
  
  const targetIndex = parseInt(this.dataset.index);
  
  if (draggedIndex === null || draggedIndex === targetIndex) return;
  
  // 사이트 순서 변경
  await reorderSites(draggedIndex, targetIndex);
}

// 사이트 리스트 렌더링 (설정)
function renderSiteListManage(sites) {
  if (sites.length === 0) {
    elements.siteListManage.innerHTML = '<li class="empty-state">No sites added yet</li>';
    return;
  }
  
  elements.siteListManage.innerHTML = sites.map((site, index) => `
    <li class="site-manage-item">
      <div class="site-manage-header">
        <img class="site-favicon" src="https://www.google.com/s2/favicons?domain=${new URL(site.url).hostname}&sz=32" alt="">
        <span class="site-hostname">${new URL(site.url).hostname}</span>
      </div>
      <div class="site-selector-row">
        <input type="text" class="site-selector-input" 
               data-index="${index}" 
               value="${site.selector || ''}" 
               placeholder="Selector (e.g. .board-list li)">
        <button class="btn-icon-sm btn-save-selector" data-index="${index}" title="Save">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
        </button>
        <button class="btn-icon-sm btn-delete-site" data-index="${index}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        </button>
      </div>
      <div class="site-selector-hint">${site.selector ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> Custom selector' : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg> Auto detect'}</div>
    </li>
  `).join('');
  
  // 삭제 버튼
  elements.siteListManage.querySelectorAll('.btn-delete-site').forEach(btn => {
    btn.addEventListener('click', () => removeSite(parseInt(btn.dataset.index)));
  });
  
  // 선택자 저장 버튼
  elements.siteListManage.querySelectorAll('.btn-save-selector').forEach(btn => {
    btn.addEventListener('click', async () => {
      const index = parseInt(btn.dataset.index);
      const input = elements.siteListManage.querySelector(`.site-selector-input[data-index="${index}"]`);
      const selector = input.value.trim();
      await updateSiteSelector(index, selector);
    });
  });
  
  // Enter 키로 저장
  elements.siteListManage.querySelectorAll('.site-selector-input').forEach(input => {
    input.addEventListener('keypress', async (e) => {
      if (e.key === 'Enter') {
        const index = parseInt(input.dataset.index);
        const selector = input.value.trim();
        await updateSiteSelector(index, selector);
      }
    });
  });
}

// 사이트 선택자 업데이트
async function updateSiteSelector(index, selector) {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  
  if (sites[index]) {
    sites[index].selector = selector;
    
    await chrome.storage.sync.set({ sites });
    
    // 로컬 상태도 초기화
    const { siteStates = {} } = await chrome.storage.local.get('siteStates');
    if (siteStates[sites[index].url]) {
      siteStates[sites[index].url].lastHash = null;
      siteStates[sites[index].url].lastPosts = null;
      await chrome.storage.local.set({ siteStates });
    }
    
    await loadSites();
    await updateStorageUsage();
    
    if (selector) {
      showToast(`✓ Selector saved`, 'success');
    } else {
      showToast('🔮 Auto detect mode', 'success');
    }
  }
}

// 사이트 추가 (자동 감지)
async function addCurrentSite() {
  const url = elements.currentUrl.value.trim();
  
  if (!url) {
    showToast('Please enter URL', 'error');
    return;
  }
  
  try {
    new URL(url);
  } catch {
    showToast('Invalid URL', 'error');
    return;
  }
  
  const { sites = [] } = await chrome.storage.sync.get('sites');
  
  // 제한 체크
  if (sites.length >= LIMITS.sites) {
    showToast(`Site limit reached (${LIMITS.sites} max)`, 'error');
    return;
  }
  
  if (sites.some(site => site.url === url)) {
    showToast('Site already added', 'error');
    return;
  }
  
  // 현재 탭에서 게시글 자동 감지
  if (currentTabId) {
    try {
      showToast('🔍 Detecting posts...', '');
      
      const result = await chrome.tabs.sendMessage(currentTabId, {
        action: 'autoDetectPosts',
        url: url
      });
      
      if (result.success && result.selector) {
        // 자동 감지 성공 - 바로 등록
        const regResult = await chrome.runtime.sendMessage({
          action: 'registerSiteWithSelector',
          url: url,
          selector: result.selector
        });
        
        if (regResult.success) {
          await loadSites();
          await updateStorageUsage();
          
          let message = `✅ Added! ${result.count} posts detected`;
          if (regResult.warning) {
            message += ` (${regResult.warning})`;
          }
          showToast(message, 'success');
          
        } else if (regResult.quotaExceeded) {
          showToast(`❌ ${regResult.error}`, 'error');
        } else {
          showToast(`❌ ${regResult.error || 'Failed to add'}`, 'error');
        }
      } else {
        showToast('❌ No posts found. Try another page.', 'error');
      }
    } catch (err) {
      console.log('자동 감지 실패:', err);
      showToast('Please refresh the page and try again', 'error');
    }
  } else {
    showToast('Please open a page', 'error');
  }
}

// 사이트 삭제
async function removeSite(index) {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const removed = sites.splice(index, 1)[0];
  
  await chrome.storage.sync.set({ sites });
  
  // 로컬 상태도 삭제
  if (removed) {
    const { siteStates = {} } = await chrome.storage.local.get('siteStates');
    delete siteStates[removed.url];
    await chrome.storage.local.set({ siteStates });
  }
  
  await loadSites();
  await updateTotalCount();
  await updateStorageUsage();
  
  showToast('Deleted', 'success');
}

// 사이트 순서 변경
async function reorderSites(fromIndex, toIndex) {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  
  // 배열에서 아이템 이동
  const [movedItem] = sites.splice(fromIndex, 1);
  sites.splice(toIndex, 0, movedItem);
  
  await chrome.storage.sync.set({ sites });
  await loadSites();
}

// 사이트 읽음 처리 (전체)
async function markSiteAsRead(index) {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  if (sites[index]) {
    const url = sites[index].url;
    const state = siteStates[url];
    
    if (state && state.newCount > 0) {
      state.newCount = 0;
      state.newPosts = [];
      siteStates[url] = state;
      
      await chrome.storage.local.set({ siteStates });
      await loadSites();
      await updateTotalCount();
      
      chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
    }
  }
}

// 사이트에서 특정 포스트만 제거
async function removePostFromSite(siteUrl, postLink) {
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  const state = siteStates[siteUrl];
  
  if (state && state.newPosts && state.newPosts.length > 0) {
    const postIndex = state.newPosts.findIndex(p => p.link === postLink);
    if (postIndex !== -1) {
      state.newPosts.splice(postIndex, 1);
      state.newCount = state.newPosts.length;
      siteStates[siteUrl] = state;
      
      await chrome.storage.local.set({ siteStates });
      chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
    }
  }
}

// 플랫폼에서 특정 아이템만 제거
async function removeItemFromPlatform(platform, itemLink) {
  const { platformsStatus: pStatus = {} } = await chrome.storage.local.get('platformsStatus');
  
  if (pStatus[platform] && pStatus[platform].items && pStatus[platform].items.length > 0) {
    const items = pStatus[platform].items;
    let itemIndex = -1;
    
    // 플랫폼별 링크 매칭
    if (platform === 'gmail') {
      itemIndex = items.findIndex(i => 'https://mail.google.com' === itemLink);
      // Gmail은 링크가 모두 같으므로 첫 번째 항목 제거
      if (itemIndex === -1) itemIndex = 0;
    } else if (platform === 'youtube') {
      itemIndex = items.findIndex(i => itemLink.includes(i.id));
    } else if (platform === 'github') {
      itemIndex = items.findIndex(i => {
        const itemUrl = i.url?.replace('api.github.com/repos', 'github.com').replace('/pulls/', '/pull/');
        return itemUrl === itemLink || itemLink.includes(i.repo);
      });
    } else if (platform === 'reddit') {
      itemIndex = items.findIndex(i => i.url === itemLink);
    } else if (platform === 'discord') {
      itemIndex = items.findIndex(i => i.url === itemLink);
    }
    
    // 못 찾으면 첫 번째 항목 제거
    if (itemIndex === -1 && items.length > 0) itemIndex = 0;
    
    if (itemIndex !== -1) {
      items.splice(itemIndex, 1);
      pStatus[platform].count = items.length;
      pStatus[platform].items = items;
      
      await chrome.storage.local.set({ platformsStatus: pStatus });
      
      // 로컬 캐시 업데이트
      platformsStatus[platform].count = items.length;
      platformsStatus[platform].items = items;
      
      chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
    }
  }
}

// RSS 피드에서 특정 아이템만 제거
async function removeItemFromRSSFeed(feedId, itemLink) {
  const { rss_feed_states: states = {} } = await chrome.storage.local.get('rss_feed_states');
  
  if (states[feedId] && states[feedId].newItems && states[feedId].newItems.length > 0) {
    const itemIndex = states[feedId].newItems.findIndex(i => i.link === itemLink);
    
    if (itemIndex !== -1) {
      states[feedId].newItems.splice(itemIndex, 1);
      states[feedId].newCount = states[feedId].newItems.length;
      
      await chrome.storage.local.set({ rss_feed_states: states });
      chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
    }
  }
}

// ===== 설정 =====

async function loadSettings() {
  try {
    const settings = await chrome.storage.sync.get(['checkTime', 'showNotification']);
    
    if (settings.checkTime && typeof settings.checkTime === 'object') {
      if (settings.checkTime.hour) elements.checkHour.value = settings.checkTime.hour;
      if (settings.checkTime.minute !== undefined) elements.checkMinute.value = settings.checkTime.minute;
      if (settings.checkTime.ampm) elements.checkAmPm.value = settings.checkTime.ampm;
    }
    if (settings.showNotification !== undefined) {
      elements.showNotification.checked = settings.showNotification;
    }
    
    // 다음 체크 시간 표시
    updateNextCheckInfo();
  } catch (error) {
    console.error('설정 로드 오류:', error);
  }
}

async function saveSettings() {
  const checkTime = {
    hour: parseInt(elements.checkHour.value),
    minute: parseInt(elements.checkMinute.value),
    ampm: elements.checkAmPm.value
  };
  
  const settings = {
    checkTime,
    showNotification: elements.showNotification.checked
  };
  
  await chrome.storage.sync.set(settings);
  await chrome.runtime.sendMessage({ action: 'updateScheduledAlarm', checkTime });
  
  updateNextCheckInfo();
  showToast('✓ Saved', 'success');
}

// 다음 체크 시간 표시
function updateNextCheckInfo() {
  if (!elements.nextCheckInfo) return;
  
  const hour = parseInt(elements.checkHour.value);
  const minute = parseInt(elements.checkMinute.value);
  const ampm = elements.checkAmPm.value;
  
  // 24시간 형식으로 변환
  let hour24 = hour;
  if (ampm === 'PM' && hour !== 12) hour24 = hour + 12;
  if (ampm === 'AM' && hour === 12) hour24 = 0;
  
  const now = new Date();
  const nextCheck = new Date();
  nextCheck.setHours(hour24, minute, 0, 0);
  
  // 이미 지났으면 내일
  if (nextCheck <= now) {
    nextCheck.setDate(nextCheck.getDate() + 1);
  }
  
  const diffMs = nextCheck - now;
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  
  let timeText = '';
  if (diffHours > 0) {
    timeText = `in ${diffHours}h ${diffMins}m`;
  } else {
    timeText = `in ${diffMins}m`;
  }
  
  elements.nextCheckInfo.textContent = `Next check: ${timeText}`;
}

async function resetData() {
  if (!confirm('Reset all data?\n(Synced data will be deleted on all devices)')) return;
  
  await chrome.storage.sync.clear();
  await chrome.storage.local.clear();
  chrome.runtime.sendMessage({ action: 'clearBadge' });
  
  showToast('Reset complete!', 'success');
  location.reload();
}

// ===== 새 글 목록 드롭다운 =====

let currentDropdown = null;

// 모든 새글 보기 드롭다운 (사이트 + 플랫폼 + RSS) - 통일된 스타일
async function showAllNewPostsDropdown() {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  const { platformsStatus: pStatus = {} } = await chrome.storage.local.get('platformsStatus');
  const { rss_feeds = [] } = await chrome.storage.sync.get('rss_feeds');
  const { rss_feed_states: rssStates = {} } = await chrome.storage.local.get('rss_feed_states');
  
  // 모든 새 아이템 수집
  const allNewItems = [];
  
  // RSS 피드 아이템 먼저 추가
  rss_feeds.forEach(feed => {
    const state = rssStates[feed.id];
    if (state && state.newItems && state.newItems.length > 0) {
      state.newItems.forEach(item => {
        allNewItems.push({
          title: item.title,
          link: item.link,
          siteName: `📡 ${feed.name}`,
          rss: true,
          feedId: feed.id,
          date: item.author || ''
        });
      });
    }
  });
  
  // 플랫폼 아이템 먼저 (상단에 표시) - 사이트와 동일한 형식
  if (pStatus.gmail && pStatus.gmail.items && pStatus.gmail.items.length > 0) {
    pStatus.gmail.items.forEach(item => {
      allNewItems.push({
        title: item.subject || item.from || 'New email',
        link: 'https://mail.google.com',
        siteName: 'Gmail',
        platform: 'gmail',
        date: item.from ? item.from.split('<')[0].trim() : ''
      });
    });
  }
  
  if (pStatus.youtube && pStatus.youtube.items && pStatus.youtube.items.length > 0) {
    pStatus.youtube.items.forEach(item => {
      allNewItems.push({
        title: item.title,
        link: `https://youtube.com/watch?v=${item.id}`,
        siteName: 'YouTube',
        platform: 'youtube',
        date: item.channelTitle || ''
      });
    });
  }
  
  if (pStatus.github && pStatus.github.items && pStatus.github.items.length > 0) {
    pStatus.github.items.forEach(item => {
      const typeEmoji = {
        'Issue': '🔴',
        'PullRequest': '🟢',
        'Release': '🏷️'
      };
      const emoji = typeEmoji[item.type] || '';
      const url = item.url 
        ? item.url.replace('api.github.com/repos', 'github.com').replace('/pulls/', '/pull/')
        : `https://github.com/${item.repo}`;
      
      allNewItems.push({
        title: `${emoji} ${item.title}`,
        link: url,
        siteName: 'GitHub',
        platform: 'github',
        date: item.repo || ''
      });
    });
  }
  
  if (pStatus.reddit && pStatus.reddit.items && pStatus.reddit.items.length > 0) {
    pStatus.reddit.items.forEach(item => {
      allNewItems.push({
        title: item.title,
        link: item.url || 'https://reddit.com/message/inbox',
        siteName: 'Reddit',
        platform: 'reddit',
        date: `u/${item.author || ''}`
      });
    });
  }
  
  if (pStatus.discord && pStatus.discord.items && pStatus.discord.items.length > 0) {
    pStatus.discord.items.forEach(item => {
      allNewItems.push({
        title: item.content || 'New message',
        link: item.url || 'https://discord.com',
        siteName: 'Discord',
        platform: 'discord',
        date: item.author || ''
      });
    });
  }
  
  
  // 사이트 새글
  sites.forEach((site, index) => {
    const state = siteStates[site.url];
    if (state && state.newPosts && state.newPosts.length > 0) {
      const hostname = new URL(site.url).hostname.replace('www.', '');
      const shortName = hostname.split('.')[0];
      state.newPosts.forEach(post => {
        allNewItems.push({
          ...post,
          siteName: shortName,
          siteUrl: site.url,
          siteIndex: index
        });
      });
    }
  });
  
  if (allNewItems.length === 0) {
    showToast('No new updates', 'info');
    return;
  }
  
  // 기존 드롭다운 닫기
  closeDropdown();
  
  // 드롭다운 생성
  const INITIAL_SHOW = 20;
  let showingAll = false;
  
  const dropdown = document.createElement('div');
  dropdown.className = 'new-posts-dropdown all-posts';
  
  function renderDropdownContent(showAll = false) {
    const itemsToShow = showAll ? allNewItems : allNewItems.slice(0, INITIAL_SHOW);
    const remaining = allNewItems.length - INITIAL_SHOW;
    
    return `
      <div class="dropdown-header">
        <span>📋 All Updates (${allNewItems.length})</span>
        <button class="dropdown-close">×</button>
      </div>
      <div class="dropdown-list">
        ${itemsToShow.map((item, idx) => `
          <a href="${item.link}" class="dropdown-item" target="_blank" 
             data-site-index="${item.siteIndex !== undefined ? item.siteIndex : ''}"
             data-site-url="${item.siteUrl || ''}"
             data-platform="${item.platform || ''}"
             data-feed-id="${item.feedId || ''}"
             data-item-link="${item.link || ''}"
             data-item-idx="${idx}">
            <span class="post-site">${escapeHtml(item.siteName)}</span>
            <span class="post-title">${escapeHtml(item.title)}</span>
            ${item.date ? `<span class="post-date">${escapeHtml(item.date)}</span>` : ''}
          </a>
        `).join('')}
        ${!showAll && remaining > 0 ? `
          <button class="dropdown-show-more">
            Show ${remaining} more
          </button>
        ` : ''}
      </div>
      <div class="dropdown-footer">
        <button class="btn-mark-all-read">Mark All Read</button>
      </div>
    `;
  }
  
  dropdown.innerHTML = renderDropdownContent(false);
  
  // body에 추가
  document.body.appendChild(dropdown);
  currentDropdown = dropdown;
  document.body.classList.add('dropdown-open');
  
  function setupDropdownListeners() {
    // 닫기 버튼
    dropdown.querySelector('.dropdown-close').addEventListener('click', closeDropdown);
    
    // 모두 읽음 처리 버튼
    dropdown.querySelector('.btn-mark-all-read').addEventListener('click', async (e) => {
      const btn = e.target;
      const originalText = btn.textContent;
      btn.textContent = 'Processing...';
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';
      
      try {
        await markAllAsRead();
        closeDropdown();
      } catch (error) {
        console.error('[Popup] Mark all read error:', error);
        btn.textContent = originalText;
        btn.disabled = false;
        btn.style.opacity = '1';
        btn.style.cursor = 'pointer';
        showToast('Failed: ' + error.message, 'error');
      }
    });
    
    // 링크 클릭 시 해당 항목만 읽음 처리
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async (e) => {
        const siteUrl = item.dataset.siteUrl;
        const platform = item.dataset.platform;
        const feedId = item.dataset.feedId;
        const itemLink = item.dataset.itemLink;
        const itemIdx = parseInt(item.dataset.itemIdx);
        
        if (feedId) {
          // RSS 아이템 클릭 - 해당 항목만 제거
          await removeItemFromRSSFeed(feedId, itemLink);
        } else if (platform) {
          // 플랫폼 아이템 클릭 - 해당 항목만 제거
          await removeItemFromPlatform(platform, itemLink);
        } else if (siteUrl) {
          // 사이트 아이템 클릭 - 해당 항목만 제거
          await removePostFromSite(siteUrl, itemLink);
        }
        
        // 리스트에서 해당 항목 제거
        allNewItems.splice(itemIdx, 1);
        
        // UI 업데이트
        if (allNewItems.length === 0) {
          closeDropdown();
          showToast('All caught up! 🎉', 'success');
        } else {
          dropdown.innerHTML = renderDropdownContent(showingAll);
          setupDropdownListeners();
        }
        
        await updateTotalCount();
        await loadSites();
        await updatePlatformUI();
        await loadRSSFeeds();
      });
    });
    
    // 더 보기 버튼
    const showMoreBtn = dropdown.querySelector('.dropdown-show-more');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showingAll = true;
        dropdown.innerHTML = renderDropdownContent(true);
        setupDropdownListeners();
      });
    }
  }
  
  setupDropdownListeners();
  
  // 외부 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 100);
}

// 모든 것 읽음 처리 (사이트 + 플랫폼 + RSS)
async function markAllAsRead() {
  console.log('[Popup] markAllAsRead called');
  
  let hasError = false;
  let errorMessage = '';
  
  // 사이트 읽음 처리
  await markAllSitesAsRead();
  
  // 플랫폼 읽음 처리 (모든 플랫폼)
  const platforms = ['gmail', 'youtube', 'github', 'reddit', 'discord'];
  for (const platform of platforms) {
    if (platformsStatus[platform]?.connected && platformsStatus[platform]?.count > 0) {
      console.log(`[Popup] Marking ${platform} as read...`);
      
      // 플랫폼별 "본 것"으로 표시
      const result = await markPlatformAsSeen(platform);
      
      // Gmail 실패 체크
      if (platform === 'gmail' && result && !result.success) {
        console.error('[Popup] Gmail mark as read failed:', result.error);
        hasError = true;
        errorMessage = result.error || 'Gmail: Please reconnect to grant permissions';
      }
      
      // 로컬 상태 초기화
      await chrome.runtime.sendMessage({ action: 'markPlatformAsRead', platform });
      platformsStatus[platform].count = 0;
      platformsStatus[platform].items = [];
    }
  }
  
  // RSS 피드 읽음 처리
  await chrome.runtime.sendMessage({ action: 'markAllRSSFeedsAsRead' });
  rssFeeds.forEach(feed => {
    feed.newCount = 0;
    feed.newItems = [];
  });
  renderRSSFeedGrid(rssFeeds);
  await updateRSSSection();
  
  await savePlatformsStatus();
  await updatePlatformUI();
  await updateTotalCount();
  
  if (hasError) {
    showToast(errorMessage, 'error');
  } else {
    showToast('All marked as read', 'success');
  }
}

// 모든 사이트 읽음 처리
async function markAllSitesAsRead() {
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  Object.keys(siteStates).forEach(url => {
    siteStates[url].newCount = 0;
    siteStates[url].newPosts = [];
  });
  
  await chrome.storage.local.set({ siteStates });
  await loadSites();
  await updateTotalCount();
  
  chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
  showToast('All posts marked as read', 'success');
}

async function showNewPostsDropdown(index, badgeElement) {
  // 기존 드롭다운 닫기
  closeDropdown();
  
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  const site = sites[index];
  const state = site ? siteStates[site.url] : null;
  
  if (!state || !state.newPosts || state.newPosts.length === 0) {
    showToast('Cannot load posts list', 'error');
    return;
  }
  
  // 드롭다운 생성
  const INITIAL_SHOW = 15;
  const newPosts = state.newPosts;
  let showingAllPosts = false;
  
  const dropdown = document.createElement('div');
  dropdown.className = 'new-posts-dropdown';
  
  function renderSiteDropdownContent(showAll = false) {
    const postsToShow = showAll ? newPosts : newPosts.slice(0, INITIAL_SHOW);
    const remaining = newPosts.length - INITIAL_SHOW;
    
    return `
      <div class="dropdown-header">
        <span>📋 New Posts (${newPosts.length})</span>
        <button class="dropdown-close">×</button>
    </div>
      <div class="dropdown-list">
        ${postsToShow.map((post, idx) => `
          <a href="${post.link}" class="dropdown-item" target="_blank" 
             data-post-link="${post.link}" data-post-idx="${idx}">
            <span class="post-title">${escapeHtml(post.title)}</span>
            ${post.date ? `<span class="post-date">${post.date}</span>` : ''}
          </a>
        `).join('')}
        ${!showAll && remaining > 0 ? `
          <button class="dropdown-show-more">
            Show ${remaining} more posts
          </button>
        ` : ''}
      </div>
      <div class="dropdown-footer">
        <button class="btn-mark-read" data-index="${index}">Mark All Read</button>
      </div>
    `;
  }
  
  dropdown.innerHTML = renderSiteDropdownContent(false);
  
  // body에 추가 (팝업 밖으로 안 잘리게)
  document.body.appendChild(dropdown);
  currentDropdown = dropdown;
  document.body.classList.add('dropdown-open');
  
  // 가운데 정렬 (all-posts와 같은 위치)
  dropdown.style.position = 'fixed';
  dropdown.style.top = '60px';
  dropdown.style.left = '50%';
  dropdown.style.transform = 'translateX(-50%)';
  dropdown.style.right = 'auto';
  dropdown.style.bottom = 'auto';
  
  function setupSiteDropdownListeners() {
    // 닫기 버튼
    dropdown.querySelector('.dropdown-close').addEventListener('click', closeDropdown);
    
    // 전체 읽음 처리 버튼
    dropdown.querySelector('.btn-mark-read').addEventListener('click', async () => {
      await markSiteAsRead(index);
      closeDropdown();
    });
    
    // 링크 클릭 시 해당 항목만 읽음 처리
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        const postLink = item.dataset.postLink;
        const postIdx = parseInt(item.dataset.postIdx);
        
        // 해당 포스트만 제거
        await removePostFromSite(siteUrl, postLink);
        newPosts.splice(postIdx, 1);
        
        // UI 업데이트
        if (newPosts.length === 0) {
          closeDropdown();
          showToast('All caught up! 🎉', 'success');
        } else {
          dropdown.innerHTML = renderSiteDropdownContent(showingAllPosts);
          setupSiteDropdownListeners();
        }
        
        await loadSites();
        await updateTotalCount();
      });
    });
    
    // 더 보기 버튼
    const showMoreBtn = dropdown.querySelector('.dropdown-show-more');
    if (showMoreBtn) {
      showMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showingAllPosts = true;
        dropdown.innerHTML = renderSiteDropdownContent(true);
        setupSiteDropdownListeners();
      });
    }
  }
  
  setupSiteDropdownListeners();
  
  // 외부 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 100);
}

function closeDropdown() {
  if (currentDropdown) {
    currentDropdown.remove();
    currentDropdown = null;
  }
  document.body.classList.remove('dropdown-open');
  document.removeEventListener('click', handleOutsideClick);
}

function handleOutsideClick(e) {
  if (currentDropdown && !currentDropdown.contains(e.target) && 
      !e.target.classList.contains('site-badge') && e.target.id !== 'totalCount') {
    closeDropdown();
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== 유틸리티 =====

function showToast(message, type = '') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

// ===== 플랫폼 관리 =====

// 사이트 개수 뱃지 업데이트
async function updateSiteCountBadge() {
  if (!elements.siteCountBadge) return;
  
  const { sites = [] } = await chrome.storage.sync.get('sites');
  elements.siteCountBadge.textContent = sites.length;
  elements.siteCountBadge.style.display = sites.length > 0 ? 'inline-flex' : 'none';
  
  // 제한 카운터도 업데이트
  updateSiteLimitCounter(sites.length);
}

// 사이트 제한 카운터 업데이트
function updateSiteLimitCounter(count) {
  if (!elements.siteLimitCounter) return;
  
  elements.siteLimitCounter.textContent = `${count}/${LIMITS.sites}`;
  
  // 상태에 따른 스타일 변경
  elements.siteLimitCounter.classList.remove('warning', 'limit-reached');
  
  if (count >= LIMITS.sites) {
    elements.siteLimitCounter.classList.add('limit-reached');
    // 추가 버튼 비활성화
    if (elements.addCurrentPage) {
      elements.addCurrentPage.disabled = true;
      elements.addCurrentPage.title = `Site limit reached (${LIMITS.sites} max)`;
    }
  } else if (count >= LIMITS.sitesWarning) {
    elements.siteLimitCounter.classList.add('warning');
    // 추가 버튼 활성화
    if (elements.addCurrentPage) {
      elements.addCurrentPage.disabled = false;
      elements.addCurrentPage.title = 'Add current page';
    }
  } else {
    // 추가 버튼 활성화
    if (elements.addCurrentPage) {
      elements.addCurrentPage.disabled = false;
      elements.addCurrentPage.title = 'Add current page';
    }
  }
}

// 플랫폼 이벤트 리스너 설정
function setupPlatformEventListeners() {
  // 플랫폼 연결 버튼들
  document.querySelectorAll('.btn-connect').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const platform = e.target.dataset.platform;
      connectPlatform(platform);
    });
  });
}

// 플랫폼 연결/해제 토글
async function connectPlatform(platform) {
  // 이미 연결된 상태면 연결 해제 확인
  if (platformsStatus[platform]?.connected) {
    const platformNames = {
      gmail: 'Gmail',
      youtube: 'YouTube',
      github: 'GitHub',
      slack: 'Slack'
    };
    
    const confirmed = confirm(`Disconnect ${platformNames[platform]}?\n\nYou can reconnect anytime.`);
    
    if (confirmed) {
      await disconnectPlatform(platform);
    }
    return;
  }
  
  // 플랫폼별 연결 로직
  switch (platform) {
    case 'gmail':
      await connectGmail();
      break;
    case 'youtube':
      await connectYouTube();
      break;
    case 'github':
      await connectGitHub();
      break;
    case 'reddit':
      await connectReddit();
      break;
    case 'discord':
      await connectDiscord();
      break;
    default:
      showToast('Unknown platform', 'error');
  }
}

// 플랫폼 연결 해제
async function disconnectPlatform(platform) {
  try {
    let result;
    
    switch (platform) {
      case 'gmail':
        result = await chrome.runtime.sendMessage({ action: 'disconnectGmail' });
        break;
      case 'youtube':
        result = await chrome.runtime.sendMessage({ action: 'disconnectYouTube' });
        break;
      case 'github':
        result = await chrome.runtime.sendMessage({ action: 'disconnectGitHub' });
        break;
      case 'reddit':
        result = await chrome.runtime.sendMessage({ action: 'disconnectReddit' });
        break;
      case 'discord':
        result = await chrome.runtime.sendMessage({ action: 'disconnectDiscord' });
        break;
      default:
        showToast('Unknown platform', 'error');
        return;
    }
    
    if (result.success) {
      platformsStatus[platform].connected = false;
      platformsStatus[platform].count = 0;
      await savePlatformsStatus();
      await updatePlatformUI();
      
      const platformNames = {
        gmail: 'Gmail',
        youtube: 'YouTube',
        github: 'GitHub',
        slack: 'Slack'
      };
      showToast(`${platformNames[platform]} disconnected`, 'success');
    } else {
      showToast(result.error || 'Disconnect failed', 'error');
    }
  } catch (error) {
    console.error('Disconnect platform failed:', error);
    showToast('Disconnect failed', 'error');
  }
}

// 플랫폼 읽음 처리 (실제 API 연동)
async function markPlatformAsSeen(platform) {
  try {
    console.log(`[Popup] markPlatformAsSeen called for ${platform}`);
    
    let result = { success: true };
    
    if (platform === 'gmail') {
      // Gmail: 현재 메시지들을 "본 것"으로 표시 + Gmail에서 실제 읽음 처리
      result = await chrome.runtime.sendMessage({ action: 'markGmailAsSeen' });
      console.log('[Popup] markGmailAsSeen result:', result);
    } else if (platform === 'github') {
      // GitHub: 알림을 "본 것"으로 표시 + GitHub에서 실제 읽음 처리
      result = await chrome.runtime.sendMessage({ action: 'markGitHubAllRead' });
      console.log('[Popup] markGitHubAllRead result:', result);
    } else if (platform === 'reddit') {
      // Reddit: 알림 읽음 처리
      result = await chrome.runtime.sendMessage({ action: 'markRedditAsSeen' });
      console.log('[Popup] markRedditAsSeen result:', result);
    } else if (platform === 'discord') {
      // Discord: 메시지 본 것으로 표시
      result = await chrome.runtime.sendMessage({ action: 'markDiscordAsSeen' });
      console.log('[Popup] markDiscordAsSeen result:', result);
    }
    // YouTube는 별도 처리 필요 없음 (이미 lastVideoIds로 관리)
    
    return result;
  } catch (error) {
    console.error('Mark platform as seen failed:', error);
    return { success: false, error: error.message };
  }
}

// Gmail 연결
async function connectGmail() {
  try {
    showToast('Connecting to Gmail...', 'info');
    
    // Gmail OAuth 연결
    const result = await chrome.runtime.sendMessage({ action: 'connectGmail' });
    
    if (result.success) {
      showToast('Gmail connected!', 'success');
      platformsStatus.gmail.connected = true;
      await updatePlatformUI();
      await savePlatformsStatus();
    } else {
      showToast(result.error || 'Gmail connection failed', 'error');
    }
  } catch (error) {
    showToast('Gmail connection failed', 'error');
  }
}

// YouTube 연결
async function connectYouTube() {
  try {
    showToast('Connecting to YouTube...', 'info');
    
    // YouTube OAuth 연결
    const result = await chrome.runtime.sendMessage({ action: 'connectYouTube' });
    
    if (result.success) {
      showToast('YouTube connected!', 'success');
      platformsStatus.youtube.connected = true;
      await updatePlatformUI();
      await savePlatformsStatus();
    } else {
      showToast(result.error || 'YouTube connection failed', 'error');
    }
  } catch (error) {
    showToast('YouTube connection failed', 'error');
  }
}

// GitHub 연결 (Personal Access Token 방식)
async function connectGitHub() {
  const token = prompt(
    'Enter GitHub Personal Access Token:\n\n' +
    '1. Go to GitHub Settings > Developer settings\n' +
    '2. Personal access tokens > Tokens (classic)\n' +
    '3. Generate new token (classic)\n' +
    '4. Select "notifications" scope\n' +
    '5. Copy and paste the token here'
  );
  
  if (!token || token.trim() === '') {
    return;
  }
  
  try {
    showToast('Connecting to GitHub...', 'info');
    
    const result = await chrome.runtime.sendMessage({ 
      action: 'connectGitHub',
      token: token.trim()
    });
    
    if (result.success) {
      platformsStatus.github = {
        connected: true,
        username: result.username,
        count: 0,
        items: []
      };
      await savePlatformsStatus();
      await updatePlatformUI();
      showToast(`GitHub connected: @${result.username}`, 'success');
    } else {
      showToast(result.error || 'GitHub connection failed', 'error');
    }
  } catch (error) {
    console.error('GitHub connect error:', error);
    showToast('GitHub connection failed', 'error');
  }
}

// Reddit 연결
async function connectReddit() {
  const clientId = prompt(
    'Enter Reddit App Client ID:\n\n' +
    '1. Go to reddit.com/prefs/apps\n' +
    '2. Create app (script type)\n' +
    '3. Copy the Client ID (under app name)'
  );
  
  if (!clientId || clientId.trim() === '') {
    return;
  }
  
  const username = prompt('Enter your Reddit username:');
  if (!username) return;
  
  const password = prompt('Enter your Reddit password:');
  if (!password) return;
  
  try {
    showToast('Connecting to Reddit...', 'info');
    
    const result = await chrome.runtime.sendMessage({ 
      action: 'connectReddit',
      credentials: { clientId: clientId.trim(), username, password }
    });
    
    if (result.success) {
      platformsStatus.reddit = {
        connected: true,
        username: result.username,
        count: 0,
        items: []
      };
      await savePlatformsStatus();
      await updatePlatformUI();
      showToast(`Reddit connected: u/${result.username}`, 'success');
    } else {
      showToast(result.error || 'Reddit connection failed', 'error');
    }
  } catch (error) {
    console.error('Reddit connect error:', error);
    showToast('Reddit connection failed', 'error');
  }
}

// Discord 연결 (Bot Token 방식)
async function connectDiscord() {
  const token = prompt(
    'Enter Discord Bot Token:\n\n' +
    '1. Go to discord.com/developers/applications\n' +
    '2. Create New Application\n' +
    '3. Go to Bot > Add Bot\n' +
    '4. Copy the Token'
  );
  
  if (!token || token.trim() === '') {
    return;
  }
  
  try {
    showToast('Connecting to Discord...', 'info');
    
    const result = await chrome.runtime.sendMessage({ 
      action: 'connectDiscord',
      token: token.trim()
    });
    
    if (result.success) {
      platformsStatus.discord = {
        connected: true,
        username: result.username,
        count: 0,
        items: []
      };
      await savePlatformsStatus();
      await updatePlatformUI();
      showToast(`Discord connected: ${result.username}`, 'success');
    } else {
      showToast(result.error || 'Discord connection failed', 'error');
    }
  } catch (error) {
    console.error('Discord connect error:', error);
    showToast('Discord connection failed', 'error');
  }
}

// 플랫폼 상태 저장
async function savePlatformsStatus() {
  await chrome.storage.local.set({ platformsStatus });
}

// 플랫폼 상태 로드
async function loadPlatformsStatus() {
  try {
    const { platformsStatus: saved } = await chrome.storage.local.get('platformsStatus');
    if (saved) {
      platformsStatus = { ...platformsStatus, ...saved };
    }
    
    // 실제 연결 상태 확인
    // Gmail 실제 연결 상태 확인
    const gmailStatus = await chrome.runtime.sendMessage({ action: 'getGmailStatus' });
    if (gmailStatus) {
      platformsStatus.gmail.connected = gmailStatus.connected;
    }
    
    // YouTube 실제 연결 상태 확인
    const youtubeStatus = await chrome.runtime.sendMessage({ action: 'getYouTubeStatus' });
    if (youtubeStatus) {
      platformsStatus.youtube.connected = youtubeStatus.connected;
    }
    
    // GitHub 실제 연결 상태 확인
    const githubStatus = await chrome.runtime.sendMessage({ action: 'getGitHubStatus' });
    if (githubStatus) {
      platformsStatus.github.connected = githubStatus.connected;
      if (githubStatus.username) {
        platformsStatus.github.username = githubStatus.username;
      }
    }
    
    // Reddit 실제 연결 상태 확인
    const redditStatus = await chrome.runtime.sendMessage({ action: 'getRedditStatus' });
    if (redditStatus) {
      platformsStatus.reddit.connected = redditStatus.connected;
      if (redditStatus.username) {
        platformsStatus.reddit.username = redditStatus.username;
      }
    }
    
    // Discord 실제 연결 상태 확인
    const discordStatus = await chrome.runtime.sendMessage({ action: 'getDiscordStatus' });
    if (discordStatus) {
      platformsStatus.discord.connected = discordStatus.connected;
      if (discordStatus.username) {
        platformsStatus.discord.username = discordStatus.username;
      }
    }
    
    await updatePlatformUI();
  } catch (error) {
    console.error('Load platforms status failed:', error);
  }
}

// 플랫폼 UI 전체 업데이트
async function updatePlatformUI() {
  // 설정 화면 버튼 업데이트
  updatePlatformButton('gmail', platformsStatus.gmail.connected);
  updatePlatformButton('youtube', platformsStatus.youtube.connected);
  updatePlatformButton('github', platformsStatus.github.connected);
  updatePlatformButton('reddit', platformsStatus.reddit.connected);
  updatePlatformButton('discord', platformsStatus.discord.connected);
  
  // 메인 화면 플랫폼 섹션 업데이트
  updateMainPlatformsSection();
}

// 플랫폼 버튼 상태 업데이트 (설정 화면)
function updatePlatformButton(platform, connected) {
  const btn = document.querySelector(`.btn-connect[data-platform="${platform}"]`);
  if (btn) {
    if (connected) {
      btn.textContent = 'Connected';
      btn.classList.add('connected');
    } else {
      btn.textContent = 'Connect';
      btn.classList.remove('connected');
    }
  }
}

// 메인 화면 플랫폼 섹션 업데이트
async function updateMainPlatformsSection() {
  if (!elements.connectedPlatformsMain || !elements.connectedPlatformsGrid) return;
  
  // 토글 상태를 스토리지에서 직접 확인
  const { enablePlatforms = true } = await chrome.storage.sync.get('enablePlatforms');
  
  // 연결된 플랫폼이 있는지 확인
  const hasConnected = Object.values(platformsStatus).some(p => p.connected);
  
  // 토글이 비활성화되었거나 연결된 플랫폼이 없으면 숨김
  if (!enablePlatforms || !hasConnected) {
    elements.connectedPlatformsMain.style.display = 'none';
    return;
  }
  
  // 섹션 표시
  elements.connectedPlatformsMain.style.display = 'block';
  
  // 각 플랫폼 칩 표시/숨김
  Object.keys(platformsStatus).forEach(platform => {
    const chip = elements.connectedPlatformsGrid.querySelector(`[data-platform="${platform}"]`);
    if (chip) {
      const status = platformsStatus[platform];
      chip.style.display = status.connected ? 'flex' : 'none';
      
      // 뱃지 업데이트
      const badge = chip.querySelector('.platform-chip-badge');
      if (badge) {
        badge.textContent = status.count || '0';
        badge.style.display = status.count > 0 ? 'inline-flex' : 'none';
      }
      
      // 업데이트 있으면 하이라이트
      if (status.count > 0) {
        chip.classList.add('has-updates');
        chip.title = `${status.count} new - Click to view`;
      } else {
        chip.classList.remove('has-updates');
        chip.title = 'No new updates';
      }
    }
  });
}

// 플랫폼 아이템 드롭다운 표시 (사이트 드롭다운과 동일한 스타일)
async function showPlatformItemsDropdown(platform) {
  closeDropdown();
  
  const { platformsStatus: pStatus = {} } = await chrome.storage.local.get('platformsStatus');
  const status = pStatus[platform];
  
  if (!status || !status.items || status.items.length === 0) {
    // 아이템이 없으면 해당 플랫폼 페이지로 이동
    openPlatformDetails(platform);
    return;
  }
  
  const platformNames = {
    gmail: '📧 Gmail',
    youtube: '🎬 YouTube',
    github: '🐙 GitHub',
    reddit: '🔴 Reddit',
    discord: '💬 Discord'
  };
  
  const platformLinks = {
    gmail: 'https://mail.google.com',
    youtube: 'https://youtube.com/feed/subscriptions',
    github: 'https://github.com/notifications',
    reddit: 'https://reddit.com/message/inbox',
    discord: 'https://discord.com/channels/@me'
  };
  
  const dropdown = document.createElement('div');
  dropdown.className = 'new-posts-dropdown all-posts'; // 사이트와 동일한 스타일
  
  let itemsHtml = '';
  let platformItems = [...status.items]; // 복사본 생성
  
  function renderPlatformItems() {
    if (platform === 'gmail') {
      return platformItems.map((item, idx) => `
        <a href="https://mail.google.com" class="dropdown-item" target="_blank" data-item-idx="${idx}">
          <span class="post-title">${escapeHtml(item.subject || item.from || 'New email')}</span>
          <span class="post-date">${item.from ? escapeHtml(item.from.split('<')[0].trim()) : ''}</span>
        </a>
      `).join('');
    } else if (platform === 'youtube') {
      return platformItems.map((item, idx) => `
        <a href="https://youtube.com/watch?v=${item.id}" class="dropdown-item" target="_blank" data-item-idx="${idx}">
          <span class="post-title">${escapeHtml(item.title)}</span>
          <span class="post-date">${escapeHtml(item.channelTitle || '')}</span>
        </a>
      `).join('');
    } else if (platform === 'github') {
      return platformItems.map((item, idx) => {
        const typeEmoji = {
          'Issue': '🔴',
          'PullRequest': '🟢',
          'Release': '🏷️',
          'Discussion': '💬'
        };
        const emoji = typeEmoji[item.type] || '📌';
        const url = item.url 
          ? item.url.replace('api.github.com/repos', 'github.com').replace('/pulls/', '/pull/')
          : `https://github.com/${item.repo}`;
        
        return `
          <a href="${url}" class="dropdown-item" target="_blank" data-item-idx="${idx}">
            <span class="post-title">${emoji} ${escapeHtml(item.title)}</span>
            <span class="post-date">${escapeHtml(item.repo || '')}</span>
          </a>
        `;
      }).join('');
    } else if (platform === 'reddit') {
      return platformItems.map((item, idx) => `
        <a href="${item.url || 'https://reddit.com/message/inbox'}" class="dropdown-item" target="_blank" data-item-idx="${idx}">
          <span class="post-title">${escapeHtml(item.title)}</span>
          <span class="post-date">u/${escapeHtml(item.author || '')} • r/${escapeHtml(item.subreddit || '')}</span>
        </a>
      `).join('');
    } else if (platform === 'discord') {
      return platformItems.map((item, idx) => `
        <a href="${item.url || 'https://discord.com'}" class="dropdown-item" target="_blank" data-item-idx="${idx}">
          <span class="post-title">${escapeHtml(item.content || 'New message')}</span>
          <span class="post-date">${escapeHtml(item.author || '')} • ${escapeHtml(item.guildName || '')}</span>
        </a>
      `).join('');
    }
    return '';
  }
  
  itemsHtml = renderPlatformItems();
  
  function renderPlatformDropdown() {
    return `
      <div class="dropdown-header">
        <span>${platformNames[platform]} (${platformItems.length})</span>
        <button class="dropdown-close">×</button>
      </div>
      <div class="dropdown-list">
        ${renderPlatformItems()}
      </div>
      <div class="dropdown-footer">
        <button class="btn-mark-all-read btn-mark-platform-read" data-platform="${platform}">Mark All Read</button>
      </div>
    `;
  }
  
  dropdown.innerHTML = renderPlatformDropdown();
  
  document.body.appendChild(dropdown);
  currentDropdown = dropdown;
  document.body.classList.add('dropdown-open');
  
  function setupPlatformDropdownListeners() {
    // 닫기 버튼
    dropdown.querySelector('.dropdown-close').addEventListener('click', closeDropdown);
    
    // 개별 아이템 클릭 시 해당 항목만 제거
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        const itemIdx = parseInt(item.dataset.itemIdx);
        
        // 스토리지에서 해당 항목 제거
        const { platformsStatus: pStatus = {} } = await chrome.storage.local.get('platformsStatus');
        if (pStatus[platform] && pStatus[platform].items) {
          pStatus[platform].items.splice(itemIdx, 1);
          pStatus[platform].count = pStatus[platform].items.length;
          await chrome.storage.local.set({ platformsStatus: pStatus });
          
          // 로컬 캐시 업데이트
          platformsStatus[platform].count = pStatus[platform].count;
          platformsStatus[platform].items = pStatus[platform].items;
          platformItems.splice(itemIdx, 1);
          
          chrome.runtime.sendMessage({ action: 'updateBadgeFromStorage' });
        }
        
        // UI 업데이트
        if (platformItems.length === 0) {
          closeDropdown();
          showToast('All caught up! 🎉', 'success');
        } else {
          dropdown.innerHTML = renderPlatformDropdown();
          setupPlatformDropdownListeners();
        }
        
        await updatePlatformUI();
        await updateTotalCount();
      });
    });
    
    // 전체 읽음 처리
    const markBtn = dropdown.querySelector('.btn-mark-platform-read');
    markBtn.addEventListener('click', async () => {
      // 버튼 비활성화 및 Processing 표시
      const originalText = markBtn.textContent;
      markBtn.textContent = 'Processing...';
      markBtn.disabled = true;
      markBtn.style.opacity = '0.6';
      markBtn.style.cursor = 'not-allowed';
      
      try {
        console.log(`[Popup] Marking ${platform} as read...`);
        
        // 플랫폼별 "본 것"으로 표시 (Gmail 실제 읽음 처리 포함)
        const result = await markPlatformAsSeen(platform);
        
        // Gmail에서 실패했으면 에러 메시지 표시
        if (result && !result.success && platform === 'gmail') {
          markBtn.textContent = originalText;
          markBtn.disabled = false;
          markBtn.style.opacity = '1';
          markBtn.style.cursor = 'pointer';
          showToast(result.error || 'Failed. Please reconnect Gmail.', 'error');
          return;
        }
        
        // 로컬 상태 초기화
        await chrome.runtime.sendMessage({ action: 'markPlatformAsRead', platform });
        platformsStatus[platform].count = 0;
        platformsStatus[platform].items = [];
        await savePlatformsStatus();
        await updatePlatformUI();
        await updateTotalCount();
        closeDropdown();
        showToast(`${platform.charAt(0).toUpperCase() + platform.slice(1)} marked as read`, 'success');
        
        console.log(`[Popup] ${platform} marked as read successfully`);
      } catch (error) {
        console.error(`[Popup] Error marking ${platform} as read:`, error);
        markBtn.textContent = originalText;
        markBtn.disabled = false;
        markBtn.style.opacity = '1';
        markBtn.style.cursor = 'pointer';
        showToast('Failed to mark as read', 'error');
      }
    });
  }
  
  setupPlatformDropdownListeners();
  
  // 외부 클릭 시 닫기
        setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 100);
}

// 플랫폼 칩 클릭 이벤트 설정
function setupPlatformChipEvents() {
  const chips = document.querySelectorAll('.platform-chip');
  chips.forEach(chip => {
    chip.addEventListener('click', (e) => {
      // 삭제 버튼 클릭 시 무시
      if (e.target.classList.contains('platform-chip-delete')) return;
      
      const platform = chip.dataset.platform;
      const status = platformsStatus[platform];
      
      // 새 아이템이 있으면 드롭다운, 없으면 해당 페이지 열기
      if (status && status.count > 0) {
        showPlatformItemsDropdown(platform);
      } else {
        openPlatformDetails(platform);
      }
    });
  });
  
  // 삭제 버튼 이벤트
  document.querySelectorAll('.platform-chip-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const platform = btn.dataset.platform;
      await disconnectPlatformFromChip(platform);
    });
  });
}

// 플랫폼 칩에서 연결 해제 (메인 팝업)
async function disconnectPlatformFromChip(platform) {
  try {
    const platformNames = {
      gmail: 'Gmail',
      youtube: 'YouTube',
      github: 'GitHub',
      reddit: 'Reddit',
      discord: 'Discord'
    };
    
    // 연결 해제 요청
    const action = `disconnect${platform.charAt(0).toUpperCase() + platform.slice(1)}`;
    const result = await chrome.runtime.sendMessage({ action });
    
    if (result?.success) {
      // UI 업데이트
      platformsStatus[platform] = { connected: false, count: 0, items: [] };
      savePlatformsStatus();
      updateMainPlatformsSection();
      updatePlatformUI();
      updateTotalCount();
      
      showToast(`${platformNames[platform]} disconnected`, 'info');
    } else {
      showToast(`Failed to disconnect ${platformNames[platform]}`, 'error');
    }
  } catch (error) {
    console.error('Platform disconnect error:', error);
    showToast('Disconnect failed', 'error');
  }
}

// 플랫폼 상세 열기 (드롭다운 또는 새 탭)
function openPlatformDetails(platform) {
  switch (platform) {
    case 'gmail':
      chrome.tabs.create({ url: 'https://mail.google.com' });
      break;
    case 'youtube':
      chrome.tabs.create({ url: 'https://www.youtube.com/feed/subscriptions' });
      break;
    case 'github':
      chrome.tabs.create({ url: 'https://github.com/notifications' });
      break;
    case 'slack':
      chrome.tabs.create({ url: 'https://slack.com' });
      break;
  }
}

// ===== RSS 기능 =====

// RSS 피드 로드 및 UI 업데이트
async function loadRSSFeeds() {
  console.log('[RSS] Loading RSS feeds...');
  try {
    const result = await chrome.runtime.sendMessage({ action: 'getRSSFeedsWithState' });
    rssFeeds = result.feeds || [];
    console.log('[RSS] Loaded', rssFeeds.length, 'feeds:', rssFeeds.map(f => f.name));
    
    renderRSSFeedGrid(rssFeeds);
    renderRSSFeedListManage(rssFeeds);
    renderPopularFeedsInline(); // 제한 상태에 따라 인기 피드 버튼 업데이트
    await updateRSSSection();
  } catch (error) {
    console.error('[RSS] Load failed:', error);
    rssFeeds = [];
  }
}

// RSS 섹션 표시/숨김 업데이트
async function updateRSSSection() {
  const hasFeeds = rssFeeds.length > 0;
  const totalNewCount = rssFeeds.reduce((sum, feed) => sum + (feed.newCount || 0), 0);
  
  // 토글 상태를 스토리지에서 직접 확인
  const { enableRSSFeeds = true } = await chrome.storage.sync.get('enableRSSFeeds');
  
  // 메인 뷰 RSS 섹션 - 토글이 활성화되고 피드가 있을 때만 표시 (Connected Platforms과 동일)
  if (elements.rssFeedsSection) {
    elements.rssFeedsSection.style.display = (enableRSSFeeds && hasFeeds) ? 'block' : 'none';
  }
  
  // 설정 뷰 RSS 피드 개수
  if (elements.rssFeedCountSettings) {
    elements.rssFeedCountSettings.textContent = rssFeeds.length;
    elements.rssFeedCountSettings.style.display = rssFeeds.length > 0 ? 'inline-flex' : 'none';
  }
  
  // RSS 제한 카운터 업데이트
  updateRSSLimitCounter(rssFeeds.length);
}

// RSS 제한 카운터 업데이트
function updateRSSLimitCounter(count) {
  if (!elements.rssLimitCounter) return;
  
  elements.rssLimitCounter.textContent = `${count}/${LIMITS.rssFeeds}`;
  
  // 상태에 따른 스타일 변경
  elements.rssLimitCounter.classList.remove('warning', 'limit-reached');
  
  const addRssBtn = document.getElementById('addRssFeedInline');
  
  if (count >= LIMITS.rssFeeds) {
    elements.rssLimitCounter.classList.add('limit-reached');
    // 추가 버튼 비활성화
    if (addRssBtn) {
      addRssBtn.disabled = true;
      addRssBtn.title = `RSS feed limit reached (${LIMITS.rssFeeds} max)`;
    }
  } else if (count >= LIMITS.rssFeedsWarning) {
    elements.rssLimitCounter.classList.add('warning');
    // 추가 버튼 활성화
    if (addRssBtn) {
      addRssBtn.disabled = false;
      addRssBtn.title = 'Add RSS feed';
    }
  } else {
    // 추가 버튼 활성화
    if (addRssBtn) {
      addRssBtn.disabled = false;
      addRssBtn.title = 'Add RSS feed';
    }
  }
}

// RSS 피드 그리드 렌더링 (메인 뷰)
function renderRSSFeedGrid(feeds) {
  if (!elements.rssFeedGrid) return;
  
  // 피드가 없으면 그리드 비우기 (섹션 자체가 숨겨짐)
  if (feeds.length === 0) {
    elements.rssFeedGrid.innerHTML = '';
    return;
  }
  
  // 메인 팝업 - 호버 시 삭제 버튼 표시
  elements.rssFeedGrid.innerHTML = feeds.map(feed => {
    const hasNew = feed.newCount > 0;
    
    return `
      <div class="rss-chip" data-feed-id="${feed.id}" data-url="${feed.url}" title="${feed.name}">
        <svg class="rss-chip-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 11a9 9 0 0 1 9 9"/>
          <path d="M4 4a16 16 0 0 1 16 16"/>
          <circle cx="5" cy="19" r="1"/>
        </svg>
        <span class="rss-chip-name">${escapeHtml(feed.name)}</span>
        ${hasNew ? `<span class="rss-chip-badge show" data-feed-id="${feed.id}">${feed.newCount}</span>` : ''}
        <button class="rss-chip-delete" data-feed-id="${feed.id}" title="Delete">×</button>
      </div>
    `;
  }).join('');
  
  // 이벤트 리스너 설정 (클릭해서 새 글 확인 + 삭제)
  setupRSSChipEvents();
}

// RSS 피드 리스트 렌더링 (설정 뷰)
function renderRSSFeedListManage(feeds) {
  if (!elements.rssFeedListManage) return;
  
  if (feeds.length === 0) {
    elements.rssFeedListManage.innerHTML = '<li class="empty-state">No RSS feeds added yet</li>';
    return;
  }
  
  elements.rssFeedListManage.innerHTML = feeds.map(feed => `
    <li class="rss-manage-item">
      <div class="rss-manage-info">
        <svg class="rss-manage-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M4 11a9 9 0 0 1 9 9"/>
          <path d="M4 4a16 16 0 0 1 16 16"/>
          <circle cx="5" cy="19" r="1"/>
        </svg>
        <div class="rss-manage-details">
          <div class="rss-manage-name">${escapeHtml(feed.name)}</div>
          <div class="rss-manage-url">${escapeHtml(new URL(feed.url).hostname)}</div>
        </div>
      </div>
      <div class="rss-manage-actions">
        <button class="btn-icon-sm btn-delete-site" data-feed-id="${feed.id}" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
          </svg>
        </button>
      </div>
    </li>
  `).join('');
  
  // 삭제 버튼 이벤트
  elements.rssFeedListManage.querySelectorAll('.btn-delete-site').forEach(btn => {
    btn.addEventListener('click', () => removeRSSFeed(btn.dataset.feedId));
  });
}

// RSS 칩 이벤트 설정
function setupRSSChipEvents() {
  // 칩 클릭 - 피드 열기 또는 드롭다운
  elements.rssFeedGrid?.querySelectorAll('.rss-chip').forEach(chip => {
    chip.addEventListener('click', async (e) => {
      if (e.target.classList.contains('rss-chip-delete')) return;
      if (e.target.classList.contains('rss-chip-badge')) {
        const feedId = e.target.dataset.feedId;
        await showRSSItemsDropdown(feedId);
    return;
  }
  
      const feedId = chip.dataset.feedId;
      const feed = rssFeeds.find(f => f.id === feedId);
      
      if (feed && feed.newCount > 0) {
        await showRSSItemsDropdown(feedId);
      } else if (feed) {
        // 새 글 없으면 피드 URL 열기
        chrome.tabs.create({ url: feed.url });
        await markRSSFeedAsRead(feedId);
      }
    });
  });
  
  // 삭제 버튼
  elements.rssFeedGrid?.querySelectorAll('.rss-chip-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await removeRSSFeed(btn.dataset.feedId);
    });
  });
}

// RSS 아이템 드롭다운 표시
async function showRSSItemsDropdown(feedId) {
  closeDropdown();
  
  const feed = rssFeeds.find(f => f.id === feedId);
  if (!feed || !feed.newItems || feed.newItems.length === 0) {
    showToast('No new items', 'info');
    return;
  }
  
  let rssItems = [...feed.newItems]; // 복사본 생성
  
  const dropdown = document.createElement('div');
  dropdown.className = 'new-posts-dropdown all-posts';
  
  function renderRSSDropdown() {
    return `
      <div class="dropdown-header">
        <span>📡 ${escapeHtml(feed.name)} (${rssItems.length})</span>
        <button class="dropdown-close">×</button>
      </div>
      <div class="dropdown-list">
        ${rssItems.map((item, idx) => `
          <a href="${item.link}" class="dropdown-item" target="_blank" data-item-idx="${idx}" data-item-link="${item.link}">
            <span class="post-title">${escapeHtml(item.title)}</span>
            ${item.author ? `<span class="post-date">${escapeHtml(item.author)}</span>` : ''}
          </a>
        `).join('')}
      </div>
      <div class="dropdown-footer">
        <button class="btn-mark-all-read" data-feed-id="${feedId}">Mark All Read</button>
      </div>
    `;
  }
  
  dropdown.innerHTML = renderRSSDropdown();
  
  document.body.appendChild(dropdown);
  currentDropdown = dropdown;
  document.body.classList.add('dropdown-open');
  
  function setupRSSDropdownListeners() {
    // 닫기 버튼
    dropdown.querySelector('.dropdown-close').addEventListener('click', closeDropdown);
    
    // 개별 아이템 클릭 시 해당 항목만 제거
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        const itemIdx = parseInt(item.dataset.itemIdx);
        const itemLink = item.dataset.itemLink;
        
        // 스토리지에서 해당 항목 제거
        await removeItemFromRSSFeed(feedId, itemLink);
        rssItems.splice(itemIdx, 1);
        
        // UI 업데이트
        if (rssItems.length === 0) {
          closeDropdown();
          showToast('All caught up! 🎉', 'success');
        } else {
          dropdown.innerHTML = renderRSSDropdown();
          setupRSSDropdownListeners();
        }
        
        await loadRSSFeeds();
        await updateTotalCount();
      });
    });
    
    // 전체 읽음 처리
    const markBtn = dropdown.querySelector('.btn-mark-all-read');
    markBtn.addEventListener('click', async () => {
      // 버튼 비활성화 및 Processing 표시
      const originalText = markBtn.textContent;
      markBtn.textContent = 'Processing...';
      markBtn.disabled = true;
      markBtn.style.opacity = '0.6';
      markBtn.style.cursor = 'not-allowed';
      
      try {
        await markRSSFeedAsRead(feedId);
        closeDropdown();
        showToast('Marked as read', 'success');
      } catch (error) {
        markBtn.textContent = originalText;
        markBtn.disabled = false;
        markBtn.style.opacity = '1';
        markBtn.style.cursor = 'pointer';
        showToast('Failed to mark as read', 'error');
      }
    });
  }
  
  setupRSSDropdownListeners();
  
  // 외부 클릭 시 닫기
  setTimeout(() => {
    document.addEventListener('click', handleOutsideClick);
  }, 100);
}

// RSS 피드 읽음 처리
async function markRSSFeedAsRead(feedId) {
  try {
    await chrome.runtime.sendMessage({ action: 'markRSSFeedAsRead', feedId });
    
    // 로컬 상태 업데이트
    const feed = rssFeeds.find(f => f.id === feedId);
    if (feed) {
      feed.newCount = 0;
      feed.newItems = [];
    }
    
    renderRSSFeedGrid(rssFeeds);
    updateRSSSection();
    await updateTotalCount();
  } catch (error) {
    console.error('Mark RSS feed as read failed:', error);
  }
}

// RSS 피드 삭제 (사이트 삭제와 동일하게 확인 없이 바로 삭제)
async function removeRSSFeed(feedId) {
  try {
    await chrome.runtime.sendMessage({ action: 'removeRSSFeed', feedId });
    rssFeeds = rssFeeds.filter(f => f.id !== feedId);
    
    renderRSSFeedGrid(rssFeeds);
    renderRSSFeedListManage(rssFeeds);
    updateRSSSection();
    await updateTotalCount();
    await updateStorageUsage();
    
    showToast('RSS feed removed', 'success');
  } catch (error) {
    console.error('Remove RSS feed failed:', error);
    showToast('Failed to remove', 'error');
  }
}
// ============================================
// 토글 상태 관리
// ============================================

// 토글 상태 로드
async function loadToggleStates() {
  try {
    const result = await chrome.storage.sync.get(['enablePlatforms', 'enableRSSFeeds']);
    
    // 기본값: 둘 다 활성화
    const platformsEnabled = result.enablePlatforms !== false;
    const rssFeedsEnabled = result.enableRSSFeeds !== false;
    
    // 체크박스 상태 설정
    if (elements.enablePlatforms) {
      elements.enablePlatforms.checked = platformsEnabled;
    }
    if (elements.enableRSSFeeds) {
      elements.enableRSSFeeds.checked = rssFeedsEnabled;
    }
    
    // 상세 내용 표시/숨김 (Settings 화면)
    updateToggleDetailVisibility('platforms', platformsEnabled);
    updateToggleDetailVisibility('rss', rssFeedsEnabled);
    
    // 팝업 메인 섹션 표시/숨김 (개별 칩 포함)
    await updateMainPlatformsSection();
    await updateRSSSection();
    
  } catch (error) {
    console.error('토글 상태 로드 오류:', error);
  }
}

// 토글 상태 저장
async function saveToggleState(key, value) {
  try {
    await chrome.storage.sync.set({ [key]: value });
  } catch (error) {
    console.error('토글 상태 저장 오류:', error);
  }
}

// Settings 상세 내용 표시/숨김
function updateToggleDetailVisibility(type, isEnabled) {
  if (type === 'platforms') {
    if (elements.platformsDetailContent) {
      elements.platformsDetailContent.style.display = isEnabled ? 'block' : 'none';
    }
  } else if (type === 'rss') {
    if (elements.rssFeedsDetailContent) {
      elements.rssFeedsDetailContent.style.display = isEnabled ? 'block' : 'none';
    }
  }
}

// 팝업 메인 섹션 표시/숨김
// 토글 이벤트 리스너 설정
function setupToggleEventListeners() {
  // Connected Platforms 토글
  elements.enablePlatforms?.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    await saveToggleState('enablePlatforms', isEnabled);
    updateToggleDetailVisibility('platforms', isEnabled);
    await updateMainPlatformsSection(); // 플랫폼 칩 업데이트 (섹션 + 개별 칩)
    await updateTotalCount(); // 배지 카운트 업데이트
  });
  
  // RSS Feeds 토글
  elements.enableRSSFeeds?.addEventListener('change', async (e) => {
    const isEnabled = e.target.checked;
    await saveToggleState('enableRSSFeeds', isEnabled);
    updateToggleDetailVisibility('rss', isEnabled);
    await updateRSSSection(); // RSS 섹션 업데이트
    await updateTotalCount(); // 배지 카운트 업데이트
    
    // RSS 인라인 인기 피드 렌더링
    if (isEnabled) {
      renderPopularFeedsInline();
    }
  });
}

// ============================================
// 인라인 RSS 폼 관련
// ============================================

// 인라인 RSS 이벤트 리스너 설정
function setupInlineRSSEventListeners() {
  // 인라인 RSS 추가 버튼
  elements.addRssFeedInline?.addEventListener('click', addRSSFeedInline);
  
  // 자동 감지 버튼
  elements.autoDetectRssInline?.addEventListener('click', autoDetectRSSFeedInline);
  
  // Enter 키로 추가
  elements.rssFeedUrlInline?.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addRSSFeedInline();
  });
  
  // 인라인 인기 피드 렌더링
  renderPopularFeedsInline();
}

// 인라인 인기 피드 렌더링
function renderPopularFeedsInline() {
  if (!elements.popularFeedsListInline) return;
  
  const popularFeeds = [
    { name: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml' },
    { name: 'Hacker News', url: 'https://news.ycombinator.com/rss' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' }
  ];
  
  const isLimitReached = rssFeeds.length >= LIMITS.rssFeeds;
  
  elements.popularFeedsListInline.innerHTML = popularFeeds.map(feed => `
    <button class="popular-feed-btn ${isLimitReached ? 'disabled' : ''}" 
            data-url="${feed.url}" 
            data-name="${feed.name}"
            ${isLimitReached ? 'disabled' : ''}>
      ${feed.name}
    </button>
  `).join('');
  
  // 인기 피드 클릭 이벤트 (제한 도달 시 무시)
  if (!isLimitReached) {
    elements.popularFeedsListInline.querySelectorAll('.popular-feed-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (elements.rssFeedUrlInline) elements.rssFeedUrlInline.value = btn.dataset.url;
        if (elements.rssFeedNameInline) elements.rssFeedNameInline.value = btn.dataset.name;
      });
    });
  }
}

// 인라인 RSS 피드 추가
async function addRSSFeedInline() {
  const feedUrl = elements.rssFeedUrlInline?.value.trim();
  const feedName = elements.rssFeedNameInline?.value.trim();
  
  if (!feedUrl) {
    showInlineRSSMessage('Please enter a feed URL', 'error');
    return;
  }
  
  // 제한 체크
  if (rssFeeds.length >= LIMITS.rssFeeds) {
    showInlineRSSMessage(`RSS feed limit reached (${LIMITS.rssFeeds} max)`, 'error');
    return;
  }
  
  try {
    showInlineRSSMessage('Adding feed...', 'info');
    
    const response = await chrome.runtime.sendMessage({
      action: 'addRSSFeed',
      feedUrl: feedUrl,
      feedName: feedName
    });
    
    if (response && response.success) {
      showInlineRSSMessage('Feed added successfully!', 'success');
      
      // 입력 필드 초기화
      if (elements.rssFeedUrlInline) elements.rssFeedUrlInline.value = '';
      if (elements.rssFeedNameInline) elements.rssFeedNameInline.value = '';
      
      // RSS 피드 목록 새로고침
      await loadRSSFeeds();
      
      // 2초 후 메시지 숨김
      setTimeout(() => hideInlineRSSMessage(), 2000);
    } else {
      showInlineRSSMessage(response?.error || 'Failed to add feed', 'error');
    }
  } catch (error) {
    console.error('RSS 피드 추가 오류:', error);
    showInlineRSSMessage('Failed to add feed', 'error');
  }
}

// 인라인 자동 감지
async function autoDetectRSSFeedInline() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) {
      showInlineRSSMessage('No active tab', 'error');
      return;
    }
    
    showInlineRSSMessage('Detecting RSS feed...', 'info');
    
    const response = await chrome.runtime.sendMessage({
      action: 'detectRSSFeed',
      url: tab.url
    });
    
    if (response && response.feedUrl) {
      if (elements.rssFeedUrlInline) elements.rssFeedUrlInline.value = response.feedUrl;
      if (elements.rssFeedNameInline && response.feedTitle) {
        elements.rssFeedNameInline.value = response.feedTitle;
      }
      showInlineRSSMessage('RSS feed detected!', 'success');
      setTimeout(() => hideInlineRSSMessage(), 2000);
    } else {
      showInlineRSSMessage('No RSS feed found', 'error');
    }
  } catch (error) {
    console.error('RSS 감지 오류:', error);
    showInlineRSSMessage('Detection failed', 'error');
  }
}

// 인라인 RSS 메시지 표시
function showInlineRSSMessage(message, type) {
  if (elements.rssInlineMessage) {
    elements.rssInlineMessage.textContent = message;
    elements.rssInlineMessage.className = `rss-message show ${type}`;
    elements.rssInlineMessage.style.display = 'block';
  }
}

// 인라인 RSS 메시지 숨김
function hideInlineRSSMessage() {
  if (elements.rssInlineMessage) {
    elements.rssInlineMessage.className = 'rss-message';
    elements.rssInlineMessage.textContent = '';
    elements.rssInlineMessage.style.display = 'none';
  }
}
