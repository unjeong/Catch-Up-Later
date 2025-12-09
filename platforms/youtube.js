// Catch Up Later - YouTube Integration
// YouTube Data API를 사용하여 구독 채널 새 영상 알림

// ===== 상수 =====
const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const YOUTUBE_STORAGE_KEY = 'youtube_connection';

// ===== YouTube 연결 상태 =====

/**
 * YouTube 연결 상태 확인
 * @returns {Promise<{connected: boolean, email?: string, channelId?: string, lastCheck?: string}>}
 */
async function getYouTubeStatus() {
  try {
    console.log('[YouTube] getYouTubeStatus called');
    const { youtube_connection } = await chrome.storage.local.get(YOUTUBE_STORAGE_KEY);
    
    console.log('[YouTube] youtube_connection exists:', !!youtube_connection);
    
    if (!youtube_connection || !youtube_connection.accessToken) {
      console.log('[YouTube] No connection or no accessToken');
      return { connected: false };
    }
    
    console.log('[YouTube] Has accessToken, email:', youtube_connection.email);
    
    // 토큰 유효성 확인
    const isValid = await validateYouTubeToken(youtube_connection.accessToken);
    console.log('[YouTube] Token valid:', isValid);
    
    if (!isValid) {
      // 토큰 갱신 시도
      console.log('[YouTube] Trying to refresh token...');
      const refreshed = await refreshYouTubeToken();
      console.log('[YouTube] Token refreshed:', refreshed);
      if (!refreshed) {
        return { connected: false };
      }
    }
    
    console.log('[YouTube] Returning connected: true');
    return {
      connected: true,
      email: youtube_connection.email,
      channelId: youtube_connection.channelId,
      channelTitle: youtube_connection.channelTitle,
      lastCheck: youtube_connection.lastCheck
    };
  } catch (error) {
    console.error('YouTube status check failed:', error);
    return { connected: false };
  }
}

/**
 * YouTube 토큰 유효성 확인
 * @param {string} accessToken
 * @returns {Promise<boolean>}
 */
async function validateYouTubeToken(accessToken) {
  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken
    );
    return response.ok;
  } catch {
    return false;
  }
}

// ===== YouTube OAuth 연결 =====

/**
 * YouTube OAuth 연결 시작
 * 주의: 이 함수는 토큰만 가져오고 연결 저장은 하지 않음
 * autoConnectGooglePlatforms()가 스코프에 따라 연결을 저장함
 * @returns {Promise<{success: boolean, email?: string, channelTitle?: string, error?: string}>}
 */
async function connectYouTube() {
  try {
    console.log('[YouTube] Starting connection...');
    
    // 기존 캐시된 토큰 제거
    const existingToken = await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          resolve(null);
        } else {
          resolve(token);
        }
      });
    });
    
    if (existingToken) {
      console.log('[YouTube] Removing existing cached token...');
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: existingToken }, resolve);
      });
      
      // 토큰 철회
      try {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${existingToken}`);
      } catch (e) {
        console.log('[YouTube] Token revoke failed');
      }
    }
    
    // 모든 Google 플랫폼 연결 정보 클리어 (새로 선택하게)
    await chrome.storage.local.remove(['gmail_connection', 'youtube_connection', 'drive_connection']);
    console.log('[YouTube] Cleared all Google platform connections');
    
    // Chrome Identity API를 사용한 OAuth
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });
    
    if (!token) {
      return { success: false, error: 'Authentication failed' };
    }
    
    console.log('[YouTube] Got token successfully');
    
    // 사용자 정보 가져오기
    const userInfo = await getYouTubeUserInfo(token);
    
    console.log('[YouTube] User email:', userInfo.email);
    
    // 토큰과 이메일 반환 - 연결 저장은 autoConnectGooglePlatforms에서 처리
    return { 
      success: true, 
      email: userInfo.email,
      token: token
    };
    
  } catch (error) {
    console.error('YouTube connection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * YouTube 연결 해제
 * @returns {Promise<{success: boolean}>}
 */
async function disconnectYouTube() {
  try {
    // 저장된 토큰 가져오기
    const { youtube_connection } = await chrome.storage.local.get(YOUTUBE_STORAGE_KEY);
    
    if (youtube_connection?.accessToken) {
      // 토큰 철회
      await chrome.identity.removeCachedAuthToken({ token: youtube_connection.accessToken });
    }
    
    // 로컬 저장소에서 삭제
    await chrome.storage.local.remove(YOUTUBE_STORAGE_KEY);
    
    return { success: true };
  } catch (error) {
    console.error('YouTube disconnect failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * YouTube 토큰 갱신
 * @returns {Promise<boolean>}
 */
async function refreshYouTubeToken() {
  try {
    // 기존 토큰 제거
    const { youtube_connection } = await chrome.storage.local.get(YOUTUBE_STORAGE_KEY);
    if (youtube_connection?.accessToken) {
      await chrome.identity.removeCachedAuthToken({ token: youtube_connection.accessToken });
    }
    
    // 새 토큰 요청 (비대화식)
    const newToken = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });
    
    if (newToken) {
      await chrome.storage.local.set({
        [YOUTUBE_STORAGE_KEY]: {
          ...youtube_connection,
          accessToken: newToken
        }
      });
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('YouTube token refresh failed:', error);
    return false;
  }
}

// ===== YouTube API 호출 =====

/**
 * 사용자 정보 가져오기
 * @param {string} accessToken
 * @returns {Promise<{email: string}>}
 */
async function getYouTubeUserInfo(accessToken) {
  const response = await fetch(
    'https://www.googleapis.com/oauth2/v2/userinfo',
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  
  if (!response.ok) {
    throw new Error('Failed to get user info');
  }
  
  return await response.json();
}

/**
 * 내 채널 정보 가져오기
 * @param {string} accessToken
 * @returns {Promise<{id: string, title: string} | null>}
 */
async function getMyChannel(accessToken) {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=snippet&mine=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      console.error('Get my channel failed:', response.status);
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      return {
        id: data.items[0].id,
        title: data.items[0].snippet.title
      };
    }
    
    return null;
  } catch (error) {
    console.error('Get my channel failed:', error);
    return null;
  }
}

/**
 * 구독 채널 목록 가져오기
 * @param {string} accessToken
 * @param {number} maxResults
 * @returns {Promise<Array<{channelId: string, title: string, uploadsPlaylistId?: string}>>}
 */
async function getSubscribedChannels(accessToken, maxResults = 25) {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/subscriptions?part=snippet&mine=true&maxResults=${maxResults}&order=relevance`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      console.error('Get subscriptions failed:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    return (data.items || []).map(item => ({
      channelId: item.snippet.resourceId.channelId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.default?.url || ''
    }));
  } catch (error) {
    console.error('Get subscribed channels failed:', error);
    return [];
  }
}

/**
 * 채널의 uploads playlist ID 가져오기
 * @param {string} accessToken
 * @param {string[]} channelIds
 * @returns {Promise<Map<string, string>>}
 */
async function getChannelUploadPlaylists(accessToken, channelIds) {
  const playlistMap = new Map();
  
  if (channelIds.length === 0) return playlistMap;
  
  try {
    // 최대 50개 채널까지 한 번에 조회 가능
    const response = await fetch(
      `${YOUTUBE_API_BASE}/channels?part=contentDetails&id=${channelIds.join(',')}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      console.error('Get channel details failed:', response.status);
      return playlistMap;
    }
    
    const data = await response.json();
    
    (data.items || []).forEach(item => {
      const uploadsId = item.contentDetails?.relatedPlaylists?.uploads;
      if (uploadsId) {
        playlistMap.set(item.id, uploadsId);
      }
    });
    
    return playlistMap;
  } catch (error) {
    console.error('Get channel upload playlists failed:', error);
    return playlistMap;
  }
}

/**
 * 재생목록에서 최신 영상 가져오기
 * @param {string} accessToken
 * @param {string} playlistId
 * @param {number} maxResults
 * @returns {Promise<Array>}
 */
async function getPlaylistVideos(accessToken, playlistId, maxResults = 3) {
  try {
    const response = await fetch(
      `${YOUTUBE_API_BASE}/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      return [];
    }
    
    const data = await response.json();
    
    return (data.items || []).map(item => ({
      id: item.snippet.resourceId.videoId,
      title: item.snippet.title,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url || ''
    }));
  } catch (error) {
    console.error('Get playlist videos failed:', error);
    return [];
  }
}

/**
 * 구독 채널의 최신 영상 가져오기 (메인 함수)
 * @param {number} maxChannels - 확인할 최대 채널 수
 * @returns {Promise<{videos: Array, count: number, error?: string}>}
 */
async function getSubscriptionVideos(maxChannels = 15) {
  try {
    const { youtube_connection } = await chrome.storage.local.get(YOUTUBE_STORAGE_KEY);
    
    if (!youtube_connection?.accessToken) {
      return { videos: [], count: 0, error: 'Not connected' };
    }
    
    const accessToken = youtube_connection.accessToken;
    
    // 1. 구독 채널 목록 가져오기
    console.log('[YouTube] Fetching subscribed channels...');
    const channels = await getSubscribedChannels(accessToken, maxChannels);
    
    if (channels.length === 0) {
      console.log('[YouTube] No subscribed channels found');
      return { videos: [], count: 0 };
    }
    
    console.log(`[YouTube] Found ${channels.length} subscribed channels`);
    
    // 2. 각 채널의 uploads playlist ID 가져오기
    const channelIds = channels.map(c => c.channelId);
    const playlistMap = await getChannelUploadPlaylists(accessToken, channelIds);
    
    console.log(`[YouTube] Got ${playlistMap.size} upload playlists`);
    
    // 3. 각 채널의 최신 영상 가져오기 (최근 24시간 이내)
    const allVideos = [];
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    
    for (const channel of channels) {
      const playlistId = playlistMap.get(channel.channelId);
      if (!playlistId) continue;
      
      const videos = await getPlaylistVideos(accessToken, playlistId, 3);
      
      // 최근 24시간 이내 영상만 필터링
      const recentVideos = videos.filter(v => {
        const publishedDate = new Date(v.publishedAt);
        return publishedDate > oneDayAgo;
      });
      
      allVideos.push(...recentVideos);
    }
    
    // 4. 발행일 기준 정렬
    allVideos.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));
    
    console.log(`[YouTube] Found ${allVideos.length} recent videos`);
    
    return {
      videos: allVideos.slice(0, 20),
      count: allVideos.length
    };
    
  } catch (error) {
    console.error('[YouTube] Get subscription videos failed:', error);
    return { videos: [], count: 0, error: error.message };
  }
}

/**
 * 새 영상 체크 (마지막 체크 이후)
 * @returns {Promise<{hasNew: boolean, count: number, videos: Array}>}
 */
async function checkNewVideos() {
  try {
    const { youtube_connection } = await chrome.storage.local.get(YOUTUBE_STORAGE_KEY);
    
    if (!youtube_connection?.accessToken) {
      return { hasNew: false, count: 0, videos: [], error: 'Not connected' };
    }
    
    console.log('[YouTube] Checking for new videos...');
    
    // 최신 영상 가져오기
    const { videos, error } = await getSubscriptionVideos(15);
    
    if (error) {
      return { hasNew: false, count: 0, videos: [], error };
    }
    
    // 이전에 확인한 영상 ID 목록
    const lastVideoIds = new Set(youtube_connection.lastVideoIds || []);
    
    // 새로운 영상 필터링
    let newVideos = videos;
    
    if (lastVideoIds.size > 0) {
      newVideos = videos.filter(v => !lastVideoIds.has(v.id));
    }
    
    // 현재 영상 ID 목록 저장
    const currentVideoIds = videos.map(v => v.id);
    
    await chrome.storage.local.set({
      [YOUTUBE_STORAGE_KEY]: {
        ...youtube_connection,
        lastCheck: new Date().toISOString(),
        lastVideoIds: currentVideoIds,
        lastCount: newVideos.length
      }
    });
    
    console.log(`[YouTube] Found ${newVideos.length} new videos`);
    
    return {
      hasNew: newVideos.length > 0,
      count: newVideos.length,
      videos: newVideos.slice(0, 10)
    };
    
  } catch (error) {
    console.error('[YouTube] Check new videos failed:', error);
    return { hasNew: false, count: 0, videos: [], error: error.message };
  }
}

/**
 * 구독 목록 가져오기 (UI용)
 * @param {number} maxResults
 * @returns {Promise<{subscriptions: Array, count: number}>}
 */
async function getSubscriptions(maxResults = 50) {
  try {
    const { youtube_connection } = await chrome.storage.local.get(YOUTUBE_STORAGE_KEY);
    
    if (!youtube_connection?.accessToken) {
      return { subscriptions: [], count: 0, error: 'Not connected' };
    }
    
    const channels = await getSubscribedChannels(youtube_connection.accessToken, maxResults);
    
    return {
      subscriptions: channels,
      count: channels.length
    };
    
  } catch (error) {
    console.error('Get subscriptions failed:', error);
    return { subscriptions: [], count: 0, error: error.message };
  }
}

// ===== 내보내기 =====

if (typeof self !== 'undefined') {
  self.YouTubeManager = {
    getYouTubeStatus,
    connectYouTube,
    disconnectYouTube,
    getSubscriptionVideos,
    checkNewVideos,
    getSubscriptions
  };
}
