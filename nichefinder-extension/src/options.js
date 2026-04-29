const apiKeyInput = document.getElementById('apiKey');
const apiBaseUrlInput = document.getElementById('apiBaseUrl');
const saveBtn = document.getElementById('saveBtn');
const statusDiv = document.getElementById('status');

async function loadSettings() {
  const result = await chrome.storage.local.get(['apiKey', 'apiBaseUrl']);
  apiKeyInput.value = result.apiKey || '';
  apiBaseUrlInput.value = result.apiBaseUrl || '';
}

async function saveSettings() {
  const apiKey = apiKeyInput.value.trim();
  const apiBaseUrl = apiBaseUrlInput.value.trim() || 'https://nichefinder.ai';
  
  if (!apiKey) {
    showStatus('API key is required', 'error');
    return;
  }
  
  await chrome.storage.local.set({
    apiKey,
    apiBaseUrl
  });
  
  showStatus('Settings saved', 'success');
}

function showStatus(message, type) {
  statusDiv.textContent = message;
  statusDiv.className = `status ${type}`;
  
  setTimeout(() => {
    statusDiv.textContent = '';
    statusDiv.className = '';
  }, 3000);
}

document.addEventListener('DOMContentLoaded', loadSettings);
saveBtn.addEventListener('click', saveSettings);