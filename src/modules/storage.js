/**
 * 存储模块
 * 使用 Cloudflare Worker KV 存储数据
 */
class Storage {
  constructor(env) {
    this.env = env;
    this.data = env.MISSAV_DATA;      // 主数据存储
    this.subscriptions = env.SUBSCRIPTIONS;  // 订阅存储
    this.pushRecords = env.PUSH_RECORDS;     // 推送记录存储
    
    // 存储键前缀
    this.KEYS = {
      VIDEOS: 'videos:',
      VIDEO_CODE: 'video:code:',
      SUBSCRIPTIONS: 'subs:',
      PUSH_RECORD: 'push:',
      LAST_CRAWL_TIME: 'last_crawl_time',
      STATS: 'stats:'
    };
    
    // 视频缓存过期时间（24小时）
    this.VIDEO_TTL = 24 * 60 * 60;
    // 订阅永不过期
    this.NO_EXPIRY = null;
  }
  
  // ==================== 视频存储 ====================
  
  /**
   * 保存视频
   */
  async saveVideo(video) {
    const key = `${this.KEYS.VIDEO_CODE}${video.code.toUpperCase()}`;
    const videoData = JSON.stringify(video);
    
    await this.data.put(key, videoData, { expirationTtl: this.VIDEO_TTL });
    
    // 添加到视频列表（按时间排序）
    const timestamp = Date.now();
    const listKey = `${this.KEYS.VIDEOS}${timestamp}:${video.code}`;
    await this.data.put(listKey, videoData, { expirationTtl: this.VIDEO_TTL });
    
    return video;
  }
  
  /**
   * 根据番号获取视频
   */
  async getVideoByCode(code) {
    const key = `${this.KEYS.VIDEO_CODE}${code.toUpperCase()}`;
    const data = await this.data.get(key);
    return data ? JSON.parse(data) : null;
  }
  
  /**
   * 检查视频是否存在
   */
  async videoExists(code) {
    const key = `${this.KEYS.VIDEO_CODE}${code.toUpperCase()}`;
    return await this.data.get(key) !== null;
  }
  
  /**
   * 批量检查视频是否存在
   */
  async videosExist(codes) {
    const results = new Set();
    for (const code of codes) {
      if (await this.videoExists(code)) {
        results.add(code.toUpperCase());
      }
    }
    return results;
  }
  
  /**
   * 获取最新视频列表
   */
  async getLatestVideos(limit = 50) {
    const videos = [];
    const list = await this.data.list({ 
      prefix: this.KEYS.VIDEOS, 
      limit: limit * 2  // 多取一些以防重复
    });
    
    // 按时间倒序排序
    const sortedList = list.keys.sort((a, b) => b.name.localeCompare(a.name));
    
    for (const item of sortedList.slice(0, limit)) {
      const video = JSON.parse(item.value);
      videos.push(video);
    }
    
    return videos;
  }
  
  /**
   * 搜索视频
   */
  async searchVideos(keyword, limit = 20) {
    const videos = await this.getLatestVideos(100);
    const keywordLower = keyword.toLowerCase();
    
    return videos.filter(video => {
      if (video.code && video.code.toLowerCase().includes(keywordLower)) return true;
      if (video.title && video.title.toLowerCase().includes(keywordLower)) return true;
      if (video.actresses && video.actresses.toLowerCase().includes(keywordLower)) return true;
      if (video.tags && video.tags.toLowerCase().includes(keywordLower)) return true;
      return false;
    }).slice(0, limit);
  }
  
  // ==================== 订阅管理 ====================
  
  /**
   * 添加订阅
   */
  async addSubscription(subscription) {
    const key = `${this.KEYS.SUBSCRIPTIONS}${subscription.chatId}:${subscription.type}:${subscription.keyword || 'ALL'}`;
    const data = JSON.stringify(subscription);
    
    await this.subscriptions.put(key, data, { expirationTtl: this.NO_EXPIRY });
    return subscription;
  }
  
  /**
   * 移除订阅
   */
  async removeSubscription(chatId, type, keyword) {
    const key = `${this.KEYS.SUBSCRIPTIONS}${chatId}:${type}:${keyword || 'ALL'}`;
    await this.subscriptions.delete(key);
  }
  
  /**
   * 获取用户的所有订阅
   */
  async getSubscriptionsByChatId(chatId) {
    const subscriptions = [];
    const prefix = `${this.KEYS.SUBSCRIPTIONS}${chatId}:`;
    const list = await this.subscriptions.list({ prefix });
    
    for (const item of list.keys) {
      subscriptions.push(JSON.parse(item.value));
    }
    
    return subscriptions;
  }
  
  /**
   * 获取所有订阅
   */
  async getAllSubscriptions() {
    const subscriptions = [];
    const list = await this.subscriptions.list({ prefix: this.KEYS.SUBSCRIPTIONS });
    
    for (const item of list.keys) {
      subscriptions.push(JSON.parse(item.value));
    }
    
    return subscriptions;
  }
  
  /**
   * 检查订阅是否存在
   */
  async subscriptionExists(chatId, type, keyword) {
    const key = `${this.KEYS.SUBSCRIPTIONS}${chatId}:${type}:${keyword || 'ALL'}`;
    return await this.subscriptions.get(key) !== null;
  }
  
  /**
   * 取消用户的所有订阅
   */
  async removeAllSubscriptions(chatId) {
    const subscriptions = await this.getSubscriptionsByChatId(chatId);
    
    for (const sub of subscriptions) {
      await this.removeSubscription(sub.chatId, sub.type, sub.keyword);
    }
    
    return subscriptions.length;
  }
  
  // ==================== 推送记录 ====================
  
  /**
   * 记录推送
   */
  async recordPush(videoId, chatId, success, messageId = null) {
    const record = {
      videoId,
      chatId,
      success,
      messageId,
      timestamp: Date.now()
    };
    
    const key = `${this.KEYS.PUSH_RECORD}${videoId}:${chatId}`;
    await this.pushRecords.put(key, JSON.stringify(record));
    
    return record;
  }
  
  /**
   * 检查是否已推送
   */
  async isPushed(videoId, chatId) {
    const key = `${this.KEYS.PUSH_RECORD}${videoId}:${chatId}`;
    return await this.pushRecords.get(key) !== null;
  }
  
  /**
   * 获取视频已推送的聊天列表
   */
  async getPushedChatIds(videoId) {
    const chatIds = [];
    const prefix = `${this.KEYS.PUSH_RECORD}${videoId}:`;
    const list = await this.pushRecords.list({ prefix });
    
    for (const item of list.keys) {
      const record = JSON.parse(item.value);
      if (record.success) {
        chatIds.push(record.chatId);
      }
    }
    
    return chatIds;
  }
  
  // ==================== 统计信息 ====================
  
  /**
   * 获取统计信息
   */
  async getStats() {
    const statsKey = `${this.KEYS.STATS}total`;
    const statsData = await this.data.get(statsKey);
    
    if (statsData) {
      return JSON.parse(statsData);
    }
    
    return {
      totalVideos: 0,
      totalSubscriptions: 0,
      totalPushes: 0,
      lastCrawlTime: null
    };
  }
  
  /**
   * 更新统计信息
   */
  async updateStats(updates) {
    const stats = await this.getStats();
    Object.assign(stats, updates);
    
    const statsKey = `${this.KEYS.STATS}total`;
    await this.data.put(statsKey, JSON.stringify(stats));
    
    return stats;
  }
  
  /**
   * 获取最后爬取时间
   */
  async getLastCrawlTime() {
    return await this.data.get(this.KEYS.LAST_CRAWL_TIME);
  }
  
  /**
   * 设置最后爬取时间
   */
  async setLastCrawlTime() {
    await this.data.put(this.KEYS.LAST_CRAWL_TIME, Date.now().toString());
  }
}

module.exports = Storage;
