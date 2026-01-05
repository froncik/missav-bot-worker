/**
 * 订阅管理模块
 * 负责处理用户订阅
 */
class SubscriptionManager {
  constructor(storage) {
    this.storage = storage;
  }
  
  /**
   * 订阅
   */
  async subscribe(chatId, chatType, type, keyword) {
    // 检查是否已存在
    const exists = await this.storage.subscriptionExists(chatId, type, keyword);
    
    if (exists) {
      console.log(`📋 Subscription already exists: chatId=${chatId}, type=${type}, keyword=${keyword}`);
      return await this.getSubscription(chatId, type, keyword);
    }
    
    const subscription = {
      id: `${chatId}_${type}_${keyword || 'ALL'}`,
      chatId: chatId,
      chatType: chatType,
      type: type,
      keyword: keyword || null,
      enabled: true,
      createdAt: Date.now()
    };
    
    await this.storage.addSubscription(subscription);
    console.log(`✅ Added subscription: chatId=${chatId}, type=${type}, keyword=${keyword}`);
    
    return subscription;
  }
  
  /**
   * 取消订阅
   */
  async unsubscribe(chatId, type, keyword) {
    await this.storage.removeSubscription(chatId, type, keyword);
    console.log(`✅ Removed subscription: chatId=${chatId}, type=${type}, keyword=${keyword}`);
  }
  
  /**
   * 取消全部订阅
   */
  async unsubscribeAll(chatId) {
    const count = await this.storage.removeAllSubscriptions(chatId);
    console.log(`✅ Removed all subscriptions: chatId=${chatId}, count=${count}`);
    return count;
  }
  
  /**
   * 获取用户订阅
   */
  async getSubscriptionsByChatId(chatId) {
    return await this.storage.getSubscriptionsByChatId(chatId);
  }
  
  /**
   * 获取单个订阅
   */
  async getSubscription(chatId, type, keyword) {
    const subscriptions = await this.storage.getSubscriptionsByChatId(chatId);
    return subscriptions.find(sub => sub.type === type && sub.keyword === keyword) || null;
  }
  
  /**
   * 获取所有订阅
   */
  async getAllSubscriptions() {
    return await this.storage.getAllSubscriptions();
  }
  
  /**
   * 检查视频是否匹配订阅
   */
  matchesSubscription(subscription, video) {
    // 全部订阅匹配所有视频
    if (subscription.type === 'ALL') {
      return true;
    }
    
    const keyword = subscription.keyword;
    
    // 演员订阅
    if (subscription.type === 'ACTRESS') {
      if (!video.actresses) return false;
      return video.actresses.toLowerCase().includes(keyword.toLowerCase());
    }
    
    // 标签订阅
    if (subscription.type === 'TAG') {
      if (!video.tags) return false;
      return video.tags.toLowerCase().includes(keyword.toLowerCase());
    }
    
    return false;
  }
  
  /**
   * 匹配视频的所有订阅者
   */
  async getMatchingSubscriptions(video, subscriptions) {
    return subscriptions.filter(sub => this.matchesSubscription(sub, video));
  }
  
  /**
   * 获取需要推送的聊天 ID
   */
  async getTargetChatIds(video, subscriptions) {
    const matchingSubs = await this.getMatchingSubscriptions(video, subscriptions);
    const chatIds = new Set();
    
    for (const sub of matchingSubs) {
      chatIds.add(sub.chatId);
    }
    
    return Array.from(chatIds);
  }
}

module.exports = SubscriptionManager;
