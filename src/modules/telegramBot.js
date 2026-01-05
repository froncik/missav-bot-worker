/**
 * Telegram Bot 模块
 * 负责处理 Telegram 消息和命令
 */
class TelegramBot {
  constructor(config, subscriptionManager, pushService, storage) {
    this.config = config;
    this.subscriptionManager = subscriptionManager;
    this.pushService = pushService;
    this.storage = storage;
    
    // 命令列表
    this.commands = [
      { command: 'start', description: '开始使用' },
      { command: 'help', description: '查看帮助' },
      { command: 'subscribe', description: '订阅新片' },
      { command: 'unsubscribe', description: '取消订阅' },
      { command: 'list', description: '我的订阅' },
      { command: 'latest', description: '最新视频' },
      { command: 'search', description: '搜索视频' }
    ];
  }
  
  /**
   * 处理 Telegram Update
   */
  async handleUpdate(update) {
    try {
      if (!update.message || !update.message.text) {
        return;
      }
      
      const message = update.message;
      const text = message.text.trim();
      const chatId = message.chat.id;
      const chatType = message.chat.type;
      
      // 忽略非命令消息
      if (!text.startsWith('/')) {
        return;
      }
      
      // 解析命令
      const parts = text.split(/\s+/);
      const command = parts[0].toLowerCase().replace(`@${this.config.botUsername.toLowerCase()}`, '');
      const args = parts.slice(1).join(' ').trim();
      
      console.log(`📨 Received command: ${command} from chatId=${chatId}`);
      
      // 自动为新群组创建订阅
      if ((chatType === 'group' || chatType === 'supergroup') && 
          command !== 'subscribe' && command !== 'unsubscribe') {
        await this.autoSubscribeNewGroup(chatId, chatType, message.chat.title);
      }
      
      // 处理命令
      await this.executeCommand(chatId, chatType, command, args);
      
    } catch (error) {
      console.error('Error handling update:', error);
      await this.sendMessage(chatId, '❌ 处理失败: ' + error.message);
    }
  }
  
  /**
   * 自动订阅新群组
   */
  async autoSubscribeNewGroup(chatId, chatType, title) {
    const existingSubs = await this.subscriptionManager.getSubscriptionsByChatId(chatId);
    
    if (existingSubs.length === 0) {
      await this.subscriptionManager.subscribe(chatId, chatType, 'ALL', null);
      console.log(`✅ Auto-subscribed new group: ${title} (${chatId})`);
    }
  }
  
  /**
   * 执行命令
   */
  async executeCommand(chatId, chatType, command, args) {
    switch (command) {
      case '/start':
      case '/help':
        await this.sendHelp(chatId);
        break;
        
      case '/subscribe':
        await this.handleSubscribe(chatId, chatType, args);
        break;
        
      case '/unsubscribe':
        await this.handleUnsubscribe(chatId, args);
        break;
        
      case '/list':
        await this.handleList(chatId);
        break;
        
      case '/search':
        await this.handleSearch(chatId, args);
        break;
        
      case '/latest':
        await this.handleLatest(chatId, args);
        break;
        
      default:
        await this.sendMessage(chatId, '❓ 未知命令，输入 /help 查看帮助');
    }
  }
  
  /**
   * 发送帮助信息
   */
  async sendHelp(chatId) {
    const helpText = `
🎬 *MissAV 机器人*

📌 *订阅命令*
/subscribe - 订阅全部新片
/subscribe 演员名 - 订阅指定演员
/subscribe #标签 - 订阅指定标签

📌 *管理命令*
/unsubscribe - 取消全部订阅
/unsubscribe 演员名 - 取消演员订阅
/list - 查看我的订阅

📌 *查询命令*
/search 关键词 - 搜索视频
/latest - 查看最新视频

💡 有新视频时会自动推送到本群
    `.trim();
    
    await this.sendMarkdown(chatId, helpText);
  }
  
  /**
   * 处理订阅命令
   */
  async handleSubscribe(chatId, chatType, args) {
    if (!args) {
      // 订阅全部
      await this.subscriptionManager.subscribe(chatId, chatType, 'ALL', null);
      await this.sendMessage(chatId, '✅ 已订阅全部新片，有新视频会自动推送');
    } else if (args.startsWith('#')) {
      // 订阅标签
      const tag = args.substring(1).trim();
      await this.subscriptionManager.subscribe(chatId, chatType, 'TAG', tag);
      await this.sendMessage(chatId, `✅ 已订阅标签: #${tag}`);
    } else {
      // 订阅演员
      await this.subscriptionManager.subscribe(chatId, chatType, 'ACTRESS', args);
      await this.sendMessage(chatId, `✅ 已订阅演员: ${args}`);
    }
  }
  
  /**
   * 处理取消订阅命令
   */
  async handleUnsubscribe(chatId, args) {
    if (!args) {
      const count = await this.subscriptionManager.unsubscribeAll(chatId);
      await this.sendMessage(chatId, `✅ 已取消全部订阅 (${count} 个)`);
    } else if (args.startsWith('#')) {
      const tag = args.substring(1).trim();
      await this.subscriptionManager.unsubscribe(chatId, 'TAG', tag);
      await this.sendMessage(chatId, `✅ 已取消标签订阅: #${tag}`);
    } else {
      await this.subscriptionManager.unsubscribe(chatId, 'ACTRESS', args);
      await this.sendMessage(chatId, `✅ 已取消演员订阅: ${args}`);
    }
  }
  
  /**
   * 查看订阅列表
   */
  async handleList(chatId) {
    const subscriptions = await this.subscriptionManager.getSubscriptionsByChatId(chatId);
    
    if (subscriptions.length === 0) {
      await this.sendMessage(chatId, '📭 暂无订阅，使用 /subscribe 添加订阅');
      return;
    }
    
    let text = `📋 *当前订阅列表* (共 ${subscriptions.length} 个)\n\n`;
    
    for (const sub of subscriptions) {
      switch (sub.type) {
        case 'ALL':
          text += '• 全部新片\n';
          break;
        case 'ACTRESS':
          text += `• 演员: ${sub.keyword}\n`;
          break;
        case 'TAG':
          text += `• 标签: #${sub.keyword}\n`;
          break;
      }
    }
    
    text += '\n💡 使用 /unsubscribe 取消订阅';
    
    await this.sendMarkdown(chatId, text);
  }
  
  /**
   * 搜索视频
   */
  async handleSearch(chatId, keyword) {
    if (!keyword) {
      await this.sendMessage(chatId, '请输入搜索关键词，例如: /search SSIS');
      return;
    }
    
    const videos = await this.storage.searchVideos(keyword, 10);
    
    if (videos.length === 0) {
      await this.sendMessage(chatId, '🔍 未找到相关视频');
      return;
    }
    
    let text = `🔍 *搜索结果* (${videos.length} 个)\n\n`;
    
    for (const video of videos.slice(0, 10)) {
      const title = this.truncateTitle(video.title, 30);
      text += `• \`${video.code}\` - ${title}\n`;
    }
    
    await this.sendMarkdown(chatId, text);
  }
  
  /**
   * 查看最新视频
   */
  async handleLatest(chatId, args) {
    const page = Math.max(1, parseInt(args) || 1);
    const pageSize = 5;
    
    const videos = await this.storage.getLatestVideos(50);
    
    if (videos.length === 0) {
      await this.sendMessage(chatId, '暂无视频');
      return;
    }
    
    const totalPages = Math.ceil(videos.length / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, videos.length);
    
    if (startIndex >= videos.length) {
      await this.sendMessage(chatId, `❌ 页码超出范围，共 ${totalPages} 页`);
      return;
    }
    
    await this.sendMessage(chatId, `📺 最新视频 (第 ${page}/${totalPages} 页):`);
    
    for (let i = startIndex; i < endIndex; i++) {
      const video = videos[i];
      const caption = this.formatVideoMessage(video);
      
      if (video.coverUrl) {
        await this.sendPhotoWithCaption(chatId, video.coverUrl, caption);
      } else {
        await this.sendMarkdown(chatId, caption);
      }
      
      // 避免发送过快
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    if (page < totalPages) {
      await this.sendMessage(chatId, `💡 查看下一页: /latest ${page + 1}`);
    }
  }
  
  /**
   * 发送文本消息
   */
  async sendMessage(chatId, text) {
    return this.sendRequest('sendMessage', {
      chat_id: chatId,
      text: text
    });
  }
  
  /**
   * 发送 Markdown 格式消息
   */
  async sendMarkdown(chatId, text) {
    return this.sendRequest('sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
  }
  
  /**
   * 发送带封面的图片
   */
  async sendPhotoWithCaption(chatId, photoUrl, caption) {
    return this.sendRequest('sendPhoto', {
      chat_id: chatId,
      photo: photoUrl,
      caption: caption,
      parse_mode: 'Markdown'
    });
  }
  
  /**
   * 发送视频
   */
  async sendVideo(chatId, videoUrl, caption) {
    return this.sendRequest('sendVideo', {
      chat_id: chatId,
      video: videoUrl,
      caption: caption,
      parse_mode: 'Markdown'
    });
  }
  
  /**
   * 格式化视频消息
   */
  formatVideoMessage(video) {
    let text = `🎬 *新片上架*\n\n`;
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
   * 转义 Markdown 特殊字符
   */
  escapeMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
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
   * 截断标题
   */
  truncateTitle(title, maxLength) {
    if (!title) return '';
    return title.length <= maxLength ? title : title.substring(0, maxLength) + '...';
  }
  
  /**
   * 发送 API 请求
   */
  async sendRequest(method, data) {
    const url = this.config.getBotApiUrl(method);
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });
      
      const result = await response.json();
      
      if (!result.ok) {
        console.error(`Telegram API error: ${result.description}`);
      }
      
      return result;
      
    } catch (error) {
      console.error(`Error calling Telegram API ${method}:`, error);
      throw error;
    }
  }
  
  /**
   * 设置命令菜单
   */
  async setCommands() {
    return this.sendRequest('setMyCommands', {
      commands: this.commands
    });
  }
}

module.exports = TelegramBot;
