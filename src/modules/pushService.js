/**
 * 推送服务模块
 * 负责推送视频到 Telegram
 * 支持 MissAV 和 JAVNinja 双来源
 */
class PushService {
  constructor(config, storage, missavCrawler, javninjaCrawler) {
    this.config = config;
    this.storage = storage;
    this.missavCrawler = missavCrawler;
    this.javninjaCrawler = javninjaCrawler;
    this.telegram = null; // 将在初始化时设置
  }
  
  /**
   * 设置 Telegram 实例
   */
  setTelegram(telegram) {
    this.telegram = telegram;
  }
  
  /**
   * 保存视频并获取新增的视频
   * 支持 MissAV 和 JAVNinja 双来源
   */
  async saveAndGetNewVideos(videos) {
    const newVideos = [];
    const invalidCount = 0;
    const duplicateCount = 0;
    
    // 过滤无效视频
    const validVideos = videos.filter(video => {
      if (!video.code) {
        console.log(`⚠️ Skipping video without code: ${video.title || 'Unknown'}`);
        return false;
      }
      // 确保有来源标识
      if (!video.source) {
        video.source = 'missav'; // 默认来源
      }
      return true;
    });
    
    if (validVideos.length === 0) {
      console.log('📭 No valid videos to process');
      return [];
    }
    
    // 批量检查重复（按番号去重）
    const codes = validVideos.map(v => v.code.toUpperCase());
    const existingCodes = await this.storage.videosExist(codes);
    console.log(`📊 Checking ${codes.length} videos, ${existingCodes.size} already exist`);
    
    // 过滤出新视频
    for (const video of validVideos) {
      const code = video.code.toUpperCase();
      
      if (existingCodes.has(code)) {
        console.log(`⏭️ Video already exists: ${code} (${video.source})`);
        continue;
      }
      
      // 补充详情信息（如果需要）
      if (video.detailUrl && (!video.actresses || !video.previewUrl)) {
        try {
          const detail = await this.crawlVideoDetail(video);
          if (detail) {
            video = { ...video, ...detail };
          }
          await this.sleep(200);
        } catch (error) {
          console.warn(`⚠️ Failed to get detail for ${code}:`, error.message);
        }
      }
      
      video.pushed = false;
      await this.storage.saveVideo(video);
      newVideos.push(video);
      console.log(`✅ New video saved: ${code} - ${video.title || 'Unknown'} (${video.source})`);
    }
    
    console.log(`📊 Videos saved: ${newVideos.length} new, ${validVideos.length - newVideos.length} duplicates, ${invalidCount} invalid`);
    
    return newVideos;
  }
  
  /**
   * 补充视频详情
   */
  async crawlVideoDetail(video) {
    const crawler = video.source === 'javninja' ? this.javninjaCrawler : this.missavCrawler;
    const detail = await crawler.crawlVideoDetail(video.detailUrl);
    return detail;
  }
  
  /**
   * 推送视频到订阅者
   */
  async pushVideoToSubscribers(video, subscriptions) {
    // 获取需要推送的聊天 ID
    const targetChatIds = await this.storage.getPushedChatIds(video.code);
    const allChatIds = await this.getTargetChatIds(video, subscriptions);
    
    // 过滤掉已推送的
    const pendingChatIds = allChatIds.filter(id => !targetChatIds.includes(id));
    
    if (pendingChatIds.length === 0) {
      console.log(`📭 Video ${video.code} (${video.source}) already pushed to all subscribers`);
      return false;
    }
    
    console.log(`📤 Pushing video ${video.code} (${video.source}) to ${pendingChatIds.length} subscribers`);
    
    let successCount = 0;
    
    for (const chatId of pendingChatIds) {
      const success = await this.pushVideoToChat(video, chatId);
      
      if (success) {
        successCount++;
      }
      
      // 避免推送过快
      await this.sleep(100);
    }
    
    console.log(`✅ Video ${video.code} (${video.source}) pushed to ${successCount}/${pendingChatIds.length} subscribers`);
    
    return successCount > 0;
  }
  
  /**
   * 推送视频到指定聊天
   */
  async pushVideoToChat(video, chatId) {
    try {
      let success = false;
      
      // 优先发送预览视频
      if (video.previewUrl) {
        success = await this.sendVideo(chatId, video.previewUrl, video.coverUrl, video);
      }
      
      // 其次发送封面图
      if (!success && video.coverUrl) {
        success = await this.sendPhoto(chatId, video.coverUrl, video);
      }
      
      // 最后发送纯文本
      if (!success) {
        await this.sendText(chatId, video);
        success = true;
      }
      
      // 记录推送
      await this.storage.recordPush(video.code, chatId, success);
      
      return success;
      
    } catch (error) {
      console.error(`❌ Failed to push video ${video.code} to ${chatId}:`, error);
      await this.storage.recordPush(video.code, chatId, false);
      return false;
    }
  }
  
  /**
   * 发送视频消息
   */
  async sendVideo(chatId, videoUrl, thumbUrl, video) {
    const caption = this.formatVideoMessage(video);
    
    try {
      await this.telegram.sendVideo(chatId, videoUrl, caption);
      console.log(`✅ Video sent: ${video.code} (${video.source}) -> ${chatId}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Failed to send video, trying photo: ${error.message}`);
      return false;
    }
  }
  
  /**
   * 发送图片消息
   */
  async sendPhoto(chatId, photoUrl, video) {
    const caption = this.formatVideoMessage(video);
    
    try {
      await this.telegram.sendPhotoWithCaption(chatId, photoUrl, caption);
      console.log(`✅ Photo sent: ${video.code} (${video.source}) -> ${chatId}`);
      return true;
    } catch (error) {
      console.warn(`⚠️ Failed to send photo, sending text: ${error.message}`);
      await this.sendText(chatId, video);
      return true;
    }
  }
  
  /**
   * 发送文本消息
   */
  async sendText(chatId, video) {
    const caption = this.formatVideoMessage(video);
    await this.telegram.sendMarkdown(chatId, caption);
    console.log(`✅ Text sent: ${video.code} (${video.source}) -> ${chatId}`);
    return true;
  }
  
  /**
   * 格式化视频消息
   * 支持 MissAV 和 JAVNinja 双来源
   */
  formatVideoMessage(video) {
    let text = `🎬 *新片上架*`;
    
    // 添加来源标识
    if (video.source === 'javninja') {
      text += ` (JAVNinja)`;
    } else {
      text += ` (MissAV)`;
    }
    
    text += `\n\n`;
    text += `📌 番号: \`${this.escapeMarkdown(video.code)}\`\n`;
    
    if (video.actresses) {
      text += `👩 演员: ${this.escapeMarkdown(video.actresses)}\n`;
    }
    
    if (video.tags) {
      text += `🏷️ 标签: ${this.formatTags(video.tags)}\n`;
    }
    
    if (video.duration) {
      text += `⏱️ 时长: ${video.duration} 分钟\n`;
    }
    
    text += `\n🔗 [查看详情](${video.detailUrl})`;
    
    return text;
  }
  
  /**
   * 转义 Markdown
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/]/g, '\\]')
      .replace(/`/g, '\\`');
  }
  
  /**
   * 格式化标签
   */
  formatTags(tags) {
    if (!tags) return '';
    return tags.split(',').map(t => `#${t.trim()}`).join(' ');
  }
  
  /**
   * 获取目标聊天 ID
   */
  async getTargetChatIds(video, subscriptions) {
    const targetChatIds = new Set();
    
    for (const sub of subscriptions) {
      if (this.matchesSubscription(sub, video)) {
        targetChatIds.add(sub.chatId);
      }
    }
    
    return Array.from(targetChatIds);
  }
  
  /**
   * 检查是否匹配订阅
   */
  matchesSubscription(subscription, video) {
    if (subscription.type === 'ALL') {
      return true;
    }
    
    const keyword = subscription.keyword;
    
    if (subscription.type === 'ACTRESS') {
      if (!video.actresses) return false;
      return video.actresses.toLowerCase().includes(keyword.toLowerCase());
    }
    
    if (subscription.type === 'TAG') {
      if (!video.tags) return false;
      return video.tags.toLowerCase().includes(keyword.toLowerCase());
    }
    
    return false;
  }
  
  /**
   * 延迟
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = PushService;
