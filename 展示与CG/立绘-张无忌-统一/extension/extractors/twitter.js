self.pageExtractors = self.pageExtractors || {};

// ========== X / Twitter 提取器 ==========
self.pageExtractors['x.com'] = `(function() {
    var parts = [];
    var images = [];
    var videos = [];

    // 单条推文详情页
    var tweetArticle = document.querySelector('article[data-testid="tweet"]');
    if (tweetArticle) {
      // 作者
      var authorName = tweetArticle.querySelector('[data-testid="User-Name"]');
      if (authorName) parts.push('@' + authorName.textContent.trim());

      // 推文内容
      var tweetText = tweetArticle.querySelector('[data-testid="tweetText"]');
      if (tweetText) parts.push(tweetText.textContent.trim());

      // 推文图片
      var tweetImages = tweetArticle.querySelectorAll('[data-testid="tweetPhoto"] img');
      tweetImages.forEach(function(img) {
        var src = img.src;
        if (src && !src.includes('emoji') && !src.includes('profile_images')) {
          images.push({ src: src, alt: img.alt || '' });
          parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
        }
      });

      // 推文视频
      var tweetVideos = tweetArticle.querySelectorAll('video');
      tweetVideos.forEach(function(video) {
        var src = video.src || video.currentSrc;
        if (!src) {
          var source = video.querySelector('source');
          if (source) src = source.src;
        }
        if (src && !src.startsWith('blob:')) {
          videos.push({ src: src, poster: video.poster || undefined, type: 'video', referer: 'https://x.com' });
        } else if (video.poster) {
          videos.push({ src: location.href, poster: video.poster, type: 'video-blob', referer: 'https://x.com', note: 'X 视频需通过原页面访问' });
        }
      });

      // 时间
      var time = tweetArticle.querySelector('time');
      if (time) parts.push('Time: ' + time.getAttribute('datetime'));

      // 互动数据
      var metrics = tweetArticle.querySelectorAll('[data-testid$="count"]');
      if (metrics.length) {
        var stats = [...metrics].map(function(m) { return m.textContent.trim(); }).filter(Boolean);
        parts.push('Engagement: ' + stats.join(' | '));
      }
    }

    // 如果是时间线，抓取可见推文
    if (!parts.length) {
      var tweets = document.querySelectorAll('article[data-testid="tweet"]');
      tweets.forEach(function(tweet, i) {
        if (i > 20) return;
        var text = tweet.querySelector('[data-testid="tweetText"]');
        var author = tweet.querySelector('[data-testid="User-Name"]');
        if (text) {
          var prefix = author ? '@' + author.textContent.split('\\u00b7')[0].trim() + ': ' : '';
          parts.push(prefix + text.textContent.trim());

          // 时间线中的图片
          var tweetImgs = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
          tweetImgs.forEach(function(img) {
            if (img.src && !img.src.includes('emoji') && !img.src.includes('profile_images')) {
              images.push({ src: img.src, alt: img.alt || '' });
              parts.push('![]({{IMG_' + (images.length - 1) + '}})');
            }
          });
        }
      });
    }

    var text = parts.join('\\n\\n---\\n\\n');
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
    return { text: text, images: images, videos: videos, referer: 'https://x.com' };
  })()`;

// twitter.com 使用与 x.com 相同的提取器
self.pageExtractors['twitter.com'] = `(function() {
    var parts = [];
    var images = [];
    var videos = [];

    // 单条推文详情页
    var tweetArticle = document.querySelector('article[data-testid="tweet"]');
    if (tweetArticle) {
      // 作者
      var authorName = tweetArticle.querySelector('[data-testid="User-Name"]');
      if (authorName) parts.push('@' + authorName.textContent.trim());

      // 推文内容
      var tweetText = tweetArticle.querySelector('[data-testid="tweetText"]');
      if (tweetText) parts.push(tweetText.textContent.trim());

      // 推文图片
      var tweetImages = tweetArticle.querySelectorAll('[data-testid="tweetPhoto"] img');
      tweetImages.forEach(function(img) {
        var src = img.src;
        if (src && !src.includes('emoji') && !src.includes('profile_images')) {
          images.push({ src: src, alt: img.alt || '' });
          parts.push('![' + (img.alt || '') + ']({{IMG_' + (images.length - 1) + '}})');
        }
      });

      // 推文视频
      var tweetVideos = tweetArticle.querySelectorAll('video');
      tweetVideos.forEach(function(video) {
        var src = video.src || video.currentSrc;
        if (!src) {
          var source = video.querySelector('source');
          if (source) src = source.src;
        }
        if (src && !src.startsWith('blob:')) {
          videos.push({ src: src, poster: video.poster || undefined, type: 'video', referer: 'https://x.com' });
        } else if (video.poster) {
          videos.push({ src: location.href, poster: video.poster, type: 'video-blob', referer: 'https://x.com', note: 'X 视频需通过原页面访问' });
        }
      });

      // 时间
      var time = tweetArticle.querySelector('time');
      if (time) parts.push('Time: ' + time.getAttribute('datetime'));

      // 互动数据
      var metrics = tweetArticle.querySelectorAll('[data-testid$="count"]');
      if (metrics.length) {
        var stats = [...metrics].map(function(m) { return m.textContent.trim(); }).filter(Boolean);
        parts.push('Engagement: ' + stats.join(' | '));
      }
    }

    // 如果是时间线，抓取可见推文
    if (!parts.length) {
      var tweets = document.querySelectorAll('article[data-testid="tweet"]');
      tweets.forEach(function(tweet, i) {
        if (i > 20) return;
        var text = tweet.querySelector('[data-testid="tweetText"]');
        var author = tweet.querySelector('[data-testid="User-Name"]');
        if (text) {
          var prefix = author ? '@' + author.textContent.split('\\u00b7')[0].trim() + ': ' : '';
          parts.push(prefix + text.textContent.trim());

          // 时间线中的图片
          var tweetImgs = tweet.querySelectorAll('[data-testid="tweetPhoto"] img');
          tweetImgs.forEach(function(img) {
            if (img.src && !img.src.includes('emoji') && !img.src.includes('profile_images')) {
              images.push({ src: img.src, alt: img.alt || '' });
              parts.push('![]({{IMG_' + (images.length - 1) + '}})');
            }
          });
        }
      });
    }

    var text = parts.join('\\n\\n---\\n\\n');
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
    return { text: text, images: images, videos: videos, referer: 'https://x.com' };
  })()`;
