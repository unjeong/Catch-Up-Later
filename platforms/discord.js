// Catch Up Later - Discord Integration
// Discord Bot Token으로 알림 확인

// ===== 상수 =====
const DISCORD_API_BASE = 'https://discord.com/api/v10';
const DISCORD_STORAGE_KEY = 'discord_connection';

// ===== Discord 연결 상태 =====

/**
 * Discord 연결 상태 확인
 */
async function getDiscordStatus() {
  try {
    const { discord_connection } = await chrome.storage.local.get(DISCORD_STORAGE_KEY);
    
    if (!discord_connection || !discord_connection.botToken) {
      return { connected: false };
    }
    
    // 토큰 유효성 확인
    const isValid = await validateDiscordToken(discord_connection.botToken);
    
    if (!isValid) {
      return { connected: false };
    }
    
    return {
      connected: true,
      username: discord_connection.username,
      lastCheck: discord_connection.lastCheck
    };
  } catch (error) {
    console.error('Discord status check failed:', error);
    return { connected: false };
  }
}

/**
 * Discord 토큰 유효성 확인
 */
async function validateDiscordToken(botToken) {
  try {
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        'Authorization': `Bot ${botToken}`
      }
    });
    return response.ok;
  } catch {
    return false;
  }
}

// ===== Discord 연결 =====

/**
 * Discord Bot Token으로 연결
 * Bot 생성: https://discord.com/developers/applications
 */
async function connectDiscord(botToken) {
  try {
    if (!botToken || botToken.trim() === '') {
      return { success: false, error: 'Bot Token is required' };
    }
    
    // Bot 정보 가져오기
    const response = await fetch(`${DISCORD_API_BASE}/users/@me`, {
      headers: {
        'Authorization': `Bot ${botToken}`
      }
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, error: 'Invalid Bot Token' };
      }
      return { success: false, error: `API error: ${response.status}` };
    }
    
    const user = await response.json();
    
    // 연결 정보 저장
    await chrome.storage.local.set({
      [DISCORD_STORAGE_KEY]: {
        botToken: botToken,
        username: user.username,
        odiscriminator: user.discriminator,
        avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null,
        connectedAt: new Date().toISOString(),
        lastCheck: null,
        seenMessageIds: [],
        watchedChannels: []
      }
    });
    
    console.log(`[Discord] Connected as ${user.username}`);
    
    return { success: true, username: user.username };
    
  } catch (error) {
    console.error('Discord connection failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Discord 연결 해제
 */
async function disconnectDiscord() {
  try {
    await chrome.storage.local.remove(DISCORD_STORAGE_KEY);
    return { success: true };
  } catch (error) {
    console.error('Discord disconnect failed:', error);
    return { success: false, error: error.message };
  }
}

// ===== Discord API 호출 =====

/**
 * Bot이 참여한 서버(길드) 목록 가져오기
 */
async function getGuilds() {
  try {
    const { discord_connection } = await chrome.storage.local.get(DISCORD_STORAGE_KEY);
    
    if (!discord_connection?.botToken) {
      return { guilds: [], error: 'Not connected' };
    }
    
    const response = await fetch(`${DISCORD_API_BASE}/users/@me/guilds`, {
      headers: {
        'Authorization': `Bot ${discord_connection.botToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const guilds = await response.json();
    
    return {
      guilds: guilds.map(g => ({
        id: g.id,
        name: g.name,
        icon: g.icon ? `https://cdn.discordapp.com/icons/${g.id}/${g.icon}.png` : null
      }))
    };
    
  } catch (error) {
    console.error('Get Discord guilds failed:', error);
    return { guilds: [], error: error.message };
  }
}

/**
 * 채널의 최근 메시지 가져오기
 */
async function getChannelMessages(channelId, limit = 25) {
  try {
    const { discord_connection } = await chrome.storage.local.get(DISCORD_STORAGE_KEY);
    
    if (!discord_connection?.botToken) {
      return { messages: [], error: 'Not connected' };
    }
    
    const response = await fetch(`${DISCORD_API_BASE}/channels/${channelId}/messages?limit=${limit}`, {
      headers: {
        'Authorization': `Bot ${discord_connection.botToken}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const messages = await response.json();
    
    return {
      messages: messages.map(m => ({
        id: m.id,
        content: m.content?.substring(0, 100) || '',
        author: m.author.username,
        channelId: m.channel_id,
        timestamp: m.timestamp,
        url: `https://discord.com/channels/@me/${m.channel_id}/${m.id}`
      }))
    };
    
  } catch (error) {
    console.error('Get Discord messages failed:', error);
    return { messages: [], error: error.message };
  }
}

/**
 * 새 알림 체크 (DM 및 멘션)
 */
async function checkNewNotifications() {
  try {
    const { discord_connection } = await chrome.storage.local.get(DISCORD_STORAGE_KEY);
    
    if (!discord_connection?.botToken) {
      return { hasNew: false, count: 0, items: [], error: 'Not connected' };
    }
    
    console.log('[Discord] Checking for new messages...');
    
    // Bot의 DM 채널 가져오기 (제한적 - Bot은 DM 목록을 직접 가져올 수 없음)
    // 대신 서버 목록과 채널 확인
    const { guilds } = await getGuilds();
    
    const seenIds = new Set(discord_connection.seenMessageIds || []);
    const newItems = [];
    
    // 각 서버에서 Bot이 접근 가능한 채널의 최근 메시지 확인 (첫 2개 서버만)
    for (const guild of guilds.slice(0, 2)) {
      try {
        // 서버의 채널 목록
        const channelsResponse = await fetch(`${DISCORD_API_BASE}/guilds/${guild.id}/channels`, {
          headers: {
            'Authorization': `Bot ${discord_connection.botToken}`
          }
        });
        
        if (!channelsResponse.ok) continue;
        
        const channels = await channelsResponse.json();
        
        // 텍스트 채널만 (type 0)
        const textChannels = channels.filter(c => c.type === 0).slice(0, 2);
        
        for (const channel of textChannels) {
          const { messages } = await getChannelMessages(channel.id, 5);
          
          for (const msg of messages) {
            if (!seenIds.has(msg.id)) {
              newItems.push({
                ...msg,
                guildName: guild.name,
                channelName: channel.name
              });
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to check guild ${guild.name}:`, e);
      }
    }
    
    console.log(`[Discord] Found ${newItems.length} new messages`);
    
    // 마지막 체크 시간 업데이트
    await chrome.storage.local.set({
      [DISCORD_STORAGE_KEY]: {
        ...discord_connection,
        lastCheck: new Date().toISOString()
      }
    });
    
    return {
      hasNew: newItems.length > 0,
      count: newItems.length,
      items: newItems.slice(0, 20)
    };
    
  } catch (error) {
    console.error('[Discord] Check new notifications failed:', error);
    return { hasNew: false, count: 0, items: [], error: error.message };
  }
}

/**
 * 알림을 "본 것"으로 표시
 */
async function markNotificationsAsSeen() {
  try {
    const { discord_connection } = await chrome.storage.local.get(DISCORD_STORAGE_KEY);
    
    if (!discord_connection?.botToken) {
      return { success: false, error: 'Not connected' };
    }
    
    // 현재 메시지들을 seen으로 저장
    const result = await checkNewNotifications();
    const currentIds = result.items.map(i => i.id);
    
    const existingSeenIds = discord_connection.seenMessageIds || [];
    const allSeenIds = [...new Set([...existingSeenIds, ...currentIds])].slice(-500);
    
    await chrome.storage.local.set({
      [DISCORD_STORAGE_KEY]: {
        ...discord_connection,
        seenMessageIds: allSeenIds
      }
    });
    
    console.log(`[Discord] Marked ${currentIds.length} messages as seen`);
    
    return { success: true };
    
  } catch (error) {
    console.error('[Discord] Mark notifications as seen failed:', error);
    return { success: false, error: error.message };
  }
}

// ===== 내보내기 =====

if (typeof self !== 'undefined') {
  self.DiscordManager = {
    getDiscordStatus,
    connectDiscord,
    disconnectDiscord,
    getGuilds,
    getChannelMessages,
    checkNewNotifications,
    markNotificationsAsSeen
  };
}

