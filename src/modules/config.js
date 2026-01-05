/**
 * 配置管理模块
 * 负责从环境变量读取配置
 * 支持 MissAV 和 JAVNinja 双爬虫配置
 */
class Config {
  constructor(env) {
    this.env = env;
    
    // Telegram 配置
    this.botToken = env.TELEGRAM_BOT_TOKEN || '';
    this.botUsername = env.TELEGRAM_BOT_USERNAME || 'MissavBot';
    this.apiUrl = env.TELEGRAM_API_URL || 'https://api.telegram.org/bot';
    
    // MissAV 配置
    this.missavBaseUrl = env.MISSAV_BASE_URL || 'https://missav.ai';
    this.missavEnabled = env.MISSAV_ENABLED !== 'false';
    
    // JAVNinja 配置
    this.javninjaBaseUrl = env.JAVNJINJA_BASE_URL || 'https://javninja.com';
    this.javninjaEnabled = env.JAVNJINJA_ENABLED !== 'false';
    
    // 通用爬虫配置
    this.userAgent = env.MISSAV_USER_AGENT || 
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    
    // 爬虫配置
    this.crawlEnabled = env.CRAWLER_ENABLED !== 'false';
    this.crawlInterval = parseInt(env.MISSAV_CRAWL_INTERVAL) || 900000; // 默认15分钟
    this.initialPages = parseInt(env.CRAWLER_INITIAL_PAGES) || 2;
    
    // 代理配置
    this.proxyEnabled = env.TELEGRAM_PROXY_ENABLED === 'true';
    this.proxyHost = env.TELEGRAM_PROXY_HOST || '127.0.0.1';
    this.proxyPort = parseInt(env.TELEGRAM_PROXY_PORT) || 7890;
    
    // 日志级别
    this.logLevel = env.LOG_LEVEL || 'INFO';
  }
  
  /**
   * 验证配置是否完整
   */
  isValid() {
    return this.botToken && this.botToken.length > 0;
  }
  
  /**
   * 获取完整的 Bot API URL
   */
  getBotApiUrl(method) {
    return `${this.apiUrl}${this.botToken}/${method}`;
  }
  
  /**
   * 获取 MissAV URL
   */
  getMissavUrl(path) {
    return `${this.missavBaseUrl}${path}`;
  }
  
  /**
   * 获取 JAVNinja URL
   */
  getJavninjaUrl(path) {
    return `${this.javninjaBaseUrl}${path}`;
  }
  
  /**
   * 获取所有启用的爬虫
   */
  getEnabledCrawlers() {
    const crawlers = [];
    
    if (this.missavEnabled) {
      crawlers.push({
        name: 'missav',
        baseUrl: this.missavBaseUrl,
        source: 'missav'
      });
    }
    
    if (this.javninjaEnabled) {
      crawlers.push({
        name: 'javninja',
        baseUrl: this.javninjaBaseUrl,
        source: 'javninja'
      });
    }
    
    return crawlers;
  }
  
  /**
   * 检查是否启用了任何爬虫
   */
  hasEnabledCrawler() {
    return this.missavEnabled || this.javninjaEnabled;
  }
}

module.exports = Config;
