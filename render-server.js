require('dotenv').config();
const express = require('express');
const Redis = require('ioredis');
const cron = require('node-cron');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Initialize Redis
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('✅ Redis connected'));
redis.on('error', (err) => console.error('❌ Redis error:', err));

// Import modules
const Config = require('./src/modules/config');
const MissavCrawler = require('./src/modules/missavCrawler');
const JAVNinjaCrawler = require('./src/modules/javninjaCrawler');
const TelegramBot = require('./src/modules/telegramBot');
const RenderStorage = require('./src/modules/renderStorage');
const SubscriptionManager = require('./src/modules/subscriptionManager');
const PushService = require('./src/modules/pushService');

// Initialize
const config = new Config(process.env);
const storage = new RenderStorage(redis);
const missavCrawler = new MissavCrawler(config);
const javninjaCrawler = new JAVNinjaCrawler(config);
const subscriptionManager = new SubscriptionManager(storage);
const pushService = new PushService(config, storage, missavCrawler, javninjaCrawler);
const telegramBot = new TelegramBot(config, subscriptionManager, pushService, storage);

// Telegram Webhook
app.post('/webhook', async (req, res) => {
  try {
    const update = req.body;
    await telegramBot.handleUpdate(update);
    res.json({ ok: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ ok: false, error: error.message });
  }
});

// Cron endpoints
app.get('/cron', async (req, res) => {
  try {
    await executeDualCrawl();
    res.json({ status: 'Crawl started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/health', async (req, res) => {
  try {
    const stats = await storage.getStats();
    res.json({ status: 'ok', stats });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/', (req, res) => {
  res.send('<h1>🤖 MissAV Bot Running</h1><p>Render deployment successful!</p>');
});

// Crawl logic
async function executeDualCrawl() {
  console.log('🔄 Starting dual crawler...');
  try {
    const [missavVideos, javninjaVideos] = await Promise.all([
      missavCrawler.crawlNewVideos(2).catch(e => {
        console.warn('MissAV failed:', e.message);
        return [];
      }),
      javninjaCrawler.crawlNewVideos(2).catch(e => {
        console.warn('JAVNinja failed:', e.message);
        return [];
      })
    ]);

    const allVideos = [...missavVideos, ...javninjaVideos];
    if (allVideos.length === 0) {
      console.log('No videos found');
      return;
    }

    const newVideos = await pushService.saveAndGetNewVideos(allVideos);
    if (newVideos.length === 0) return;

    const subscriptions = await subscriptionManager.getAllSubscriptions();
    let count = 0;
    for (const video of newVideos) {
      const pushed = await pushService.pushVideoToSubscribers(video, subscriptions);
      if (pushed) count++;
      await new Promise(r => setTimeout(r, 1000));
    }

    console.log(`✅ Pushed ${count} videos`);
    const stats = await storage.getStats();
    stats.totalVideos = (stats.totalVideos || 0) + newVideos.length;
    stats.lastCrawlTime = Date.now();
    await storage.updateStats(stats);

  } catch (error) {
    console.error('Crawl error:', error);
  }
}

// Cron job (every 15 minutes)
cron.schedule('*/15 * * * *', executeDualCrawl);

// Start server
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 Bot running on port ${port}`);
});
