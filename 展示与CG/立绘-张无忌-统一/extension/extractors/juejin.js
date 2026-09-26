self.pageExtractors = self.pageExtractors || {};

// ========== 掘金提取器 ==========
self.pageExtractors['juejin.cn'] = `(function() {
    var parts = [];
    var images = [];

    var title = document.querySelector('.article-title, h1');
    if (title) parts.push('# ' + title.textContent.trim());

    var author = document.querySelector('.author-name, .username');
    if (author) parts.push('Author: ' + author.textContent.trim());

    var content = document.querySelector('.article-content, .markdown-body');
    if (content) {
      parts.push(content.textContent.trim());
      content.querySelectorAll('img').forEach(function(img) {
        var src = img.src || img.getAttribute('data-src');
        if (src && !src.includes('avatar') && !src.includes('user-gold-cdn')) {
          images.push({ src: src, alt: img.alt || '' });
          parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
        }
      });
    }

    // 标签
    var tags = document.querySelectorAll('.tag-list .tag, a[href*="/tag/"]');
    if (tags.length) {
      parts.push('Tags: ' + [...tags].map(function(t) { return t.textContent.trim(); }).filter(Boolean).join(', '));
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
    return { text: text, images: images, referer: 'https://juejin.cn' };
  })()`;
