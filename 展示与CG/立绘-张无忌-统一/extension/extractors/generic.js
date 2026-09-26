// ========== 通用提取器（兜底） ==========
self.genericExtractor = `(function() {
  var body = document.body;
  var images = [];

  // 移除脚本、样式等非内容元素
  var clone = body.cloneNode(true);
  var removeSelectors = ['script', 'style', 'noscript', 'iframe', 'svg', 'nav', 'footer', 'header'];
  removeSelectors.forEach(function(sel) {
    clone.querySelectorAll(sel).forEach(function(el) { el.remove(); });
  });

  // 获取纯文本
  var text = clone.innerText || clone.textContent || '';
  text = text.replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]+/g, ' ').trim();

  // 收集页面中有意义的图片
  var mainContent = document.querySelector('article, main, .content, .post-content, .entry-content') || body;
  mainContent.querySelectorAll('img').forEach(function(img) {
    var src = img.src || img.getAttribute('data-src');
    if (!src || src.startsWith('data:image/svg')) return;
    var w = img.naturalWidth || img.width || 0;
    var h = img.naturalHeight || img.height || 0;
    if (w > 0 && w < 100 && h > 0 && h < 100) return;
    images.push({ src: src, alt: img.alt || '' });
  });

  return { text: text, images: images };
})()`;
