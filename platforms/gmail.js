// Catch Up Later - Gmail Integration
// Gmail API를 사용하여 새 이메일 알림

// ===== 상수 =====
const GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
const GMAIL_STORAGE_KEY = 'gmail_connection';

// ===== Gmail 연결 상태 =====

/**
 * Gmail 연결 상태 확인
 * @returns {Promise<{connected: boolean, email?: string, lastCheck?: string}>}
 */
async function getGmailStatus() {
  try {
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (!gmail_connection || !gmail_connection.accessToken) {
      return { connected: false };
    }
    
    // 토큰 유효성 확인
    const isValid = await validateGmailToken(gmail_connection.accessToken);
    
    if (!isValid) {
      // 토큰 갱신 시도
      const refreshed = await refreshGmailToken();
      if (!refreshed) {
        return { connected: false };
      }
    }
    
    return {
      connected: true,
      email: gmail_connection.email,
      lastCheck: gmail_connection.lastCheck,
      hasModifyScope: gmail_connection.hasModifyScope !== false // 기본값 true
    };
  } catch (error) {
    console.error('Gmail status check failed:', error);
    return { connected: false };
  }
}

/**
 * Gmail 토큰 유효성 확인
 * @param {string} accessToken
 * @returns {Promise<boolean>}
 */
async function validateGmailToken(accessToken) {
  try {
    const response = await fetch(
      'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken
    );
    return response.ok;
  } catch {
    return false;
  }
}

// ===== Gmail OAuth 연결 =====

/**
 * Gmail OAuth 연결 시작
 * 주의: 이 함수는 토큰만 가져오고 연결 저장은 하지 않음
 * autoConnectGooglePlatforms()가 스코프에 따라 연결을 저장함
 * @returns {Promise<{success: boolean, email?: string, token?: string, error?: string}>}
 */
async function connectGmail() {
  try {
    console.log('[Gmail] Starting connection...');
    
    // 1. 기존 캐시된 토큰 모두 제거
    const existingToken = await new Promise((resolve) => {
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          console.log('[Gmail] No existing token found');
          resolve(null);
        } else {
          resolve(token);
        }
      });
    });
    
    if (existingToken) {
      console.log('[Gmail] Removing existing cached token...');
      
      // Chrome 캐시에서 제거
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token: existingToken }, resolve);
      });
      
      // Google 서버에서도 토큰 철회 (새 로그인 강제)
      try {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${existingToken}`);
        console.log('[Gmail] Token revoked on Google servers');
      } catch (e) {
        console.log('[Gmail] Token revoke failed (may already be revoked)');
      }
    }
    
    // 2. 모든 Google 플랫폼 연결 정보 클리어 (새로 선택하게)
    await chrome.storage.local.remove(['gmail_connection', 'youtube_connection', 'drive_connection']);
    console.log('[Gmail] Cleared all Google platform connections');
    
    console.log('[Gmail] Requesting new token with interactive login...');
    
    // 3. 새 토큰 요청 (반드시 로그인 창 표시)
    const token = await new Promise((resolve, reject) => {
      chrome.identity.getAuthToken({ interactive: true }, (token) => {
        if (chrome.runtime.lastError) {
          console.error('[Gmail] getAuthToken error:', chrome.runtime.lastError.message);
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(token);
        }
      });
    });
    
    if (!token) {
      return { success: false, error: 'Authentication failed' };
    }
    
    console.log('[Gmail] Got new token successfully');
    
    // 사용자 정보 가져오기
    const userInfo = await getGmailUserInfo(token);
    
    console.log('[Gmail] User email:', userInfo.email);
    
    // 토큰과 이메일만 반환 - 연결 저장은 autoConnectGooglePlatforms에서 처리
    return { success: true, email: userInfo.email, token: token };
    
  } catch (error) {
    console.error('Gmail connection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gmail 연결 해제
 * @returns {Promise<{success: boolean}>}
 */
async function disconnectGmail() {
  try {
    console.log('[Gmail] Disconnecting...');
    
    // 저장된 토큰 가져오기
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (gmail_connection?.accessToken) {
      const token = gmail_connection.accessToken;
      
      // Chrome 캐시에서 제거
      await new Promise((resolve) => {
        chrome.identity.removeCachedAuthToken({ token }, resolve);
      });
      
      // Google 서버에서 토큰 철회 (다음 연결 시 새 로그인 강제)
      try {
        await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${token}`);
        console.log('[Gmail] Token revoked on Google servers');
      } catch (e) {
        console.log('[Gmail] Token revoke request sent');
      }
    }
    
    // 로컬 저장소에서 삭제
    await chrome.storage.local.remove(GMAIL_STORAGE_KEY);
    
    console.log('[Gmail] Disconnected successfully');
    return { success: true };
  } catch (error) {
    console.error('Gmail disconnect failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Gmail 토큰 갱신
 * @returns {Promise<boolean>}
 */
async function refreshGmailToken() {
  try {
    // 기존 토큰 제거
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    if (gmail_connection?.accessToken) {
      await chrome.identity.removeCachedAuthToken({ token: gmail_connection.accessToken });
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
        [GMAIL_STORAGE_KEY]: {
          ...gmail_connection,
          accessToken: newToken
        }
      });
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Gmail token refresh failed:', error);
    return false;
  }
}

// ===== Gmail API 호출 =====

/**
 * Gmail 사용자 정보 가져오기
 * @param {string} accessToken
 * @returns {Promise<{email: string}>}
 */
async function getGmailUserInfo(accessToken) {
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
 * 읽지 않은 이메일 목록 가져오기
 * @param {string} query - 검색 쿼리
 * @param {number} maxResults - 최대 결과 수
 * @returns {Promise<{count: number, messages: Array}>}
 */
async function getUnreadEmails(query = 'is:unread in:inbox', maxResults = 20) {
  try {
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (!gmail_connection?.accessToken) {
      return { count: 0, messages: [], error: 'Not connected' };
    }
    
    // 최신 이메일 우선으로 가져오기 (INBOX에서 읽지 않은 메일만)
    const finalQuery = query.includes('in:inbox') ? query : `${query} in:inbox`;
    
    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages?q=${encodeURIComponent(finalQuery)}&maxResults=${maxResults}`,
      {
        headers: {
          Authorization: `Bearer ${gmail_connection.accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gmail] API error ${response.status}:`, errorText);
      
      if (response.status === 401) {
        // 토큰 만료 - 갱신 시도
        const refreshed = await refreshGmailToken();
        if (refreshed) {
          return await getUnreadEmails(query, maxResults); // 재시도
        }
      }
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    const messages = data.messages || [];
    
    console.log(`[Gmail] Found ${messages.length} unread emails (estimate: ${data.resultSizeEstimate})`);
    
    return {
      count: data.resultSizeEstimate || messages.length,
      messages: messages
    };
    
  } catch (error) {
    console.error('Get unread emails failed:', error);
    return { count: 0, messages: [], error: error.message };
  }
}

/**
 * 이메일 상세 정보 가져오기
 * @param {string} messageId
 * @returns {Promise<{subject: string, from: string, date: string, snippet: string}>}
 */
async function getEmailDetails(messageId) {
  try {
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (!gmail_connection?.accessToken) {
      return null;
    }
    
    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      {
        headers: {
          Authorization: `Bearer ${gmail_connection.accessToken}`
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const data = await response.json();
    
    // 헤더에서 정보 추출
    const headers = data.payload?.headers || [];
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';
    
    return {
      id: data.id,
      subject: getHeader('Subject'),
      from: getHeader('From'),
      date: getHeader('Date'),
      snippet: data.snippet
    };
    
  } catch (error) {
    console.error('Get email details failed:', error);
    return null;
  }
}

/**
 * 새 이메일 체크 (읽지 않은 모든 메일)
 * @returns {Promise<{hasNew: boolean, count: number, emails: Array}>}
 */
async function checkNewEmails() {
  try {
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (!gmail_connection?.accessToken) {
      return { hasNew: false, count: 0, emails: [], error: 'Not connected' };
    }
    
    console.log('[Gmail] Checking for new emails...');
    
    // 토큰 유효성 확인 및 갱신
    const isValid = await validateGmailToken(gmail_connection.accessToken);
    if (!isValid) {
      const refreshed = await refreshGmailToken();
      if (!refreshed) {
        return { hasNew: false, count: 0, emails: [], error: 'Token expired' };
      }
    }
    
    // 읽지 않은 메일 가져오기 (INBOX만, 최신순)
    const { count, messages, error } = await getUnreadEmails('is:unread in:inbox newer_than:7d', 20);
    
    if (error) {
      return { hasNew: false, count: 0, emails: [], error };
    }
    
    console.log(`[Gmail] Total unread: ${messages.length}`);
    
    // 메시지 상세 정보 가져오기 (최대 20개)
    const emailDetails = [];
    for (const msg of messages.slice(0, 20)) {
      const details = await getEmailDetails(msg.id);
      if (details) {
        emailDetails.push(details);
      }
    }
    
    // 마지막 체크 시간 업데이트
    const updatedConnection = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    await chrome.storage.local.set({
      [GMAIL_STORAGE_KEY]: {
        ...updatedConnection.gmail_connection,
        lastCheck: new Date().toISOString()
      }
    });
    
    return {
      hasNew: messages.length > 0,
      count: messages.length,
      emails: emailDetails
    };
    
  } catch (error) {
    console.error('[Gmail] Check new emails failed:', error);
    return { hasNew: false, count: 0, emails: [], error: error.message };
  }
}

/**
 * 현재 메시지들을 "본 것"으로 표시 + Gmail에서 실제 읽음 처리
 * @param {boolean} markAsReadInGmail - Gmail에서 실제로 읽음 처리할지 여부
 * @returns {Promise<{success: boolean, markedCount: number}>}
 */
async function markEmailsAsSeen(markAsReadInGmail = true) {
  try {
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (!gmail_connection?.accessToken) {
      return { success: false, error: 'Not connected' };
    }
    
    // 현재 읽지 않은 메일 ID 가져오기 (INBOX만, 최근 7일)
    const { messages } = await getUnreadEmails('is:unread in:inbox newer_than:7d', 50);
    const currentIds = messages.map(msg => msg.id);
    
    console.log(`[Gmail] Found ${currentIds.length} unread emails to mark as read`);
    
    let markedCount = 0;
    let failedCount = 0;
    
    // Gmail에서 실제로 읽음 처리
    if (markAsReadInGmail && currentIds.length > 0) {
      console.log(`[Gmail] Marking ${currentIds.length} emails as read in Gmail...`);
      
      // 토큰 갱신 확인
      const isValid = await validateGmailToken(gmail_connection.accessToken);
      let token = gmail_connection.accessToken;
      
      if (!isValid) {
        console.log('[Gmail] Token invalid, attempting refresh...');
        const refreshed = await refreshGmailToken();
        if (refreshed) {
          const { gmail_connection: updated } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
          token = updated.accessToken;
          console.log('[Gmail] Token refreshed successfully');
        } else {
          console.error('[Gmail] Token refresh failed, cannot mark as read');
          return { success: false, error: 'Token refresh failed. Please reconnect Gmail.' };
        }
      }
      
      // 순차적으로 처리 (API rate limit 방지)
      for (const messageId of currentIds) {
        const success = await markEmailAsRead(token, messageId);
        if (success) {
          markedCount++;
        } else {
          failedCount++;
          // 첫 실패에서 403이면 권한 문제일 가능성 높음
          if (failedCount === 1) {
            console.log('[Gmail] First failure detected, may need to reconnect Gmail for new permissions');
          }
        }
        // 약간의 딜레이 추가 (rate limit 방지)
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      
      console.log(`[Gmail] Marked ${markedCount}/${currentIds.length} emails as read (${failedCount} failed)`);
      
      // 모두 실패했으면 에러 반환
      if (markedCount === 0 && failedCount > 0) {
        const lastError = getLastMarkAsReadError();
        let errorMsg = 'Failed to mark emails as read.';
        
        if (lastError?.status === 403) {
          errorMsg = '403 Forbidden: Gmail permission denied. Go to myaccount.google.com/permissions, remove "Catch Up Later", then reconnect.';
        } else if (lastError?.status === 401) {
          errorMsg = '401 Unauthorized: Token expired. Please reconnect Gmail.';
        }
        
        return { 
          success: false, 
          error: errorMsg,
          markedCount: 0,
          failedCount,
          apiError: lastError
        };
      }
    }
    
    // seenMessageIds 초기화 (Gmail에서 실제로 읽음 처리했으므로 더 이상 추적 불필요)
    const updatedConnection = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    await chrome.storage.local.set({
      [GMAIL_STORAGE_KEY]: {
        ...updatedConnection.gmail_connection,
        seenMessageIds: [], // 초기화
        lastMarkedRead: new Date().toISOString()
      }
    });
    
    return { success: true, markedCount, failedCount };
    
  } catch (error) {
    console.error('[Gmail] Mark emails as seen failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * 단일 이메일을 Gmail에서 읽음 처리
 * @param {string} accessToken
 * @param {string} messageId
 * @returns {Promise<boolean>}
 */
// 마지막 에러 저장 (디버깅용)
let lastMarkAsReadError = null;

async function markEmailAsRead(accessToken, messageId) {
  try {
    const response = await fetch(
      `${GMAIL_API_BASE}/users/me/messages/${messageId}/modify`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          removeLabelIds: ['UNREAD']
        })
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      lastMarkAsReadError = { status: response.status, error: errorText };
      console.error(`[Gmail] Failed to mark message ${messageId} as read:`, response.status, errorText);
      
      // 403 에러는 권한 문제
      if (response.status === 403) {
        console.error('[Gmail] 403 Forbidden - gmail.modify scope not granted.');
        console.error('[Gmail] Please go to https://myaccount.google.com/permissions and remove "Catch Up Later" access, then reconnect.');
      }
      return false;
    }
    
    console.log(`[Gmail] Successfully marked message ${messageId} as read`);
    return true;
  } catch (error) {
    lastMarkAsReadError = { status: 0, error: error.message };
    console.error(`[Gmail] Error marking message ${messageId} as read:`, error);
    return false;
  }
}

function getLastMarkAsReadError() {
  return lastMarkAsReadError;
}

/**
 * 여러 이메일을 한번에 읽음 처리 (Batch API)
 * @param {string[]} messageIds
 * @returns {Promise<{success: boolean, markedCount: number}>}
 */
async function batchMarkAsRead(messageIds) {
  try {
    const { gmail_connection } = await chrome.storage.local.get(GMAIL_STORAGE_KEY);
    
    if (!gmail_connection?.accessToken) {
      return { success: false, error: 'Not connected' };
    }
    
    let markedCount = 0;
    
    // 병렬로 처리 (최대 10개씩)
    const batchSize = 10;
    for (let i = 0; i < messageIds.length; i += batchSize) {
      const batch = messageIds.slice(i, i + batchSize);
      const results = await Promise.all(
        batch.map(id => markEmailAsRead(gmail_connection.accessToken, id))
      );
      markedCount += results.filter(r => r).length;
    }
    
    return { success: true, markedCount };
    
  } catch (error) {
    console.error('[Gmail] Batch mark as read failed:', error);
    return { success: false, error: error.message };
  }
}

// ===== 내보내기 =====

if (typeof self !== 'undefined') {
  self.GmailManager = {
    getGmailStatus,
    connectGmail,
    disconnectGmail,
    getUnreadEmails,
    getEmailDetails,
    checkNewEmails,
    markEmailsAsSeen,
    markEmailAsRead,
    batchMarkAsRead,
    getLastMarkAsReadError
  };
}
