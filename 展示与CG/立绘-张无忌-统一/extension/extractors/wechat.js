self.pageExtractors = self.pageExtractors || {};

// ========== 微信公众号提取器 ==========
self.pageExtractors['mp.weixin.qq.com'] = `(function() {
    var parts = [];
    var images = [];

    var title = document.querySelector('#activity-name, .rich_media_title');
    if (title) parts.push('# ' + title.textContent.trim());

    var author = document.querySelector('#js_name, .rich_media_meta_nickname');
    if (author) parts.push('Author: ' + author.textContent.trim());

    var content = document.querySelector('#js_content, .rich_media_content');
    if (content) {
      parts.push(content.textContent.trim());
      // 微信文章图片使用 data-src
      content.querySelectorAll('img[data-src]').forEach(function(img) {
        var src = img.getAttribute('data-src');
        if (src) {
          images.push({ src: src, alt: img.alt || '' });
          parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
        }
      });
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
    return { text: text, images: images, referer: 'https://mp.weixin.qq.com' };
  })()`;
