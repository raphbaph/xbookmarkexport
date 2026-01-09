const SCROLL_DELAY_MS = 1200;
const MAX_SCROLL_ATTEMPTS = 300;
const MAX_STABLE_ROUNDS = 6;
const MIN_SCROLL_DELAY_MS = 800;
const MAX_SCROLL_DELAY_MS = 2000;
const PROGRESS_THROTTLE_MS = 500;
const DATE_REACHED_GRACE_ROUNDS = 2;
const TIMELINE_WAIT_MS = 5000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sendProgress(phase, details = {}) {
  try {
    chrome.runtime.sendMessage({ type: "EXPORT_PROGRESS", phase, ...details });
  } catch (error) {
    // Popup may not be listening; ignore.
  }
}

function collectTweetArticles(root = document) {
  return Array.from(root.querySelectorAll("article"));
}

function isTopLevelArticle(article) {
  if (!article) return false;
  const parentArticle = article.parentElement
    ? article.parentElement.closest("article")
    : null;
  return !parentArticle;
}

function getTimelineRoot() {
  return (
    document.querySelector('div[aria-label="Timeline: Bookmarks"]') ||
    document.querySelector('div[aria-label^="Timeline: Bookmarks"]') ||
    document.querySelector('main[role="main"]') ||
    document.querySelector("main") ||
    document
  );
}

function findScrollableParent(element) {
  let current = element;
  while (current && current !== document.body) {
    if (current.scrollHeight > current.clientHeight + 20) {
      return current;
    }
    current = current.parentElement;
  }
  return document.scrollingElement || document.documentElement;
}

function extractTweetIdFromHref(href) {
  if (!href) return null;
  const match = href.match(/\/status\/(\d+)/);
  return match ? match[1] : null;
}

function extractTweetId(article) {
  const timeEl = article.querySelector("time");
  if (timeEl) {
    const link = timeEl.closest("a");
    const id = extractTweetIdFromHref(link && link.getAttribute("href"));
    if (id) return id;
  }

  const link = article.querySelector('a[href*="/status/"]');
  return extractTweetIdFromHref(link && link.getAttribute("href"));
}

function extractTweetUrl(article) {
  const timeEl = article.querySelector("time");
  if (timeEl) {
    const link = timeEl.closest("a");
    if (link && link.getAttribute("href")) {
      return new URL(link.getAttribute("href"), "https://x.com").toString();
    }
  }
  const link = article.querySelector('a[href*="/status/"]');
  if (link && link.getAttribute("href")) {
    return new URL(link.getAttribute("href"), "https://x.com").toString();
  }
  return null;
}

function extractCardHeadline(article) {
  const cardRoot = article.querySelector('div[data-testid="card.wrapper"]');
  if (!cardRoot) return null;
  const candidates = Array.from(
    cardRoot.querySelectorAll('div[dir="auto"], span[dir="auto"]')
  )
    .map((el) => (el && el.textContent ? el.textContent.trim() : ""))
    .filter(Boolean);
  if (!candidates.length) return null;
  return candidates.reduce((best, current) => {
    if (!best) return current;
    return current.length > best.length ? current : best;
  }, "");
}

function extractLongformText(article) {
  const primarySelectors = [
    'div[data-testid="tweetText"]',
    'div[data-testid="articleBody"]',
    'div[data-testid="article-body"]',
    'div[data-testid="articleText"]'
  ];
  const primaryNodes = primarySelectors
    .map((selector) => Array.from(article.querySelectorAll(selector)))
    .flat();

  const nodes = primaryNodes.length
    ? primaryNodes
    : Array.from(article.querySelectorAll('div[dir="auto"], span[dir="auto"], p'));

  const excludedAncestorSelectors = [
    'div[data-testid="User-Name"]',
    "time",
    'a[href*="/status/"]',
    'div[role="group"]',
    'div[data-testid="reply"]',
    'div[data-testid="retweet"]',
    'div[data-testid="like"]'
  ];

  const isExcluded = (node) =>
    excludedAncestorSelectors.some((selector) => node.closest(selector));

  const lines = [];
  for (const node of nodes) {
    if (!node || isExcluded(node)) continue;
    const text = node.textContent ? node.textContent.trim() : "";
    if (!text) continue;
    if (!lines.includes(text)) {
      lines.push(text);
    }
  }

  if (!lines.length) return null;
  return lines.join("\n\n");
}

function extractAuthorHandle(article) {
  const userNameEl = article.querySelector('div[data-testid="User-Name"] a[href^="/"]');
  if (!userNameEl) return null;
  const href = userNameEl.getAttribute("href") || "";
  if (!href || href.startsWith("/i/")) return null;
  return href.replace(/^\//, "");
}

function extractMediaUrls(article) {
  const images = Array.from(
    article.querySelectorAll('img[src*="twimg.com/media"]')
  ).map((img) => img.getAttribute("src"));

  const videos = Array.from(article.querySelectorAll("video")).flatMap((video) => {
    const sources = Array.from(video.querySelectorAll("source"))
      .map((source) => source.getAttribute("src"))
      .filter(Boolean);
    const direct = video.getAttribute("src");
    if (direct) {
      sources.push(direct);
    }
    return sources;
  });

  return Array.from(new Set([...images, ...videos])).filter(Boolean);
}

function findQuoteRoot(article) {
  const quoteContainer = article.querySelector('div[data-testid="quoteTweet"]');
  if (quoteContainer) return quoteContainer;
  const nestedArticles = collectTweetArticles(article);
  return nestedArticles.length ? nestedArticles[0] : null;
}

function extractTweetData(article, options = {}) {
  const includeQuote = options.includeQuote !== false;
  const tweetId = extractTweetId(article);
  const tweetUrl = extractTweetUrl(article);
  const textEl = article.querySelector('div[data-testid="tweetText"]');
  const text =
    (textEl ? textEl.innerText : "") ||
    extractLongformText(article) ||
    extractCardHeadline(article) ||
    "";
  const authorHandle = extractAuthorHandle(article);
  const timeEl = article.querySelector("time");
  const timestamp = timeEl ? timeEl.getAttribute("datetime") : null;
  const mediaUrls = extractMediaUrls(article);

  let quotedTweet = null;
  if (includeQuote) {
    const quoteRoot = findQuoteRoot(article);
    if (quoteRoot) {
      const candidate = extractTweetData(quoteRoot, { includeQuote: false });
      const hasContent =
        candidate.tweetId ||
        candidate.tweetUrl ||
        candidate.text ||
        candidate.authorHandle ||
        candidate.timestamp ||
        (candidate.mediaUrls && candidate.mediaUrls.length > 0);
      quotedTweet = hasContent ? candidate : null;
    }
  }

  return {
    tweetId,
    tweetUrl,
    text,
    authorHandle,
    timestamp,
    mediaUrls,
    quotedTweet
  };
}

async function waitForTimelineRoot(timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const root = getTimelineRoot();
    if (root && root !== document) {
      return root;
    }
    await sleep(100);
  }
  return getTimelineRoot();
}

function createResultKey(data, fallbackIndex) {
  if (data.tweetId) return data.tweetId;
  if (data.tweetUrl) return data.tweetUrl;
  const author = data.authorHandle || "unknown";
  const timestamp = data.timestamp || "unknown-time";
  const text = data.text ? data.text.slice(0, 80) : "no-text";
  return `${author}|${timestamp}|${text}|${fallbackIndex}`;
}

function collectResultsFromArticles(articles, store) {
  articles.forEach((article, index) => {
    if (!isTopLevelArticle(article)) return;
    const data = extractTweetData(article);
    const key = createResultKey(data, index);
    if (store.has(key)) return;
    store.set(key, data);
  });
}

async function autoScrollToEnd(endDateCutoff, store) {
  let stableRounds = 0;
  let delay = SCROLL_DELAY_MS;
  let lastReportedCount = 0;
  let lastReportedAt = 0;
  let dateReachedRounds = 0;
  const timelineRoot = await waitForTimelineRoot(TIMELINE_WAIT_MS);
  const scrollContainer = findScrollableParent(timelineRoot);
  const observeRoot = timelineRoot === document ? document.body : timelineRoot;
  let oldestSeen = null;

  for (let i = 0; i < MAX_SCROLL_ATTEMPTS; i += 1) {
    const articles = collectTweetArticles(timelineRoot);
    const topLevelArticles = articles.filter(isTopLevelArticle);
    const count = topLevelArticles.length;
    const sizeBefore = store.size;
    collectResultsFromArticles(topLevelArticles, store);
    const newItems = store.size - sizeBefore;

    for (const article of topLevelArticles) {
      const timeEl = article.querySelector("time");
      if (timeEl && timeEl.getAttribute("datetime")) {
        const date = new Date(timeEl.getAttribute("datetime"));
        if (!Number.isNaN(date.getTime())) {
          if (!oldestSeen || date.getTime() < oldestSeen.getTime()) {
            oldestSeen = date;
          }
        }
      }
    }
    const now = Date.now();
    if (store.size !== lastReportedCount && now - lastReportedAt >= PROGRESS_THROTTLE_MS) {
      lastReportedCount = store.size;
      lastReportedAt = now;
      sendProgress("scrolling", { count: store.size });
    }
    if (endDateCutoff) {
      if (oldestSeen && oldestSeen.getTime() <= endDateCutoff.getTime()) {
        dateReachedRounds += 1;
      } else {
        dateReachedRounds = 0;
      }
      if (dateReachedRounds >= DATE_REACHED_GRACE_ROUNDS) {
        break;
      }
    }
    const lastArticle = articles[articles.length - 1];
    if (lastArticle) {
      lastArticle.scrollIntoView({ block: "end", behavior: "instant" });
    } else if (scrollContainer) {
      scrollContainer.scrollTop = scrollContainer.scrollHeight;
    } else {
      window.scrollTo(0, document.body.scrollHeight);
    }

    await sleep(100);
    const grew = await waitForNewArticles(observeRoot, count, delay);
    const nextArticles = collectTweetArticles(timelineRoot).filter(isTopLevelArticle);
    const nextCount = nextArticles.length;
    const sizeAfterBefore = store.size;
    collectResultsFromArticles(nextArticles, store);
    const newItemsAfter = store.size - sizeAfterBefore;

    if (nextCount > count || grew || newItems > 0 || newItemsAfter > 0) {
      stableRounds = 0;
      delay = Math.max(MIN_SCROLL_DELAY_MS, delay - 150);
    } else {
      stableRounds += 1;
      delay = Math.min(delay + 150, MAX_SCROLL_DELAY_MS);
    }

    if (stableRounds >= MAX_STABLE_ROUNDS) {
      break;
    }
  }
}

function parseEndDate(endDateStr) {
  if (!endDateStr) return null;
  const endDate = new Date(`${endDateStr}T00:00:00.000`);
  if (Number.isNaN(endDate.getTime())) return null;
  return endDate;
}

function filterByEndDate(bookmarks, endDate) {
  if (!endDate) return bookmarks;
  return bookmarks.filter((item) => {
    if (!item.timestamp) return false;
    const itemDate = new Date(item.timestamp);
    if (Number.isNaN(itemDate.getTime())) return false;
    return itemDate.getTime() >= endDate.getTime();
  });
}

function getOldestTimestamp(articles) {
  let oldest = null;
  for (const article of articles) {
    const timeEl = article.querySelector("time");
    if (!timeEl) continue;
    const timestamp = timeEl.getAttribute("datetime");
    if (!timestamp) continue;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) continue;
    if (!oldest || date.getTime() < oldest.getTime()) {
      oldest = date;
    }
  }
  return oldest;
}

function waitForNewArticles(root, previousCount, timeoutMs) {
  return new Promise((resolve) => {
    if (!root) {
      resolve(false);
      return;
    }
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      observer.disconnect();
      resolve(false);
    }, timeoutMs);

    const observer = new MutationObserver(() => {
      const count = collectTweetArticles(root).length;
      if (count > previousCount && !done) {
        done = true;
        clearTimeout(timer);
        observer.disconnect();
        resolve(true);
      }
    });

    observer.observe(root, { childList: true, subtree: true });
  });
}

async function scrapeBookmarks(endDateStr) {
  const endDate = parseEndDate(endDateStr);
  const store = new Map();
  sendProgress("scrolling");
  await autoScrollToEnd(endDate, store);

  sendProgress("extracting");
  const all = Array.from(store.values());
  const filtered = filterByEndDate(all, endDate);
  return filtered;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || message.type !== "EXPORT_BOOKMARKS") {
    return;
  }

  (async () => {
    try {
      if (!location.href.startsWith("https://x.com/i/bookmarks")) {
        sendResponse({ ok: false, error: "Not on the bookmarks page." });
        return;
      }
      const data = await scrapeBookmarks(message.endDate);
      sendResponse({ ok: true, data });
    } catch (error) {
      sendResponse({ ok: false, error: error && error.message });
    }
  })();

  return true;
});
