const searchForm = document.getElementById('searchForm');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsDiv = document.getElementById('results');

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function renderResults(data) {
  if (!data.results || data.results.length === 0) {
    resultsDiv.innerHTML = '<div class="error">No results found</div>';
    return;
  }
  
  const html = data.results.slice(0, 5).map(video => `
    <div class="result-item">
      <div class="result-title">
        <a href="https://youtube.com/watch?v=${video.id}" target="_blank">${video.title}</a>
      </div>
      <div class="result-meta">
        <span class="result-outlier">${video.outlierScore?.toFixed(1) || '-'}x</span>
        &middot; ${formatNumber(video.views || 0)} views
        &middot; ${video.channelTitle || '-'}
      </div>
    </div>
  `).join('');
  
  resultsDiv.innerHTML = `<div class="results">${html}</div>`;
}

function renderError(error) {
  resultsDiv.innerHTML = `<div class="error">${error}</div>`;
}

function renderLoading() {
  resultsDiv.innerHTML = '<div class="loading">Searching...</div>';
}

searchForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const query = searchInput.value.trim();
  if (!query) return;
  
  searchBtn.disabled = true;
  renderLoading();
  
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'searchNiche',
      query,
      options: { max: 10, minOutlier: 1 }
    });
    
    if (response.success) {
      renderResults(response.data);
    } else {
      renderError(response.error);
    }
  } catch (error) {
    renderError('Search failed');
  } finally {
    searchBtn.disabled = false;
  }
});