// Catch Up Later - GitHub Integration
// GitHub API를 사용하여 알림 확인

// ===== 상수 =====
const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_STORAGE_KEY = 'github_connection';

// ===== GitHub 연결 상태 =====

/**
 * GitHub 연결 상태 확인
 * @returns {Promise<{connected: boolean, username?: string, lastCheck?: string}>}
 */
async function getGitHubStatus() {
  try {
    const { github_connection } = await chrome.storage.local.get(GITHUB_STORAGE_KEY);
    
    if (!github_connection || !github_connection.accessToken) {
      return { connected: false };
    }
    
    // 토큰 유효성 확인
    const isValid = await validateGitHubToken(github_connection.accessToken);
    
    if (!isValid) {
      return { connected: false };
    }
    
    return {
      connected: true,
      username: github_connection.username,
      lastCheck: github_connection.lastCheck
    };
  } catch (error) {
    console.error('GitHub status check failed:', error);
    return { connected: false };
  }
}

/**
 * GitHub 토큰 유효성 확인
 * @param {string} accessToken
 * @returns {Promise<boolean>}
 */
async function validateGitHubToken(accessToken) {
  try {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ===== GitHub 연결 =====

/**
 * GitHub Personal Access Token으로 연결
 * @param {string} token - Personal Access Token
 * @returns {Promise<{success: boolean, username?: string, error?: string}>}
 */
async function connectGitHub(token) {
  try {
    if (!token || token.trim() === '') {
      return { success: false, error: 'Token is required' };
    }
    
    // 토큰으로 사용자 정보 가져오기
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid token' };
      }
      return { success: false, error: `API error: ${response.status}` };
    }
    
    const user = await response.json();
    
    // 연결 정보 저장
    await chrome.storage.local.set({
      [GITHUB_STORAGE_KEY]: {
        accessToken: token,
        username: user.login,
        avatarUrl: user.avatar_url,
        connectedAt: new Date().toISOString(),
        lastCheck: null,
        seenNotificationIds: []
      }
    });
    
    console.log(`[GitHub] Connected as ${user.login}`);
    
    return { success: true, username: user.login };
    
  } catch (error) {
    console.error('GitHub connection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * GitHub 연결 해제
 * @returns {Promise<{success: boolean}>}
 */
async function disconnectGitHub() {
  try {
    await chrome.storage.local.remove(GITHUB_STORAGE_KEY);
    return { success: true };
  } catch (error) {
    console.error('GitHub disconnect failed:', error);
    return { success: false, error: error.message };
  }
}

// ===== GitHub API 호출 =====

/**
 * 알림 목록 가져오기
 * @param {boolean} all - 모든 알림 (true) 또는 읽지 않은 것만 (false)
 * @returns {Promise<{notifications: Array, count: number}>}
 */
async function getNotifications(all = false) {
  try {
    const { github_connection } = await chrome.storage.local.get(GITHUB_STORAGE_KEY);
    
    if (!github_connection?.accessToken) {
      return { notifications: [], count: 0, error: 'Not connected' };
    }
    
    const response = await fetch(
      `${GITHUB_API_BASE}/notifications?all=${all}&per_page=50`,
      {
        headers: {
          'Authorization': `Bearer ${github_connection.accessToken}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );
    
    if (!response.ok) {
      if (response.status === 401) {
        return { notifications: [], count: 0, error: 'Token expired' };
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const notifications = await response.json();
    
    // 알림 정보 가공
    const processed = notifications.map(n => ({
      id: n.id,
      type: n.subject.type, // Issue, PullRequest, Release, etc.
      title: n.subject.title,
      repo: n.repository.full_name,
      repoUrl: n.repository.html_url,
      url: n.subject.url,
      reason: n.reason, // mention, review_requested, subscribed, etc.
      unread: n.unread,
      updatedAt: n.updated_at
    }));
    
    return {
      notifications: processed,
      count: processed.filter(n => n.unread).length
    };
    
  } catch (error) {
    console.error('Get GitHub notifications failed:', error);
    return { notifications: [], count: 0, error: error.message };
  }
}

/**
 * 새 알림 체크 (이미 본 알림 제외)
 * @returns {Promise<{hasNew: boolean, count: number, notifications: Array}>}
 */
async function checkNewNotifications() {
  try {
    const { github_connection } = await chrome.storage.local.get(GITHUB_STORAGE_KEY);
    
    if (!github_connection?.accessToken) {
      return { hasNew: false, count: 0, notifications: [], error: 'Not connected' };
    }
    
    console.log('[GitHub] Checking for new notifications...');
    
    // 읽지 않은 알림 가져오기
    const { notifications, error } = await getNotifications(false);
    
    if (error) {
      return { hasNew: false, count: 0, notifications: [], error };
    }
    
    // 이미 본 알림 ID 목록
    const seenIds = new Set(github_connection.seenNotificationIds || []);
    
    // 새로운 알림만 필터링
    const newNotifications = notifications.filter(n => !seenIds.has(n.id));
    
    console.log(`[GitHub] Total unread: ${notifications.length}, New: ${newNotifications.length}`);
    
    // 마지막 체크 시간 업데이트
    await chrome.storage.local.set({
      [GITHUB_STORAGE_KEY]: {
        ...github_connection,
        lastCheck: new Date().toISOString()
      }
    });
    
    return {
      hasNew: newNotifications.length > 0,
      count: newNotifications.length,
      notifications: newNotifications.slice(0, 20)
    };
    
  } catch (error) {
    console.error('[GitHub] Check new notifications failed:', error);
    return { hasNew: false, count: 0, notifications: [], error: error.message };
  }
}

/**
 * 알림을 "본 것"으로 표시
 * @returns {Promise<{success: boolean}>}
 */
async function markNotificationsAsSeen() {
  try {
    const { github_connection } = await chrome.storage.local.get(GITHUB_STORAGE_KEY);
    
    if (!github_connection?.accessToken) {
      return { success: false, error: 'Not connected' };
    }
    
    // 현재 알림 ID 가져오기
    const { notifications } = await getNotifications(false);
    const currentIds = notifications.map(n => n.id);
    
    // 기존 seenIds와 합치기 (최대 200개 유지)
    const existingSeenIds = github_connection.seenNotificationIds || [];
    const allSeenIds = [...new Set([...existingSeenIds, ...currentIds])].slice(-200);
    
    // 저장
    await chrome.storage.local.set({
      [GITHUB_STORAGE_KEY]: {
        ...github_connection,
        seenNotificationIds: allSeenIds
      }
    });
    
    console.log(`[GitHub] Marked ${currentIds.length} notifications as seen`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[GitHub] Mark notifications as seen failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * GitHub에서 실제로 알림 읽음 처리
 * @returns {Promise<{success: boolean}>}
 */
async function markAllAsRead() {
  try {
    const { github_connection } = await chrome.storage.local.get(GITHUB_STORAGE_KEY);
    
    if (!github_connection?.accessToken) {
      return { success: false, error: 'Not connected' };
    }
    
    // GitHub API로 모든 알림 읽음 처리
    const response = await fetch(`${GITHUB_API_BASE}/notifications`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${github_connection.accessToken}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });
    
    if (!response.ok && response.status !== 205) {
      throw new Error(`API error: ${response.status}`);
    }
    
    // 로컬에도 반영
    await markNotificationsAsSeen();
    
    console.log('[GitHub] All notifications marked as read');
    
    return { success: true };
    
  } catch (error) {
    console.error('[GitHub] Mark all as read failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 알림 URL을 웹 URL로 변환
 * @param {Object} notification
 * @returns {string}
 */
function getNotificationWebUrl(notification) {
  // API URL을 웹 URL로 변환
  // https://api.github.com/repos/owner/repo/issues/1 -> https://github.com/owner/repo/issues/1
  if (notification.url) {
    return notification.url
      .replace('api.github.com/repos', 'github.com')
      .replace('/pulls/', '/pull/');
  }
  return notification.repoUrl || 'https://github.com/notifications';
}

// ===== 내보내기 =====

if (typeof self !== 'undefined') {
  self.GitHubManager = {
    getGitHubStatus,
    connectGitHub,
    disconnectGitHub,
    getNotifications,
    checkNewNotifications,
    markNotificationsAsSeen,
    markAllAsRead,
    getNotificationWebUrl
  };
}

