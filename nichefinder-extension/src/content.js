function extractVideoId() {
  const url = new URL(window.location.href);
  
  if (url.pathname === '/watch') {
    return url.searchParams.get('v');
  }
  
  if (url.hostname === 'youtu.be') {
    return url.pathname.slice(1);
  }
  
  const match = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]+)/);
  if (match) return match[1];
  
  return null;
}

function extractChannelId() {
  const url = new URL(window.location.href);
  
  if (url.pathname.startsWith('/channel/')) {
    const match = url.pathname.match(/\/channel\/(UC[a-zA-Z0-9_-]{22})/);
    return match ? match[1] : null;
  }
  
  if (url.pathname.startsWith('/@')) {
    return url.pathname.slice(2);
  }
  
  if (url.pathname.startsWith('/c/') || url.pathname.startsWith('/user/')) {
    return url.pathname.split('/')[2];
  }
  
  return null;
}

function createBadge(data) {
  const existing = document.getElementById('nichefinder-badge');
  if (existing) existing.remove();
  
  const badge = document.createElement('div');
  badge.id = 'nichefinder-badge';
  badge.style.cssText = `
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #171717;
    border: 1px solid #404040;
    border-radius: 8px;
    padding: 12px 16px;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 13px;
    color: #f5f5f5;
    z-index: 9999;
    max-width: 280px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  `;
  
  if (data.error) {
    badge.innerHTML = `
      <div style="color: #f87171; font-weight: 600;">NicheFinder</div>
      <div style="margin-top: 4px; color: #a3a3a3; font-size: 12px;">${data.error}</div>
    `;
  } else if (data.video) {
    const v = data.video;
    badge.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-weight: 600;">NicheFinder</span>
        <span style="background: ${v.outlierScore >= 5 ? '#ef4444' : v.outlierScore >= 2 ? '#f59e0b' : '#10b981'}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px;">${v.outlierScore?.toFixed(1) || '-'}x</span>
      </div>
      <div style="margin-top: 8px; color: #a3a3a3; font-size: 12px;">
        Views: ${formatNumber(v.views || 0)}
        ${v.estimatedRevenueUsd ? `<br>Est. revenue: $${formatNumber(v.estimatedRevenueUsd)}` : ''}
      </div>
      <a href="https://nichefinder.ai/niche/${encodeURIComponent(v.keyword || v.title || 'video')}?q=${encodeURIComponent(v.keyword || v.title || '')}" target="_blank" style="margin-top: 8px; display: inline-block; color: #f87171; font-size: 12px;">Open in NicheFinder</a>
    `;
  } else if (data.channel) {
    const c = data.channel;
    badge.innerHTML = `
      <div style="font-weight: 600;">NicheFinder</div>
      <div style="margin-top: 4px; color: #a3a3a3; font-size: 12px;">
        ${c.title || 'Channel'}
        <br>Subs: ${formatNumber(c.subs || 0)}
      </div>
      <a href="https://nichefinder.ai/admin/seeds?channelUrl=${encodeURIComponent(window.location.href)}" target="_blank" style="margin-top: 8px; display: inline-block; color: #f87171; font-size: 12px;">Add to seeds</a>
    `;
  } else {
    badge.innerHTML = `
      <div style="font-weight: 600;">NicheFinder</div>
      <div style="margin-top: 4px; color: #a3a3a3; font-size: 12px;">No data found</div>
    `;
  }
  
  document.body.appendChild(badge);
  
  setTimeout(() => {
    badge.addEventListener('click', (e) => {
      if (e.target.tagName !== 'A') {
        badge.remove();
      }
    });
  }, 100);
}

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

async function fetchVideoData(videoId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'lookupVideo',
      videoId
    });
    
    if (response.success) {
      createBadge({ video: response.data });
    } else {
      createBadge({ error: response.error });
    }
  } catch (error) {
    createBadge({ error: 'Failed to fetch video data' });
  }
}

async function fetchChannelData(channelId) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'lookupChannel',
      channelId
    });
    
    if (response.success) {
      createBadge({ channel: response.data });
    } else {
      createBadge({ error: response.error });
    }
  } catch (error) {
    createBadge({ error: 'Failed to fetch channel data' });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggleBadge') {
    const videoId = extractVideoId();
    const channelId = extractChannelId();
    
    const existing = document.getElementById('nichefinder-badge');
    if (existing) {
      existing.remove();
      return;
    }
    
    if (videoId) {
      fetchVideoData(videoId);
    } else if (channelId) {
      fetchChannelData(channelId);
    } else {
      createBadge({ error: 'Not on a video or channel page' });
    }
  }
});