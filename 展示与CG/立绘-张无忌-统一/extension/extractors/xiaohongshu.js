self.pageExtractors = self.pageExtractors || {};

// ========== 小红书提取器 ==========
self.pageExtractors['xiaohongshu.com'] = `(function() {
    const parts = [];
    const images = [];

    // 笔记标题 - 多种可能的选择器
    const titleEl = document.querySelector(
      '#detail-title, .note-content .title, [class*="note-title"], [class*="noteTitle"]'
    ) || document.querySelector('h1, [class*="title"]');
    if (titleEl) parts.push('# ' + titleEl.textContent.trim());

    // 笔记图片 - 小红书的图片在 swiper/carousel 容器中
    // 尝试多种选择器来适配不同版本的 DOM
    var noteImages = document.querySelectorAll(
      '.note-image-list img, [class*="slide"] img[src*="xhscdn"], [class*="swiper-slide"] img, [class*="carousel"] img[src], .media-container img'
    );
    // 如果上面没找到，尝试找所有有 xhscdn 地址的图片
    if (noteImages.length === 0) {
      noteImages = document.querySelectorAll('img[src*="xhscdn"], img[src*="xiaohongshu"]');
    }
    // 如果还没找到，尝试从 background-image 提取
    if (noteImages.length === 0) {
      document.querySelectorAll('[style*="xhscdn"], [style*="background-image"]').forEach(function(el) {
        var style = el.getAttribute('style') || '';
        var match = style.match(/url\\(["']?(https?:\\/\\/[^"')]+)["']?\\)/);
        if (match && (match[1].includes('xhscdn') || match[1].includes('xiaohongshu'))) {
          images.push({ src: match[1], alt: '' });
          parts.push('![]({{IMG_' + (images.length - 1) + '}})');
        }
      });
    }

    var seenSrcs = new Set();
    noteImages.forEach(function(img) {
      var src = img.src || img.getAttribute('data-src') || img.currentSrc;
      if (src && !src.startsWith('data:') && !seenSrcs.has(src)) {
        // 过滤头像等小图
        var width = img.naturalWidth || img.width || parseInt(img.getAttribute('width')) || 999;
        if (width < 50) return;
        seenSrcs.add(src);
        images.push({ src: src, alt: img.alt || '' });
        parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
      }
    });

    // 笔记正文 - 适配多种版本
    var contentSelectors = [
      '#detail-desc',
      '.note-content .desc',
      '[class*="note-text"]',
      '[class*="noteText"]',
      '[class*="content"] [class*="desc"]',
      '.note-detail .content',
      '[id*="detail"] [class*="desc"]',
    ];
    var contentEl = null;
    for (var i = 0; i < contentSelectors.length; i++) {
      contentEl = document.querySelector(contentSelectors[i]);
      if (contentEl && contentEl.textContent.trim().length > 10) break;
      contentEl = null;
    }
    // 兜底：找笔记区域内最长的文本块
    if (!contentEl) {
      var candidates = document.querySelectorAll('[class*="note"] p, [class*="note"] span, [class*="detail"] p, [class*="detail"] span');
      var longestText = '';
      candidates.forEach(function(el) {
        var t = el.textContent.trim();
        if (t.length > longestText.length && t.length > 20) {
          longestText = t;
          contentEl = el;
        }
      });
    }
    if (contentEl) parts.push(contentEl.textContent.trim());

    // 标签
    var tags = document.querySelectorAll('[class*="tag"] a, a[href*="/search_result/"], a[href*="/explore/"] [class*="tag"]');
    var tagTexts = [...new Set([...tags].map(function(t) { return t.textContent.trim(); }).filter(function(t) { return t && t.startsWith('#'); }))];
    if (tagTexts.length) {
      parts.push('\\nTags: ' + tagTexts.join(' '));
    } else {
      // 尝试从正文中提取 # 标签
      var allText = parts.join('\\n');
      var hashTags = allText.match(/#[^\\s#]+/g);
      if (hashTags && hashTags.length > 0) {
        parts.push('\\nTags: ' + [...new Set(hashTags)].join(' '));
      }
    }

    // 作者信息
    var authorSelectors = [
      '[class*="author-name"]',
      '[class*="authorName"]',
      '[class*="user-name"]',
      '.username',
      '[class*="nickname"]',
      'a[href*="/user/profile/"]',
    ];
    var authorEl = null;
    for (var j = 0; j < authorSelectors.length; j++) {
      authorEl = document.querySelector(authorSelectors[j]);
      if (authorEl && authorEl.textContent.trim()) break;
      authorEl = null;
    }
    if (authorEl) parts.push('\\nAuthor: ' + authorEl.textContent.trim());

    // 视频 - 小红书视频笔记
    var videos = [];
    document.querySelectorAll('video').forEach(function(video) {
      var src = video.src || video.currentSrc;
      if (!src) {
        var source = video.querySelector('source');
        if (source) src = source.src;
      }
      if (src && !src.startsWith('blob:')) {
        videos.push({ src: src, poster: video.poster || undefined, type: 'video', referer: 'https://www.xiaohongshu.com' });
      } else if (video.poster) {
        // 小红书视频通常是 blob，记录 poster 和页面信息
        videos.push({ src: location.href, poster: video.poster, type: 'video-blob', referer: 'https://www.xiaohongshu.com', note: '小红书视频需通过原页面访问' });
      }
    });
    // 也检查 data 属性中可能的视频 URL
    document.querySelectorAll('[data-video-url], [class*="video"] [data-url]').forEach(function(el) {
      var src = el.getAttribute('data-video-url') || el.getAttribute('data-url');
      if (src) videos.push({ src: src, type: 'video', referer: 'https://www.xiaohongshu.com' });
    });

    if (videos.length > 0) {
      parts.push('\\n[Video: ' + videos.length + ' clip(s) captured]');
    }

    var text = parts.join('\\n\\n');
    if (!text.trim()) {
      // 回退到通用提取
      var body = document.body;
      var fallbackImages = [];
      var clone = body.cloneNode(true);
      ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header'].forEach(function(sel) {
        clone.querySelectorAll(sel).forEach(function(el) { el.remove(); });
      });
      var fallbackText = clone.innerText || clone.textContent || '';
      fallbackText = fallbackText.replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+/g, ' ').trim();
      var mainContent = document.querySelector('article, main, .content, .post-content, .entry-content') || body;
      mainContent.querySelectorAll('img').forEach(function(img) {
        var s = img.src || img.getAttribute('data-src');
        if (!s || s.startsWith('data:image/svg')) return;
        var w = img.naturalWidth || img.width || 0;
        var h = img.naturalHeight || img.height || 0;
        if (w > 0 && w < 100 && h > 0 && h < 100) return;
        fallbackImages.push({ src: s, alt: img.alt || '' });
      });
      return { text: fallbackText, images: fallbackImages };
    }
    return { text: text, images: images, videos: videos, referer: 'https://www.xiaohongshu.com' };
  })()`;
