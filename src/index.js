/**
 * MissAV Bot Worker - Cloudflare Worker 版本
 * 支持 MissAV 和 JAVNinja 双爬虫
 * 
 * 功能：
 * - 自动抓取 MissAV 和 JAVNinja 最新视频
 * - Telegram 机器人订阅推送
 * - 定时任务执行
 * 
 * 作者: MissAV Bot
 * 版本: 2.0.0 (双爬虫版本)
 */

// 导入模块
const TelegramBot = require('./modules/telegramBot');
const MissavCrawler = require('./modules/missavCrawler');
const JAVNinjaCrawler = require('./modules/javninjaCrawler');
const SubscriptionManager = require('./modules/subscriptionManager');
const PushService = require('./modules/pushService');
const Storage = require('./modules/storage');
const Config = require('./modules/config');

/**
 * 主入口函数 - 处理所有传入请求
 */
async function handleRequest(request, env, ctx) {
  // 初始化配置
  const config = new Config(env);
  
  // 初始化存储
  const storage = new Storage(env);
  
  // 初始化爬虫（支持双爬虫）
  const missavCrawler = new MissavCrawler(config);
  const javninjaCrawler = new JAVNinjaCrawler(config);
  
  // 初始化各模块
  const subscriptionManager = new SubscriptionManager(storage);
  const pushService = new PushService(config, storage, missavCrawler, javninjaCrawler);
  const telegramBot = new TelegramBot(config, subscriptionManager, pushService, storage);
  
  try {
    // 检查是否为 Telegram Webhook
    const url = new URL(request.url);
    
    if (url.pathname === '/webhook' && request.method === 'POST') {
      // 处理 Telegram Webhook
      const update = await request.json();
      ctx.waitUntil(telegramBot.handleUpdate(update));
      return new Response('OK', { status: 200 });
    }
    
    if (url.pathname === '/cron' && request.method === 'GET') {
      // 手动触发爬取任务（用于测试）
      ctx.waitUntil(executeCrawlTask(config, storage, missavCrawler, javninjaCrawler, subscriptionManager, pushService));
      return new Response('Crawl task started', { status: 200 });
    }
    
    if (url.pathname === '/cron/missav' && request.method === 'GET') {
      // 只爬取 MissAV
      ctx.waitUntil(executeSingleCrawlTask(config, storage, missavCrawler, 'missav', subscriptionManager, pushService));
      return new Response('MissAV crawl task started', { status: 200 });
    }
    
    if (url.pathname === '/cron/javninja' && request.method === 'GET') {
      // 只爬取 JAVNinja
      ctx.waitUntil(executeSingleCrawlTask(config, storage, javninjaCrawler, 'javninja', subscriptionManager, pushService));
      return new Response('JAVNinja crawl task started', { status: 200 });
    }
    
    if (url.pathname === '/health' && request.method === 'GET') {
      // 健康检查
      const stats = await storage.getStats();
      return new Response(JSON.stringify({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        crawlers: ['missav', 'javninja'],
        stats: stats
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (url.pathname === '/' && request.method === 'GET') {
      // 返回使用说明
      return new Response(getHelpText(), {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }
    
    // 未知路由
    return new Response('Not Found', { status: 404 });
    
  } catch (error) {
    console.error('Request handling error:', error);
    return new Response(JSON.stringify({
      error: 'Internal Server Error',
      message: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * 执行双爬虫任务
 */
async function executeCrawlTask(config, storage, missavCrawler, javninjaCrawler, subscriptionManager, pushService) {
  console.log('🔄 Starting dual crawler task...');
  const startTime = Date.now();
  
  try {
    // 1. 并行爬取两个网站
    console.log('📥 Starting crawlers for both sites...');
    
    const [missavVideos, javninjaVideos] = await Promise.all([
      missavCrawler.crawlNewVideos(2).catch(err => {
        console.warn('❌ MissAV crawler failed:', err.message);
        return [];
      }),
      javninjaCrawler.crawlNewVideos(2).catch(err => {
        console.warn('❌ JAVNinja crawler failed:', err.message);
        return [];
      })
    ]);
    
    console.log(`📊 MissAV: ${missavVideos.length} videos, JAVNinja: ${javninjaVideos.length} videos`);
    
    // 2. 合并视频列表并去重
    const allVideos = [...missavVideos, ...javninjaVideos];
    console.log(`📊 Total videos before deduplication: ${allVideos.length}`);
    
    if (allVideos.length === 0) {
      console.log('📭 No videos found from both sources');
      return;
    }
    
    // 3. 保存并获取新增视频
    const newVideos = await pushService.saveAndGetNewVideos(allVideos);
    console.log(`🆕 Found ${newVideos.length} new videos`);
    
    if (newVideos.length === 0) {
      console.log('📭 All videos are duplicates');
      return;
    }
    
    // 4. 统计各来源的新视频
    const missavNew = newVideos.filter(v => v.source === 'missav');
    const javninjaNew = newVideos.filter(v => v.source === 'javninja');
    console.log(`📊 New videos - MissAV: ${missavNew.length}, JAVNinja: ${javninjaNew.length}`);
    
    // 5. 获取所有订阅者
    const subscriptions = await subscriptionManager.getAllSubscriptions();
    console.log(`👥 Found ${subscriptions.length} subscriptions`);
    
    // 6. 推送视频
    let successCount = 0;
    for (const video of newVideos) {
      const pushed = await pushService.pushVideoToSubscribers(video, subscriptions);
      if (pushed) successCount++;
      
      // 避免推送过快
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ Task completed in ${duration}ms, pushed ${successCount} videos`);
    
    // 7. 更新统计
    const stats = await storage.getStats();
    stats.totalVideos = (stats.totalVideos || 0) + newVideos.length;
    stats.lastCrawlTime = Date.now();
    await storage.updateStats(stats);
    
  } catch (error) {
    console.error('❌ Crawl task failed:', error);
    throw error;
  }
}

/**
 * 执行单爬虫任务
 */
async function executeSingleCrawlTask(config, storage, crawler, sourceName, subscriptionManager, pushService) {
  console.log(`🔄 Starting ${sourceName} crawler task...`);
  const startTime = Date.now();
  
  try {
    // 1. 爬取指定网站
    const videos = await crawler.crawlNewVideos(2);
    console.log(`📊 ${sourceName}: ${videos.length} videos`);
    
    if (videos.length === 0) {
      console.log(`📭 No videos found from ${sourceName}`);
      return;
    }
    
    // 2. 标记来源
    videos.forEach(v => v.source = sourceName);
    
    // 3. 保存并获取新增视频
    const newVideos = await pushService.saveAndGetNewVideos(videos);
    console.log(`🆕 ${sourceName}: ${newVideos.length} new videos`);
    
    if (newVideos.length === 0) {
      console.log(`📭 ${sourceName}: All videos are duplicates`);
      return;
    }
    
    // 4. 获取所有订阅者
    const subscriptions = await subscriptionManager.getAllSubscriptions();
    console.log(`👥 Found ${subscriptions.length} subscriptions`);
    
    // 5. 推送视频
    let successCount = 0;
    for (const video of newVideos) {
      const pushed = await pushService.pushVideoToSubscribers(video, subscriptions);
      if (pushed) successCount++;
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    const duration = Date.now() - startTime;
    console.log(`✅ ${sourceName} task completed in ${duration}ms, pushed ${successCount} videos`);
    
  } catch (error) {
    console.error(`❌ ${sourceName} crawl task failed:`, error);
    throw error;
  }
}

/**
 * 返回帮助文本
 */
function getHelpText() {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>MissAV Bot Worker v2.0</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: #f5f5f5;
    }
    h1 { color: #333; }
    .info {
      background: white;
      padding: 20px;
      border-radius: 8px;
      margin: 20px 0;
    }
    code {
      background: #e8e8e8;
      padding: 2px 6px;
      border-radius: 4px;
    }
    pre {
      background: #2d2d2d;
      color: #f8f8f2;
      padding: 15px;
      border-radius: 8px;
      overflow-x: auto;
    }
    .feature {
      display: flex;
      align-items: center;
      margin: 10px 0;
    }
    .feature-icon {
      font-size: 24px;
      margin-right: 10px;
    }
  </style>
</head>
<body>
  <h1>🤖 MissAV Bot Worker v2.0</h1>
  
  <div class="info">
    <h2>🎯 双爬虫版本</h2>
    <p>支持同时抓取 MissAV 和 JAVNinja 两个网站的视频！</p>
    <div class="feature">
      <span class="feature-icon">🎬</span>
      <span>MissAV (missav.ai)</span>
    </div>
    <div class="feature">
      <span class="feature-icon">🎥</span>
      <span>JAVNinja (javninja.com)</span>
    </div>
  </div>
  
  <div class="info">
    <h2>状态信息</h2>
    <p>✅ 服务运行正常</p>
    <p>📅 启动时间: ${new Date().toLocaleString('zh-CN')}</p>
    <p>📝 版本: 2.0.0</p>
  </div>
  
  <div class="info">
    <h2>使用说明</h2>
    <p>这是一个基于 Cloudflare Worker 的 Telegram 机器人，支持同时抓取 MissAV 和 JAVNinja 两个网站的最新视频。</p>
    
    <h3>支持的命令：</h3>
    <ul>
      <li><code>/subscribe</code> - 订阅全部新片（两个网站）</li>
      <li><code>/subscribe 演员名</code> - 订阅指定演员</li>
      <li><code>/subscribe #标签</code> - 订阅指定标签</li>
      <li><code>/unsubscribe</code> - 取消全部订阅</li>
      <li><code>/list</code> - 查看订阅列表</li>
      <li><code>/search 关键词</code> - 搜索视频（两个网站）</li>
      <li><code>/latest</code> - 查看最新视频</li>
      <li><code>/help</code> - 查看帮助</li>
    </ul>
  </div>
  
  <div class="info">
    <h2>配置说明</h2>
    <p>需要在 wrangler.toml 中配置以下环境变量：</p>
    <ul>
      <li><code>TELEGRAM_BOT_TOKEN</code> - Telegram Bot Token</li>
      <li><code>MISSAV_CRAWL_INTERVAL</code> - 爬取间隔（毫秒）</li>
      <li><code>JAVNJINJA_BASE_URL</code> - JAVNinja 网站地址（可选）</li>
    </ul>
  </div>
  
  <div class="info">
    <h2>API 端点</h2>
    <ul>
      <li><code>/webhook</code> - Telegram Webhook</li>
      <li><code>/cron</code> - 触发双爬虫任务</li>
      <li><code>/cron/missav</code> - 只爬取 MissAV</li>
      <li><code>/cron/javninja</code> - 只爬取 JAVNinja</li>
      <li><code>/health</code> - 健康检查</li>
    </ul>
  </div>
</body>
</html>
  `;
}

// 导出 Worker 处理器
module.exports = {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  }
};
