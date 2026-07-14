class RenderStorage {
  constructor(redis) {
    this.redis = redis;
    this.videoPrefix = 'video:';
    this.subscriptionPrefix = 'sub:';
  }

  async storeVideo(video) {
    const key = `${this.videoPrefix}${video.code}`;
    await this.redis.set(key, JSON.stringify(video), 'EX', 2592000);
  }

  async getStoredVideo(code) {
    const key = `${this.videoPrefix}${code}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async storeSubscription(chatId, subscription) {
    const key = `${this.subscriptionPrefix}${chatId}:${subscription.id || Date.now()}`;
    await this.redis.set(key, JSON.stringify(subscription));
  }

  async getSubscriptionsByChatId(chatId) {
    const pattern = `${this.subscriptionPrefix}${chatId}:*`;
    const keys = await this.redis.keys(pattern);
    const subscriptions = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      subscriptions.push(JSON.parse(data));
    }
    return subscriptions;
  }

  async getAllSubscriptions() {
    const pattern = `${this.subscriptionPrefix}*`;
    const keys = await this.redis.keys(pattern);
    const subscriptions = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      subscriptions.push(JSON.parse(data));
    }
    return subscriptions;
  }

  async deleteSubscription(chatId, subscriptionId) {
    const key = `${this.subscriptionPrefix}${chatId}:${subscriptionId}`;
    await this.redis.del(key);
  }

  async getLatestVideos(limit = 50) {
    const pattern = `${this.videoPrefix}*`;
    const keys = await this.redis.keys(pattern);
    const videos = [];
    for (const key of keys.slice(0, limit)) {
      const data = await this.redis.get(key);
      videos.push(JSON.parse(data));
    }
    return videos;
  }

  async searchVideos(keyword, limit = 10) {
    const pattern = `${this.videoPrefix}*`;
    const keys = await this.redis.keys(pattern);
    const results = [];
    for (const key of keys) {
      const data = await this.redis.get(key);
      const video = JSON.parse(data);
      if ((video.code && video.code.includes(keyword)) ||
          (video.title && video.title.includes(keyword)) ||
          (video.actresses && video.actresses.includes(keyword))) {
        results.push(video);
        if (results.length >= limit) break;
      }
    }
    return results;
  }

  async getStats() {
    try {
      const stats = await this.redis.get('stats');
      return stats ? JSON.parse(stats) : { totalVideos: 0, lastCrawlTime: 0 };
    } catch (error) {
      return { totalVideos: 0, lastCrawlTime: 0 };
    }
  }

  async updateStats(stats) {
    await this.redis.set('stats', JSON.stringify(stats));
  }
}

module.exports = RenderStorage;
