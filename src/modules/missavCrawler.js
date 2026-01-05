/**
 * MissAV 爬虫模块
 * 负责抓取 MissAV 网站视频信息
 */
class MissavCrawler {
  constructor(config) {
    this.config = config;
    
    // 正则表达式
    this.codePattern = /([A-Z]+-\d+)/gi;
    this.durationPattern = /(\d+)\s*分/;
    
    // HTTP 请求头
    this.headers = {
      'User-Agent': this.config.userAgent,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': this.config.missavBaseUrl,
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Cache-Control': 'max-age=0'
    };
  }
  
  /**
   * 抓取最新视频列表
   */
  async crawlNewVideos(pages = 1) {
    const videos = [];
    
    for (let page = 1; page <= pages; page++) {
      try {
        const url = page === 1 
          ? `${this.config.missavBaseUrl}/new`
          : `${this.config.missavBaseUrl}/new?page=${page}`;
        
        console.log(`📥 Crawling page ${page}: ${url}`);
        
        const html = await this.fetchHtml(url);
        
        if (!html) {
          console.warn(`❌ Failed to fetch page ${page}`);
          continue;
        }
        
        const pageVideos = this.parseVideoList(html);
        videos.push(...pageVideos);
        
        console.log(`✅ Page ${page}: Found ${pageVideos.length} videos`);
        
        // 避免请求过快
        if (page < pages) {
          await this.sleep(2000);
        }
        
      } catch (error) {
        console.error(`❌ Error crawling page ${page}:`, error);
      }
    }
    
    console.log(`📊 Total crawled ${videos.length} videos`);
    return videos;
  }
  
  /**
   * 抓取单个视频详情
   */
  async crawlVideoDetail(detailUrl) {
    try {
      console.log(`📥 Crawling video detail: ${detailUrl}`);
      
      const html = await this.fetchHtml(detailUrl);
      
      if (!html) {
        console.warn(`❌ Failed to fetch video detail`);
        return null;
      }
      
      return this.parseVideoDetail(html, detailUrl);
      
    } catch (error) {
      console.error(`❌ Error crawling video detail:`, error);
      return null;
    }
  }
  
  /**
   * 按演员抓取作品
   */
  async crawlByActor(actorName, limit = 20) {
    const videos = [];
    let page = 1;
    const maxPages = Math.ceil(limit / 12) + 1;
    
    try {
      const encodedName = encodeURIComponent(actorName);
      
      while (page <= maxPages && videos.length < limit) {
        const url = page === 1
          ? `${this.config.missavBaseUrl}/actresses/${encodedName}`
          : `${this.config.missavBaseUrl}/actresses/${encodedName}?page=${page}`;
        
        console.log(`📥 Crawling actor "${actorName}" page ${page}: ${url}`);
        
        const html = await this.fetchHtml(url);
        
        if (!html) {
          console.warn(`❌ Failed to fetch actor page ${page}`);
          break;
        }
        
        const pageVideos = this.parseVideoList(html);
        
        if (pageVideos.length === 0) {
          break;
        }
        
        videos.push(...pageVideos);
        console.log(`✅ Page ${page}: Found ${pageVideos.length} videos`);
        
        if (videos.length >= limit) {
          break;
        }
        
        page++;
        await this.sleep(2000);
      }
      
      console.log(`📊 Actor "${actorName}": Total ${videos.length} videos`);
      return videos.slice(0, limit);
      
    } catch (error) {
      console.error(`❌ Error crawling actor "${actorName}":`, error);
      return videos;
    }
  }
  
  /**
   * 按番号抓取视频
   */
  async crawlByCode(code) {
    try {
      const url = `${this.config.missavBaseUrl}/${code.toUpperCase()}`;
      console.log(`📥 Crawling code "${code}": ${url}`);
      
      const html = await this.fetchHtml(url);
      
      if (!html) {
        console.warn(`❌ Failed to fetch code "${code}"`);
        return null;
      }
      
      const video = this.parseVideoDetail(html, url);
      
      if (video) {
        video.code = code.toUpperCase();
      }
      
      return video;
      
    } catch (error) {
      console.error(`❌ Error crawling code "${code}":`, error);
      return null;
    }
  }
  
  /**
   * 按关键词搜索
   */
  async crawlByKeyword(keyword, limit = 20) {
    const videos = [];
    let page = 1;
    const maxPages = Math.ceil(limit / 12) + 1;
    
    try {
      const encodedKeyword = encodeURIComponent(keyword);
      
      while (page <= maxPages && videos.length < limit) {
        const url = page === 1
          ? `${this.config.missavBaseUrl}/search/${encodedKeyword}`
          : `${this.config.missavBaseUrl}/search/${encodedKeyword}?page=${page}`;
        
        console.log(`📥 Searching "${keyword}" page ${page}: ${url}`);
        
        const html = await this.fetchHtml(url);
        
        if (!html) {
          console.warn(`❌ Failed to search page ${page}`);
          break;
        }
        
        const pageVideos = this.parseVideoList(html);
        
        if (pageVideos.length === 0) {
          break;
        }
        
        videos.push(...pageVideos);
        console.log(`✅ Page ${page}: Found ${pageVideos.length} videos`);
        
        if (videos.length >= limit) {
          break;
        }
        
        page++;
        await this.sleep(2000);
      }
      
      console.log(`📊 Search "${keyword}": Total ${videos.length} videos`);
      return videos.slice(0, limit);
      
    } catch (error) {
      console.error(`❌ Error searching "${keyword}":`, error);
      return videos;
    }
  }
  
  /**
   * 获取 HTML 内容
   */
  async fetchHtml(url) {
    // 添加随机延迟
    await this.sleep(1000 + Math.random() * 2000);
    
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.headers,
        redirect: 'follow'
      });
      
      console.log(`🌐 HTTP ${response.status}: ${url}`);
      
      if (!response.ok) {
        console.warn(`❌ HTTP ${response.status}: ${url}`);
        return null;
      }
      
      return await response.text();
      
    } catch (error) {
      console.error(`❌ Fetch error: ${url}`, error);
      return null;
    }
  }
  
  /**
   * 解析视频列表 HTML
   */
  parseVideoList(html) {
    const videos = [];
    
    // 尝试从 script 标签提取 JSON 数据
    const jsonVideos = this.extractVideosFromJson(html);
    if (jsonVideos.length > 0) {
      console.log(`📦 Extracted ${jsonVideos.length} videos from JSON`);
      return jsonVideos;
    }
    
    // HTML 解析
    // 尝试多种选择器
    const selectors = [
      'div.video-card',
      'article.video',
      'div[class*="thumbnail"]',
      'div.group',
      'a[href*="/"]'
    ];
    
    let videoCards = [];
    
    for (const selector of selectors) {
      const regex = new RegExp(`<div[^>]*class="[^"]*video[^"]*"[^>]*>.*?</div>`, 'gi');
      // 简化的 HTML 解析，实际应使用 DOM 解析器
      
      if (videoCards.length === 0) {
        // 使用正则提取链接
        const linkRegex = /<a\s+href="([^"]*\/[A-Z]+-\d+[^"]*)"[^>]*>/gi;
        const matches = html.matchAll(linkRegex);
        
        for (const match of matches) {
          const detailUrl = match[1];
          const code = this.extractCode(detailUrl);
          
          if (code) {
            videoCards.push({
              detailUrl: detailUrl.startsWith('http') ? detailUrl : `${this.config.missavBaseUrl}${detailUrl}`,
              code: code
            });
          }
        }
      }
      
      if (videoCards.length > 0) {
        break;
      }
    }
    
    // 提取封面图
    for (const card of videoCards) {
      const video = {
        code: card.code,
        detailUrl: card.detailUrl,
        title: this.extractTitleFromUrl(card.detailUrl) || card.code,
        coverUrl: this.extractCoverFromHtml(html, card.code),
        crawledAt: Date.now()
      };
      
      if (video.code) {
        videos.push(video);
      }
    }
    
    console.log(`📊 Parsed ${videos.length} videos from HTML`);
    return videos;
  }
  
  /**
   * 解析视频详情 HTML
   */
  parseVideoDetail(html, detailUrl) {
    const video = {
      detailUrl: detailUrl,
      crawledAt: Date.now()
    };
    
    // 提取番号
    const code = this.extractCode(detailUrl) || this.extractCode(html);
    if (code) {
      video.code = code.toUpperCase();
    }
    
    // 提取标题
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (titleMatch) {
      video.title = titleMatch[1].trim();
    }
    
    // 提取演员
    const actressRegex = /<a[^>]*href="[^"]*actress[^"]*"[^>]*>([^<]+)<\/a>/gi;
    const actresses = [];
    let match;
    
    while ((match = actressRegex.exec(html)) !== null) {
      const actress = match[1].trim();
      if (actress && !actresses.includes(actress)) {
        actresses.push(actress);
      }
    }
    
    if (actresses.length > 0) {
      video.actresses = actresses.join(', ');
    }
    
    // 提取标签
    const tagRegex = /<a[^>]*href="[^"]*tag[^"]*"[^>]*>([^<]+)<\/a>/gi;
    const tags = [];
    
    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1].trim();
      if (tag && !tags.includes(tag)) {
        tags.push(tag);
      }
    }
    
    if (tags.length > 0) {
      video.tags = tags.join(', ');
    }
    
    // 提取封面图
    const coverMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i);
    if (coverMatch) {
      video.coverUrl = coverMatch[1];
    } else {
      const imgMatch = html.match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"[^>]*>/i);
      if (imgMatch) {
        video.coverUrl = imgMatch[1];
      }
    }
    
    // 提取预览视频
    const videoMatch = html.match(/<video[^>]*data-src="([^"]+\.mp4[^"]*)"[^>]*>/i);
    if (videoMatch) {
      video.previewUrl = videoMatch[1];
    }
    
    // 提取时长
    const durationMatch = html.match(/(\d+)\s*分钟/);
    if (durationMatch) {
      video.duration = parseInt(durationMatch[1]);
    }
    
    return video;
  }
  
  /**
   * 从 JSON 提取视频数据
   */
  extractVideosFromJson(html) {
    const videos = [];
    
    // 查找 script 标签中的视频数据
    const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/gi;
    
    let match;
    while ((match = scriptRegex.exec(html)) !== null) {
      const scriptContent = match[1];
      
      // 检查是否包含视频数据
      if (scriptContent.includes('dvd_id') || scriptContent.includes('uuid')) {
        // 提取 JSON 数据
        const jsonRegex = /window\.(\w+)\s*=\s*(\{[\s\S]*?\});?$/gm;
        let jsonMatch;
        
        while ((jsonMatch = jsonRegex.exec(scriptContent)) !== null) {
          try {
            const data = JSON.parse(jsonMatch[2]);
            const videoData = Array.isArray(data) ? data : [data];
            
            for (const item of videoData) {
              if (item.dvd_id || item.uuid) {
                videos.push({
                  code: (item.dvd_id || item.uuid).toUpperCase(),
                  detailUrl: `${this.config.missavBaseUrl}/${item.dvd_id || item.uuid}`,
                  title: item.title || item.dvd_id || item.uuid,
                  coverUrl: item.cover || item.image,
                  crawledAt: Date.now()
                });
              }
            }
          } catch (e) {
            // JSON 解析失败，忽略
          }
        }
      }
    }
    
    return videos;
  }
  
  /**
   * 从文本中提取番号
   */
  extractCode(text) {
    if (!text) return null;
    
    const match = this.codePattern.exec(text);
    this.codePattern.lastIndex = 0; // 重置正则
    
    return match ? match[1].toUpperCase() : null;
  }
  
  /**
   * 从 URL 提取番号
   */
  extractCodeFromUrl(url) {
    if (!url) return null;
    
    const parts = url.split('/');
    const lastPart = parts[parts.length - 1];
    
    return this.extractCode(lastPart);
  }
  
  /**
   * 从 URL 提取标题
   */
  extractTitleFromUrl(url) {
    if (!url) return null;
    
    const code = this.extractCodeFromUrl(url);
    return code || null;
  }
  
  /**
   * 从 HTML 中提取封面图
   */
  extractCoverFromHtml(html, code) {
    // 查找包含番号的图片
    const imgRegex = new RegExp(`<img[^>]*src="([^"]*${code}[^"]*)"[^>]*>`, 'i');
    const match = imgRegex.exec(html);
    
    if (match) {
      return match[1];
    }
    
    // 查找 og:image
    const ogImageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i);
    if (ogImageMatch) {
      return ogImageMatch[1];
    }
    
    return null;
  }
  
  /**
   * 延迟
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = MissavCrawler;
