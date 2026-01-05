/**
 * JAVNinja 爬虫模块
 * 负责抓取 JAVNinja 网站视频信息
 * 作为 MissAV 的替补爬虫
 */
class JAVNinjaCrawler {
  constructor(config) {
    this.config = config;
    
    // JAVNinja 配置
    this.baseUrl = config.JAVNJINJA_BASE_URL || 'https://javninja.com';
    
    // 正则表达式
    this.codePattern = /([A-Z]+-\d+)/gi;
    this.durationPattern = /(\d+)\s*(min|minute|minutes)/i;
    
    // HTTP 请求头
    this.headers = {
      'User-Agent': config.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': this.baseUrl,
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
          ? `${this.baseUrl}`
          : `${this.baseUrl}/page/${page}`;
        
        console.log(`📥 [JAVNinja] Crawling page ${page}: ${url}`);
        
        const html = await this.fetchHtml(url);
        
        if (!html) {
          console.warn(`❌ [JAVNinja] Failed to fetch page ${page}`);
          continue;
        }
        
        const pageVideos = this.parseVideoList(html);
        videos.push(...pageVideos);
        
        console.log(`✅ [JAVNinja] Page ${page}: Found ${pageVideos.length} videos`);
        
        // 避免请求过快
        if (page < pages) {
          await this.sleep(2000);
        }
        
      } catch (error) {
        console.error(`❌ [JAVNinja] Error crawling page ${page}:`, error);
      }
    }
    
    console.log(`📊 [JAVNinja] Total crawled ${videos.length} videos`);
    return videos;
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
        const url = `${this.baseUrl}/actress/${encodedName}${page > 1 ? `/page/${page}` : ''}`;
        
        console.log(`📥 [JAVNinja] Crawling actor "${actorName}" page ${page}: ${url}`);
        
        const html = await this.fetchHtml(url);
        
        if (!html) {
          console.warn(`❌ [JAVNinja] Failed to fetch actor page ${page}`);
          break;
        }
        
        const pageVideos = this.parseVideoList(html);
        
        if (pageVideos.length === 0) {
          break;
        }
        
        videos.push(...pageVideos);
        console.log(`✅ [JAVNinja] Page ${page}: Found ${pageVideos.length} videos`);
        
        if (videos.length >= limit) {
          break;
        }
        
        page++;
        await this.sleep(2000);
      }
      
      console.log(`📊 [JAVNinja] Actor "${actorName}": Total ${videos.length} videos`);
      return videos.slice(0, limit);
      
    } catch (error) {
      console.error(`❌ [JAVNinja] Error crawling actor "${actorName}":`, error);
      return videos;
    }
  }
  
  /**
   * 按番号抓取视频
   */
  async crawlByCode(code) {
    try {
      // JAVNinja 可能有多种番号格式
      const url = `${this.baseUrl}/video/${code.toUpperCase()}`;
      console.log(`📥 [JAVNinja] Crawling code "${code}": ${url}`);
      
      const html = await this.fetchHtml(url);
      
      if (!html) {
        console.warn(`❌ [JAVNinja] Failed to fetch code "${code}"`);
        return null;
      }
      
      const video = this.parseVideoDetail(html, url);
      
      if (video) {
        video.code = code.toUpperCase();
        video.source = 'javninja';
      }
      
      return video;
      
    } catch (error) {
      console.error(`❌ [JAVNinja] Error crawling code "${code}":`, error);
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
        const url = `${this.baseUrl}/search/${encodedKeyword}${page > 1 ? `/page/${page}` : ''}`;
        
        console.log(`📥 [JAVNinja] Searching "${keyword}" page ${page}: ${url}`);
        
        const html = await this.fetchHtml(url);
        
        if (!html) {
          console.warn(`❌ [JAVNinja] Failed to search page ${page}`);
          break;
        }
        
        const pageVideos = this.parseVideoList(html);
        
        if (pageVideos.length === 0) {
          break;
        }
        
        videos.push(...pageVideos);
        console.log(`✅ [JAVNinja] Page ${page}: Found ${pageVideos.length} videos`);
        
        if (videos.length >= limit) {
          break;
        }
        
        page++;
        await this.sleep(2000);
      }
      
      console.log(`📊 [JAVNinja] Search "${keyword}": Total ${videos.length} videos`);
      return videos.slice(0, limit);
      
    } catch (error) {
      console.error(`❌ [JAVNinja] Error searching "${keyword}":`, error);
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
      
      console.log(`🌐 [JAVNinja] HTTP ${response.status}: ${url}`);
      
      if (!response.ok) {
        console.warn(`❌ [JAVNinja] HTTP ${response.status}: ${url}`);
        return null;
      }
      
      return await response.text();
      
    } catch (error) {
      console.error(`❌ [JAVNinja] Fetch error: ${url}`, error);
      return null;
    }
  }
  
  /**
   * 解析视频列表 HTML
   */
  parseVideoList(html) {
    const videos = [];
    
    // 尝试多种选择器模式
    const patterns = [
      // 模式1: article 标签
      {
        container: 'article.video-item, article.post',
        link: 'a[href]',
        title: 'h3.title, h2.title, .title',
        image: 'img[src]',
        code: 'a[href*="/video/"]'
      },
      // 模式2: div 卡片
      {
        container: 'div.video-card, div.post-item',
        link: 'a[href]',
        title: '.video-title, .title',
        image: 'img[data-src], img[data-lazy]',
        code: 'a[href]'
      },
      // 模式3: 通用链接模式
      {
        container: null,
        link: 'a[href*="/video/"]',
        title: null,
        image: null,
        code: 'a[href]'
      }
    ];
    
    for (const pattern of patterns) {
      const videoCards = pattern.container 
        ? html.match(new RegExp(`<${pattern.container}[^>]*>[\s\S]*?</${pattern.container}>`, 'gi')) || []
        : [];
      
      if (videoCards.length === 0 && pattern.container === null) {
        // 使用正则提取链接
        const linkRegex = /<a\s+href="([^"]*\/(?:video|movie)\/[^"]*\/[A-Z]+-\d+[^"]*)"[^>]*>/gi;
        const matches = [...html.matchAll(linkRegex)];
        
        for (const match of matches) {
          const detailUrl = match[1];
          const code = this.extractCode(detailUrl);
          
          if (code) {
            videos.push({
              code: code.toUpperCase(),
              detailUrl: detailUrl.startsWith('http') ? detailUrl : `${this.baseUrl}${detailUrl}`,
              title: this.extractTitleFromUrl(detailUrl) || code,
              source: 'javninja',
              crawledAt: Date.now()
            });
          }
        }
      }
      
      if (videos.length > 0) {
        break;
      }
    }
    
    // 如果正则解析失败，尝试从 script 提取 JSON
    if (videos.length === 0) {
      const jsonVideos = this.extractVideosFromJson(html);
      if (jsonVideos.length > 0) {
        console.log(`📦 [JAVNinja] Extracted ${jsonVideos.length} videos from JSON`);
        return jsonVideos;
      }
    }
    
    console.log(`📊 [JAVNinja] Parsed ${videos.length} videos from HTML`);
    return videos;
  }
  
  /**
   * 解析视频详情 HTML
   */
  parseVideoDetail(html, detailUrl) {
    const video = {
      detailUrl: detailUrl,
      source: 'javninja',
      crawledAt: Date.now()
    };
    
    // 提取番号
    const code = this.extractCode(detailUrl) || this.extractCode(html);
    if (code) {
      video.code = code.toUpperCase();
    }
    
    // 提取标题
    const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/i) ||
                      html.match(/<meta[^>]*property="og:title"[^>]*content="([^"]+)"[^>]*>/i);
    if (titleMatch) {
      video.title = titleMatch[1].trim();
    }
    
    // 提取演员
    const actressRegex = /<a[^>]*href="[^"]*\/actress\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
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
    const tagRegex = /<a[^>]*href="[^"]*\/tag\/[^"]*"[^>]*>([^<]+)<\/a>/gi;
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
    const coverMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"[^>]*>/i) ||
                      html.match(/<img[^>]*class="[^"]*cover[^"]*"[^>]*src="([^"]+)"[^>]*>/i) ||
                      html.match(/<img[^>]*data-src="([^"]*cover[^"]*)"[^>]*>/i);
    if (coverMatch) {
      video.coverUrl = coverMatch[1];
    }
    
    // 提取预览视频
    const videoMatch = html.match(/<video[^>]*data-src="([^"]+\.mp4[^"]*)"[^>]*>/i) ||
                      html.match(/<source[^>]*src="([^"]+\.mp4[^"]*)"[^>]*>/i);
    if (videoMatch) {
      video.previewUrl = videoMatch[1];
    }
    
    // 提取时长
    const durationMatch = html.match(/(\d+)\s*(min|minute|minutes)/i) ||
                         html.match(/<span[^>]*class="[^"]*duration[^"]*"[^>]*>(\d+)\s*(?:min|minute)/i);
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
      if (scriptContent.includes('video') || scriptContent.includes('post')) {
        // 提取 JSON 数据
        const jsonPatterns = [
          /window\.\w+\s*=\s*(\{[\s\S]*?\});?$/gm,
          /data\s*=\s*(\{[\s\S]*?\});?$/gm,
          /videos\s*=\s*(\[[\s\S]*?\]);?$/gm
        ];
        
        for (const pattern of jsonPatterns) {
          let jsonMatch;
          while ((jsonMatch = pattern.exec(scriptContent)) !== null) {
            try {
              const data = JSON.parse(jsonMatch[1]);
              const videoData = Array.isArray(data) ? data : [data];
              
              for (const item of videoData) {
                if (item.id || item.code || item.slug) {
                  const code = item.code || item.id || item.slug;
                  videos.push({
                    code: code.toString().toUpperCase(),
                    detailUrl: `${this.baseUrl}/video/${code}`,
                    title: item.title || item.name || code,
                    coverUrl: item.cover || item.image || item.thumbnail,
                    source: 'javninja',
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
    }
    
    return videos;
  }
  
  /**
   * 从文本中提取番号
   */
  extractCode(text) {
    if (!text) return null;
    
    const match = this.codePattern.exec(text);
    this.codePattern.lastIndex = 0;
    
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
   * 延迟
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = JAVNinjaCrawler;
