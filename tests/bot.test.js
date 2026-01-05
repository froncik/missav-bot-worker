/**
 * @jest-environment jsdom
 */

// Mock Cloudflare KV storage
const createMockKV = () => {
  const store = new Map();
  
  return {
    get: jest.fn((key) => store.get(key) || null),
    put: jest.fn((key, value, options) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    delete: jest.fn((key) => {
      store.delete(key);
      return Promise.resolve();
    }),
    list: jest.fn((options = {}) => {
      const keys = [];
      const prefix = options.prefix || '';
      
      for (const key of store.keys()) {
        if (key.startsWith(prefix)) {
          keys.push({
            name: key,
            expiration: options.expiration,
            metadata: options.metadata
          });
        }
      }
      
      return Promise.resolve({
        keys: keys.slice(0, options.limit || 100),
        list_complete: keys.length <= (options.limit || 100)
      });
    }),
    store  // 暴露 store 供测试使用
  };
};

// Mock environment
const createMockEnv = () => ({
  TELEGRAM_BOT_TOKEN: 'test-bot-token',
  TELEGRAM_BOT_USERNAME: 'TestBot',
  MISSAV_BASE_URL: 'https://missav.ai',
  MISSAV_CRAWL_INTERVAL: '900000',
  MISSAV_USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  
  // KV bindings
  MISSAV_DATA: createMockKV(),
  SUBSCRIPTIONS: createMockKV(),
  PUSH_RECORDS: createMockKV()
});

// Import modules
const Config = require('../../src/modules/config');
const Storage = require('../../src/modules/storage');
const SubscriptionManager = require('../../src/modules/subscriptionManager');

describe('MissAV Bot Worker Tests', () => {
  let mockEnv;
  let config;
  let storage;
  let subscriptionManager;
  
  beforeEach(() => {
    mockEnv = createMockEnv();
    config = new Config(mockEnv);
    storage = new Storage(mockEnv);
    subscriptionManager = new SubscriptionManager(storage);
    
    // Clear all mocks
    jest.clearAllMocks();
  });
  
  describe('Config', () => {
    test('should create config from environment', () => {
      expect(config.botToken).toBe('test-bot-token');
      expect(config.botUsername).toBe('TestBot');
      expect(config.missavBaseUrl).toBe('https://missav.ai');
    });
    
    test('should validate config', () => {
      expect(config.isValid()).toBe(true);
    });
    
    test('should generate correct API URL', () => {
      expect(config.getBotApiUrl('sendMessage')).toBe('https://api.telegram.org/bot/test-bot-token/sendMessage');
    });
  });
  
  describe('Storage', () => {
    test('should save and retrieve video', async () => {
      const video = {
        code: 'SSIS-001',
        title: 'Test Video',
        actresses: 'Test Actress',
        tags: 'Tag1, Tag2',
        coverUrl: 'https://example.com/cover.jpg',
        detailUrl: 'https://missav.ai/SSIS-001'
      };
      
      await storage.saveVideo(video);
      
      const retrieved = await storage.getVideoByCode('SSIS-001');
      expect(retrieved.code).toBe('SSIS-001');
      expect(retrieved.title).toBe('Test Video');
    });
    
    test('should check if video exists', async () => {
      const video = {
        code: 'SSIS-002',
        title: 'Test Video 2'
      };
      
      expect(await storage.videoExists('SSIS-002')).toBe(false);
      
      await storage.saveVideo(video);
      
      expect(await storage.videoExists('SSIS-002')).toBe(true);
    });
    
    test('should add and retrieve subscription', async () => {
      const subscription = {
        chatId: 12345,
        chatType: 'group',
        type: 'ALL',
        keyword: null,
        enabled: true
      };
      
      await storage.addSubscription(subscription);
      
      const subscriptions = await storage.getSubscriptionsByChatId(12345);
      expect(subscriptions.length).toBe(1);
      expect(subscriptions[0].type).toBe('ALL');
    });
    
    test('should record and check push status', async () => {
      expect(await storage.isPushed('SSIS-001', 12345)).toBe(false);
      
      await storage.recordPush('SSIS-001', 12345, true, 100);
      
      expect(await storage.isPushed('SSIS-001', 12345)).toBe(true);
    });
    
    test('should search videos', async () => {
      // Save test videos
      await storage.saveVideo({
        code: 'SSIS-001',
        title: '三上悠亚作品',
        actresses: '三上悠亚',
        tags: '高清,中文字幕'
      });
      
      await storage.saveVideo({
        code: 'SSIS-002',
        title: '桥本有菜作品',
        actresses: '桥本有菜',
        tags: '高清'
      });
      
      const results = await storage.searchVideos('三上悠亚', 10);
      expect(results.length).toBe(1);
      expect(results[0].code).toBe('SSIS-001');
    });
  });
  
  describe('SubscriptionManager', () => {
    test('should subscribe to ALL', async () => {
      const subscription = await subscriptionManager.subscribe(12345, 'group', 'ALL', null);
      
      expect(subscription.chatId).toBe(12345);
      expect(subscription.type).toBe('ALL');
    });
    
    test('should subscribe to ACTRESS', async () => {
      const subscription = await subscriptionManager.subscribe(12345, 'group', 'ACTRESS', '三上悠亚');
      
      expect(subscription.type).toBe('ACTRESS');
      expect(subscription.keyword).toBe('三上悠亚');
    });
    
    test('should unsubscribe all', async () => {
      await subscriptionManager.subscribe(12345, 'group', 'ALL', null);
      await subscriptionManager.subscribe(12345, 'group', 'ACTRESS', '三上悠亚');
      
      const count = await subscriptionManager.unsubscribeAll(12345);
      
      expect(count).toBe(2);
      
      const subscriptions = await subscriptionManager.getSubscriptionsByChatId(12345);
      expect(subscriptions.length).toBe(0);
    });
    
    test('should match subscription for ALL', () => {
      const subscription = { type: 'ALL' };
      const video = { code: 'SSIS-001' };
      
      expect(subscriptionManager.matchesSubscription(subscription, video)).toBe(true);
    });
    
    test('should match subscription for ACTRESS', () => {
      const subscription = { type: 'ACTRESS', keyword: '三上悠亚' };
      const video = { actresses: '三上悠亚, 桥本有菜' };
      
      expect(subscriptionManager.matchesSubscription(subscription, video)).toBe(true);
    });
    
    test('should not match subscription for ACTRESS if not found', () => {
      const subscription = { type: 'ACTRESS', keyword: '三上悠亚' };
      const video = { actresses: '桥本有菜, 明里つむぎ' };
      
      expect(subscriptionManager.matchesSubscription(subscription, video)).toBe(false);
    });
    
    test('should match subscription for TAG', () => {
      const subscription = { type: 'TAG', keyword: '中文字幕' };
      const video = { tags: '高清, 中文字幕, 无码' };
      
      expect(subscriptionManager.matchesSubscription(subscription, video)).toBe(true);
    });
  });
});
