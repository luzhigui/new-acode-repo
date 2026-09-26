self.pageExtractors = self.pageExtractors || {};

// ========== GitHub 提取器 ==========
self.pageExtractors['github.com'] = `(function() {
    var parts = [];
    var images = [];

    // 仓库主页 - README
    var repoName = document.querySelector('[itemprop="name"] a, .AppHeader-context-item-label');
    if (repoName) parts.push('# ' + repoName.textContent.trim());

    // 仓库描述
    var desc = document.querySelector('.f4.my-3, [class*="About"] p, .repository-content .f4');
    if (desc) parts.push(desc.textContent.trim());

    // Topics
    var topics = document.querySelectorAll('.topic-tag, a[data-octo-click="topic_click"]');
    if (topics.length) {
      parts.push('Topics: ' + [...topics].map(function(t) { return t.textContent.trim(); }).join(', '));
    }

    // README 内容（含图片）
    var readme = document.querySelector('#readme article, .markdown-body');
    if (readme) {
      parts.push('\\n---\\n');
      parts.push(readme.textContent.trim());

      // README 中的图片
      readme.querySelectorAll('img').forEach(function(img) {
        var src = img.src;
        if (src && !src.includes('badge') && !src.includes('shields.io') && !src.includes('avatar')) {
          images.push({ src: src, alt: img.alt || '' });
          parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
        }
      });
    }

    // Issue / PR 页面
    var issueTitle = document.querySelector('.js-issue-title, .gh-header-title');
    if (issueTitle) {
      parts.length = 0;
      images.length = 0;
      parts.push('# ' + issueTitle.textContent.trim());
      var issueBody = document.querySelector('.comment-body .markdown-body');
      if (issueBody) {
        parts.push(issueBody.textContent.trim());
        issueBody.querySelectorAll('img').forEach(function(img) {
          if (img.src && !img.src.includes('avatar')) {
            images.push({ src: img.src, alt: img.alt || '' });
            parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
          }
        });
      }

      // 评论
      var comments = document.querySelectorAll('.timeline-comment .comment-body');
      comments.forEach(function(c, i) {
        if (i > 10) return;
        parts.push('---\\n' + c.textContent.trim());
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
    return { text: text, images: images, referer: 'https://github.com' };
  })()`;
