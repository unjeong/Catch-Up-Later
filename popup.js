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
  
  // 사이트 개수 뱃지
  siteCountBadge: document.getElementById('siteCountBadge')
};

let currentTabId = null;

// 초기화
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await loadSettings();
    await loadSites();
    await getCurrentTab();
    await updateTotalCount();
    await updateLastCheckTime();
    await updateStorageUsage();
    setupEventListeners();
    setupStorageListener();
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

// 총 새 글 수 업데이트
async function updateTotalCount() {
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  let total = 0;
  Object.values(siteStates).forEach(state => {
    if (state.newCount) {
      total += state.newCount;
    }
  });
  
  elements.totalCount.textContent = total;
  elements.totalAlertCard.classList.toggle('has-alerts', total > 0);
  
  // UPDATE / UPDATES 라벨 업데이트
  const alertLabel = document.querySelector('.alert-label');
  if (alertLabel) {
    alertLabel.textContent = total <= 1 ? 'UPDATE' : 'UPDATES';
  }
  
  // 클릭 가능 여부 설정
  if (total > 0) {
    elements.alertClickArea.title = `🔔 ${total} new posts - Click to view all`;
    elements.alertClickArea.classList.add('clickable');
  } else {
    elements.alertClickArea.title = '';
    elements.alertClickArea.classList.remove('clickable');
  }
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
  
  const { sites = [] } = await chrome.storage.sync.get('sites');
  
  if (sites.length === 0) {
    showToast('No sites added', '');
    return;
  }
  
  isRefreshing = true;
  elements.refreshAll.disabled = true;
  elements.refreshAll.classList.add('spinning');
  elements.refreshAll.style.opacity = '0.7';
  
  let totalNewCount = 0;
  
  try {
    // 각 사이트를 순차적으로 체크
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
    
    // 마지막 사이트의 체크마크가 보이도록 2초 대기
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // 최종 결과 업데이트
    await loadSites();
    await updateTotalCount();
    await updateLastCheckTime();
    
    if (totalNewCount > 0) {
      showToast(`🔔 ${totalNewCount} new posts!`, 'success');
    } else {
      showToast('✓ No new posts', 'success');
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
          showToast('❌ Failed to add', 'error');
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

// 사이트 읽음 처리
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

// 모든 새글 보기 드롭다운
async function showAllNewPostsDropdown() {
  const { sites = [] } = await chrome.storage.sync.get('sites');
  const { siteStates = {} } = await chrome.storage.local.get('siteStates');
  
  // 모든 사이트의 새글 수집
  const allNewPosts = [];
  sites.forEach((site, index) => {
    const state = siteStates[site.url];
    if (state && state.newPosts && state.newPosts.length > 0) {
      const hostname = new URL(site.url).hostname.replace('www.', '');
      const shortName = hostname.split('.')[0];
      state.newPosts.forEach(post => {
        allNewPosts.push({
          ...post,
          siteName: shortName,
          siteUrl: site.url,
          siteIndex: index
        });
      });
    }
  });
  
  if (allNewPosts.length === 0) {
    showToast('No new posts', 'info');
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
    const postsToShow = showAll ? allNewPosts : allNewPosts.slice(0, INITIAL_SHOW);
    const remaining = allNewPosts.length - INITIAL_SHOW;
    
    return `
      <div class="dropdown-header">
        <span>📋 All New Posts (${allNewPosts.length})</span>
        <button class="dropdown-close">×</button>
      </div>
      <div class="dropdown-list">
        ${postsToShow.map(post => `
          <a href="${post.link}" class="dropdown-item" target="_blank" data-site-index="${post.siteIndex}">
            <span class="post-site">${escapeHtml(post.siteName)}</span>
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
    dropdown.querySelector('.btn-mark-all-read').addEventListener('click', async () => {
      await markAllSitesAsRead();
      closeDropdown();
    });
    
    // 링크 클릭 시 해당 사이트 읽음 처리
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        const siteIndex = parseInt(item.dataset.siteIndex);
        await markSiteAsRead(siteIndex);
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
        ${postsToShow.map(post => `
          <a href="${post.link}" class="dropdown-item" target="_blank">
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
        <button class="btn-mark-read" data-index="${index}">Mark Read</button>
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
    
    // 읽음 처리 버튼
    dropdown.querySelector('.btn-mark-read').addEventListener('click', async () => {
      await markSiteAsRead(index);
      closeDropdown();
    });
    
    // 링크 클릭 시 읽음 처리
    dropdown.querySelectorAll('.dropdown-item').forEach(item => {
      item.addEventListener('click', async () => {
        await markSiteAsRead(index);
        closeDropdown();
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
