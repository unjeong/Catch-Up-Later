// Catch Up Later - Reddit Integration
// Reddit API를 사용하여 새 글/알림 확인

// ===== 상수 =====
const REDDIT_API_BASE = 'https://oauth.reddit.com';
const REDDIT_STORAGE_KEY = 'reddit_connection';

// ===== Reddit 연결 상태 =====

/**
 * Reddit 연결 상태 확인
 */
async function getRedditStatus() {
  try {
    const { reddit_connection } = await chrome.storage.local.get(REDDIT_STORAGE_KEY);
    
    if (!reddit_connection || !reddit_connection.accessToken) {
      return { connected: false };
    }
    
    // 토큰 유효성 확인
    const isValid = await validateRedditToken(reddit_connection.accessToken);
    
    if (!isValid) {
      return { connected: false };
    }
    
    return {
      connected: true,
      username: reddit_connection.username,
      lastCheck: reddit_connection.lastCheck
    };
  } catch (error) {
    console.error('Reddit status check failed:', error);
    return { connected: false };
  }
}

/**
 * Reddit 토큰 유효성 확인
 */
async function validateRedditToken(accessToken) {
  try {
    const response = await fetch(`${REDDIT_API_BASE}/api/v1/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'CatchUpLater/1.0'
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ===== Reddit 연결 (Personal Use Script 방식) =====

/**
 * Reddit 연결 - username/password + client credentials
 * Reddit App 필요: https://www.reddit.com/prefs/apps
 */
async function connectReddit(credentials) {
  try {
    const { clientId, clientSecret, username, password } = credentials;
    
    if (!clientId || !username || !password) {
      return { success: false, error: 'All fields required' };
    }
    
    // Password grant로 토큰 획득
    const authString = btoa(`${clientId}:${clientSecret || ''}`);
    
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'CatchUpLater/1.0'
      },
      body: `grant_type=password&username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`
    });
    
    if (!response.ok) {
      const error = await response.json();
      return { success: false, error: error.error || 'Authentication failed' };
    }
    
    const data = await response.json();
    
    if (data.error) {
      return { success: false, error: data.error };
    }
    
    // 사용자 정보 가져오기
    const userResponse = await fetch(`${REDDIT_API_BASE}/api/v1/me`, {
      headers: {
        'Authorization': `Bearer ${data.access_token}`,
        'User-Agent': 'CatchUpLater/1.0'
      }
    });
    
    const userData = await userResponse.json();
    
    // 연결 정보 저장
    await chrome.storage.local.set({
      [REDDIT_STORAGE_KEY]: {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        username: userData.name,
        connectedAt: new Date().toISOString(),
        lastCheck: null,
        seenPostIds: []
      }
    });
    
    console.log(`[Reddit] Connected as u/${userData.name}`);
    
    return { success: true, username: userData.name };
    
  } catch (error) {
    console.error('Reddit connection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Reddit 연결 해제
 */
async function disconnectReddit() {
  try {
    await chrome.storage.local.remove(REDDIT_STORAGE_KEY);
    return { success: true };
  } catch (error) {
    console.error('Reddit disconnect failed:', error);
    return { success: false, error: error.message };
  }
}

// ===== Reddit API 호출 =====

/**
 * 받은편지함 (멘션, 댓글 답글, 메시지) 가져오기
 */
async function getInbox() {
  try {
    const { reddit_connection } = await chrome.storage.local.get(REDDIT_STORAGE_KEY);
    
    if (!reddit_connection?.accessToken) {
      return { items: [], count: 0, error: 'Not connected' };
    }
    
    const response = await fetch(`${REDDIT_API_BASE}/message/inbox?limit=25`, {
      headers: {
        'Authorization': `Bearer ${reddit_connection.accessToken}`,
        'User-Agent': 'CatchUpLater/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const items = data.data.children.map(child => ({
      id: child.data.id,
      type: child.data.was_comment ? 'comment' : 'message',
      title: child.data.subject || child.data.link_title || 'Message',
      body: child.data.body?.substring(0, 100) || '',
      author: child.data.author,
      subreddit: child.data.subreddit,
      isNew: child.data.new,
      createdAt: new Date(child.data.created_utc * 1000).toISOString(),
      url: `https://reddit.com${child.data.context || ''}`
    }));
    
    return {
      items,
      count: items.filter(i => i.isNew).length
    };
    
  } catch (error) {
    console.error('Get Reddit inbox failed:', error);
    return { items: [], count: 0, error: error.message };
  }
}

/**
 * 구독 서브레딧 새 글 가져오기
 */
async function getSubscribedPosts() {
  try {
    const { reddit_connection } = await chrome.storage.local.get(REDDIT_STORAGE_KEY);
    
    if (!reddit_connection?.accessToken) {
      return { posts: [], count: 0, error: 'Not connected' };
    }
    
    // 구독 피드의 최신 글
    const response = await fetch(`${REDDIT_API_BASE}/best?limit=25`, {
      headers: {
        'Authorization': `Bearer ${reddit_connection.accessToken}`,
        'User-Agent': 'CatchUpLater/1.0'
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    const posts = data.data.children.map(child => ({
      id: child.data.id,
      title: child.data.title,
      subreddit: child.data.subreddit_name_prefixed,
      author: child.data.author,
      score: child.data.score,
      numComments: child.data.num_comments,
      createdAt: new Date(child.data.created_utc * 1000).toISOString(),
      url: `https://reddit.com${child.data.permalink}`
    }));
    
    return { posts, count: posts.length };
    
  } catch (error) {
    console.error('Get Reddit posts failed:', error);
    return { posts: [], count: 0, error: error.message };
  }
}

/**
 * 새 알림 체크
 */
async function checkNewNotifications() {
  try {
    const { reddit_connection } = await chrome.storage.local.get(REDDIT_STORAGE_KEY);
    
    if (!reddit_connection?.accessToken) {
      return { hasNew: false, count: 0, items: [], error: 'Not connected' };
    }
    
    console.log('[Reddit] Checking for new notifications...');
    
    // 받은편지함에서 새 알림 확인
    const { items, error } = await getInbox();
    
    if (error) {
      return { hasNew: false, count: 0, items: [], error };
    }
    
    // 이미 본 ID 목록
    const seenIds = new Set(reddit_connection.seenPostIds || []);
    
    // 새로운 알림만 필터링
    const newItems = items.filter(item => item.isNew && !seenIds.has(item.id));
    
    console.log(`[Reddit] Total inbox: ${items.length}, New: ${newItems.length}`);
    
    // 마지막 체크 시간 업데이트
    await chrome.storage.local.set({
      [REDDIT_STORAGE_KEY]: {
        ...reddit_connection,
        lastCheck: new Date().toISOString()
      }
    });
    
    return {
      hasNew: newItems.length > 0,
      count: newItems.length,
      items: newItems.slice(0, 20)
    };
    
  } catch (error) {
    console.error('[Reddit] Check new notifications failed:', error);
    return { hasNew: false, count: 0, items: [], error: error.message };
  }
}

/**
 * 알림을 "본 것"으로 표시
 */
async function markNotificationsAsSeen() {
  try {
    const { reddit_connection } = await chrome.storage.local.get(REDDIT_STORAGE_KEY);
    
    if (!reddit_connection?.accessToken) {
      return { success: false, error: 'Not connected' };
    }
    
    // 현재 알림 ID 가져오기
    const { items } = await getInbox();
    const currentIds = items.map(i => i.id);
    
    // 기존 seenIds와 합치기
    const existingSeenIds = reddit_connection.seenPostIds || [];
    const allSeenIds = [...new Set([...existingSeenIds, ...currentIds])].slice(-200);
    
    // 저장
    await chrome.storage.local.set({
      [REDDIT_STORAGE_KEY]: {
        ...reddit_connection,
        seenPostIds: allSeenIds
      }
    });
    
    // Reddit API로 읽음 처리
    await fetch(`${REDDIT_API_BASE}/api/read_all_messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${reddit_connection.accessToken}`,
        'User-Agent': 'CatchUpLater/1.0'
      }
    });
    
    console.log(`[Reddit] Marked ${currentIds.length} notifications as seen`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[Reddit] Mark notifications as seen failed:', error);
    return { success: false, error: error.message };
  }
}

// ===== 내보내기 =====

if (typeof self !== 'undefined') {
  self.RedditManager = {
    getRedditStatus,
    connectReddit,
    disconnectReddit,
    getInbox,
    getSubscribedPosts,
    checkNewNotifications,
    markNotificationsAsSeen
  };
}

