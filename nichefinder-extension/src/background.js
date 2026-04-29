const NICHEFINDER_API_BASE = 'https://nichefinder.ai';

async function getApiBaseUrl() {
  const result = await chrome.storage.local.get(['apiBaseUrl']);
  return result.apiBaseUrl || NICHEFINDER_API_BASE;
}

async function getApiKey() {
  const result = await chrome.storage.local.get(['apiKey']);
  return result.apiKey || '';
}

async function apiFetch(path, options = {}) {
  const baseUrl = await getApiBaseUrl();
  const apiKey = await getApiKey();
  
  if (!apiKey) {
    throw new Error('API key not configured. Open extension options to set it.');
  }
  
  const url = `${baseUrl}${path}`;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  const response = await fetch(url, { ...options, headers });
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }
  
  return response.json();
}

async function lookupVideo(videoId) {
  return apiFetch(`/api/v1/video?id=${encodeURIComponent(videoId)}`);
}

async function lookupChannel(channelId) {
  return apiFetch(`/api/v1/channel?id=${encodeURIComponent(channelId)}`);
}

async function searchNiche(query, options = {}) {
  const params = new URLSearchParams();
  params.set('q', query);
  if (options.max) params.set('max', options.max);
  if (options.minOutlier) params.set('minOutlier', options.minOutlier);
  
  return apiFetch(`/api/v1/search?${params.toString()}`);
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'lookupVideo') {
    lookupVideo(message.videoId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === 'lookupChannel') {
    lookupChannel(message.channelId)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
  
  if (message.type === 'searchNiche') {
    searchNiche(message.query, message.options)
      .then(data => sendResponse({ success: true, data }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

chrome.action.onClicked.addListener((tab) => {
  chrome.tabs.sendMessage(tab.id, { type: 'toggleBadge' });
});