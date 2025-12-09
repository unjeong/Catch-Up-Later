// Catch Up Later - Google Drive Integration
// Google Drive API를 사용하여 새 공유 파일/변경 알림

// ===== 상수 =====
const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3';
const DRIVE_STORAGE_KEY = 'drive_connection';

// ===== Google Drive Manager =====
self.DriveManager = {
  
  /**
   * Google Drive 연결 상태 확인
   */
  async getDriveStatus() {
    try {
      console.log('[Drive] getDriveStatus called');
      const { drive_connection } = await chrome.storage.local.get(DRIVE_STORAGE_KEY);
      
      console.log('[Drive] drive_connection exists:', !!drive_connection);
      
      if (!drive_connection || !drive_connection.accessToken) {
        console.log('[Drive] No connection or no accessToken');
        return { connected: false };
      }
      
      console.log('[Drive] Has accessToken, email:', drive_connection.email);
      
      // 토큰 유효성 확인
      const isValid = await this.validateToken(drive_connection.accessToken);
      console.log('[Drive] Token valid:', isValid);
      
      if (!isValid) {
        // 토큰 갱신 시도
        console.log('[Drive] Trying to refresh token...');
        const refreshed = await this.refreshToken();
        console.log('[Drive] Token refreshed:', refreshed);
        if (!refreshed) {
          return { connected: false };
        }
      }
      
      console.log('[Drive] Returning connected: true');
      return {
        connected: true,
        email: drive_connection.email,
        lastCheck: drive_connection.lastCheck
      };
    } catch (error) {
      console.error('[Drive] Status check failed:', error);
      return { connected: false };
    }
  },

  /**
   * 토큰 유효성 확인
   */
  async validateToken(accessToken) {
    try {
      const response = await fetch(
        'https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken
      );
      return response.ok;
    } catch {
      return false;
    }
  },

  /**
   * Google Drive OAuth 연결
   * 주의: 이 함수는 토큰만 가져오고 연결 저장은 하지 않음
   * autoConnectGooglePlatforms()가 스코프에 따라 연결을 저장함
   */
  async connectDrive() {
    try {
      console.log('[Drive] Starting connection...');
      
      // 기존 캐시된 토큰 확인
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
        console.log('[Drive] Removing existing cached token...');
        await new Promise((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: existingToken }, resolve);
        });
        
        // 토큰 철회
        try {
          await fetch(`https://accounts.google.com/o/oauth2/revoke?token=${existingToken}`);
        } catch (e) {
          console.log('[Drive] Token revoke failed');
        }
      }
      
      // 모든 Google 플랫폼 연결 정보 클리어 (새로 선택하게)
      await chrome.storage.local.remove(['gmail_connection', 'youtube_connection', 'drive_connection']);
      console.log('[Drive] Cleared all Google platform connections');
      
      // 새 토큰 요청
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: true }, (token) => {
          if (chrome.runtime.lastError) {
            console.error('[Drive] getAuthToken error:', chrome.runtime.lastError.message);
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });
      
      if (!token) {
        return { success: false, error: 'Authentication failed' };
      }
      
      console.log('[Drive] Got token successfully');
      
      // 사용자 정보 가져오기
      const userInfo = await this.getUserInfo(token);
      
      console.log(`[Drive] User email: ${userInfo.email}`);
      
      // 토큰과 이메일 반환 - 연결 저장은 autoConnectGooglePlatforms에서 처리
      return { success: true, email: userInfo.email, token: token };
      
    } catch (error) {
      console.error('[Drive] Connection failed:', error);
      return { success: false, error: error.message || 'Connection failed' };
    }
  },

  /**
   * Google Drive 연결 해제
   */
  async disconnectDrive() {
    try {
      const { drive_connection } = await chrome.storage.local.get(DRIVE_STORAGE_KEY);
      
      if (drive_connection?.accessToken) {
        // Chrome 캐시에서 토큰 제거
        await new Promise((resolve) => {
          chrome.identity.removeCachedAuthToken({ token: drive_connection.accessToken }, resolve);
        });
      }
      
      // 저장된 연결 정보 삭제
      await chrome.storage.local.remove(DRIVE_STORAGE_KEY);
      
      console.log('[Drive] Disconnected');
      return { success: true };
      
    } catch (error) {
      console.error('[Drive] Disconnect failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 토큰 갱신
   */
  async refreshToken() {
    try {
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ interactive: false }, (token) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(token);
          }
        });
      });
      
      if (token) {
        const { drive_connection } = await chrome.storage.local.get(DRIVE_STORAGE_KEY);
        if (drive_connection) {
          drive_connection.accessToken = token;
          await chrome.storage.local.set({ [DRIVE_STORAGE_KEY]: drive_connection });
        }
        return true;
      }
      return false;
    } catch {
      return false;
    }
  },

  /**
   * 사용자 정보 가져오기
   */
  async getUserInfo(accessToken) {
    const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });
    
    if (!response.ok) {
      throw new Error('Failed to get user info');
    }
    
    return await response.json();
  },

  /**
   * 변경 추적용 시작 토큰 가져오기
   */
  async getStartPageToken(accessToken) {
    try {
      const response = await fetch(`${DRIVE_API_BASE}/changes/startPageToken`, {
        headers: { 'Authorization': `Bearer ${accessToken}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        return data.startPageToken;
      }
      return null;
    } catch (error) {
      console.error('[Drive] Failed to get start page token:', error);
      return null;
    }
  },

  /**
   * 새 공유 파일/변경사항 확인
   */
  async checkNewFiles() {
    try {
      const { drive_connection } = await chrome.storage.local.get(DRIVE_STORAGE_KEY);
      
      if (!drive_connection || !drive_connection.accessToken) {
        return { count: 0, items: [] };
      }
      
      const accessToken = drive_connection.accessToken;
      const seenFileIds = drive_connection.seenFileIds || [];
      
      // 최근 공유된 파일 확인 (나에게 공유된 파일)
      const sharedFiles = await this.getRecentSharedFiles(accessToken);
      
      // 새 파일 필터링
      const newFiles = sharedFiles.filter(file => !seenFileIds.includes(file.id));
      
      // 마지막 체크 시간 업데이트
      drive_connection.lastCheck = new Date().toISOString();
      await chrome.storage.local.set({ [DRIVE_STORAGE_KEY]: drive_connection });
      
      console.log(`[Drive] Found ${newFiles.length} new shared files`);
      
      return {
        count: newFiles.length,
        items: newFiles.slice(0, 20).map(file => ({
          id: file.id,
          name: file.name,
          mimeType: file.mimeType,
          sharedBy: file.sharingUser?.displayName || 'Unknown',
          sharedAt: file.sharedWithMeTime,
          webViewLink: file.webViewLink,
          iconLink: file.iconLink
        }))
      };
      
    } catch (error) {
      console.error('[Drive] Check failed:', error);
      return { count: 0, items: [] };
    }
  },

  /**
   * 최근 공유된 파일 가져오기
   */
  async getRecentSharedFiles(accessToken) {
    try {
      // 최근 7일 내 공유된 파일
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const dateQuery = sevenDaysAgo.toISOString();
      
      const query = encodeURIComponent(`sharedWithMe = true and sharedWithMeTime > '${dateQuery}'`);
      const fields = 'files(id,name,mimeType,webViewLink,iconLink,sharedWithMeTime,sharingUser)';
      
      const response = await fetch(
        `${DRIVE_API_BASE}/files?q=${query}&fields=${fields}&orderBy=sharedWithMeTime desc&pageSize=50`,
        {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        }
      );
      
      if (!response.ok) {
        console.error('[Drive] API error:', response.status);
        return [];
      }
      
      const data = await response.json();
      return data.files || [];
      
    } catch (error) {
      console.error('[Drive] Failed to get shared files:', error);
      return [];
    }
  },

  /**
   * 파일 본 것으로 표시
   */
  async markFilesAsSeen() {
    try {
      const { drive_connection } = await chrome.storage.local.get(DRIVE_STORAGE_KEY);
      
      if (!drive_connection) {
        return { success: false, error: 'Not connected' };
      }
      
      // 현재 새 파일 목록 가져오기
      const { items } = await this.checkNewFiles();
      
      // seen 목록에 추가
      const seenFileIds = drive_connection.seenFileIds || [];
      items.forEach(item => {
        if (!seenFileIds.includes(item.id)) {
          seenFileIds.push(item.id);
        }
      });
      
      // 최대 500개까지만 유지
      if (seenFileIds.length > 500) {
        seenFileIds.splice(0, seenFileIds.length - 500);
      }
      
      drive_connection.seenFileIds = seenFileIds;
      await chrome.storage.local.set({ [DRIVE_STORAGE_KEY]: drive_connection });
      
      console.log('[Drive] Marked files as seen');
      return { success: true };
      
    } catch (error) {
      console.error('[Drive] Mark as seen failed:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * 파일 타입에 따른 이모지 반환
   */
  getFileEmoji(mimeType) {
    if (!mimeType) return '📄';
    
    if (mimeType.includes('document')) return '📄';
    if (mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('presentation')) return '📽️';
    if (mimeType.includes('form')) return '📝';
    if (mimeType.includes('folder')) return '📁';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('video')) return '🎬';
    if (mimeType.includes('audio')) return '🎵';
    if (mimeType.includes('pdf')) return '📕';
    
    return '📄';
  }
};

console.log('[Drive] Module loaded');

