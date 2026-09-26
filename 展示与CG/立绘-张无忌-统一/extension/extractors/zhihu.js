self.pageExtractors = self.pageExtractors || {};

// ========== 知乎提取器 ==========
self.pageExtractors['zhihu.com'] = `(function() {
    var parts = [];
    var images = [];

    // 问题标题
    var questionTitle = document.querySelector('.QuestionHeader-title, h1.QuestionPage-title');
    if (questionTitle) parts.push('# ' + questionTitle.textContent.trim());

    // 问题描述
    var questionDetail = document.querySelector('.QuestionHeader-detail .RichText');
    if (questionDetail) parts.push(questionDetail.textContent.trim());

    // 回答（文章页或回答详情页）
    var answers = document.querySelectorAll('.RichContent-inner, .Post-RichText, .RichText.ztext');
    answers.forEach(function(answer, i) {
      if (i > 5) return;
      var answerItem = answer.closest('.AnswerItem, .ContentItem');
      var authorEl = answerItem ? answerItem.querySelector('.AuthorInfo-name, .UserLink-link') : null;
      var authorName = authorEl ? authorEl.textContent.trim() : '';

      var text = answer.textContent.trim();
      if (text.length > 50) {
        if (authorName) parts.push('## ' + authorName + ' 的回答');
        parts.push(text);

        // 回答中的图片
        answer.querySelectorAll('img[data-original], img[data-actualsrc], figure img').forEach(function(img) {
          var src = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || img.src;
          if (src && !src.includes('equation') && !src.includes('avatar')) {
            images.push({ src: src, alt: img.alt || '' });
            parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
          }
        });
      }
    });

    // 文章页
    if (parts.length <= 1) {
      var articleTitle = document.querySelector('.Post-Title');
      var articleContent = document.querySelector('.Post-RichTextContainer, .RichText.ztext.Post-RichText');
      if (articleTitle) parts.push('# ' + articleTitle.textContent.trim());
      if (articleContent) {
        parts.push(articleContent.textContent.trim());
        articleContent.querySelectorAll('img[data-original], img[data-actualsrc], figure img').forEach(function(img) {
          var src = img.getAttribute('data-original') || img.getAttribute('data-actualsrc') || img.src;
          if (src && !src.includes('equation') && !src.includes('avatar')) {
            images.push({ src: src, alt: img.alt || '' });
            parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
          }
        });
      }
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
    return { text: text, images: images, referer: 'https://www.zhihu.com' };
  })()`;
