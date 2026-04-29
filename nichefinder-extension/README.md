# NicheFinder Chrome Extension

Quick YouTube niche research directly from YouTube pages.

## Features

- **Video badge**: Click the extension icon on any YouTube video page to see outlier score, views, and estimated revenue
- **Channel lookup**: See channel stats and add channels to your NicheFinder seed list
- **Popup search**: Search niches directly from the extension popup
- **API integration**: Uses your NicheFinder API key for authenticated requests

## Installation

### Load unpacked (development)

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `nichefinder-extension` directory

### Publish (production)

1. Update version in `manifest.json`
2. Create a ZIP: `zip -r nichefinder-extension.zip .`
3. Upload to Chrome Web Store Developer Dashboard

## Configuration

1. Click the extension icon → "Configure API key"
2. Or go to `chrome://extensions/?options=<extension-id>`
3. Enter your API key from [NicheFinder API Keys](https://nichefinder.ai/account/api-keys)
4. (Optional) Override API base URL for local development

## Usage

### On YouTube video pages

1. Navigate to any YouTube video
2. Click the NicheFinder extension icon
3. A badge appears showing outlier score, views, and revenue estimate
4. Click "Open in NicheFinder" for full analysis

### On YouTube channel pages

1. Navigate to any YouTube channel
2. Click the extension icon
3. See channel stats
4. Click "Add to seeds" to add to your NicheFinder seed list

### Popup search

1. Click the extension icon
2. Type a niche query
3. See top 5 outlier results

## API Endpoints

The extension uses these NicheFinder API endpoints:

- `GET /api/v1/search?q=...&max=10&minOutlier=1` - Search niches
- `GET /api/v1/video?id=...` - Lookup video by ID
- `GET /api/v1/channel?id=...` - Lookup channel by ID

All endpoints require `Authorization: Bearer <api-key>` header.

## File structure

```
nichefinder-extension/
├── manifest.json          # Extension manifest (v3)
├── icons/                  # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
├── src/
│   ├── background.js       # Service worker
│   ├── content.js          # Content script for YouTube pages
│   ├── popup.html          # Extension popup UI
│   ├── popup.js            # Popup logic
│   ├── options.html        # Settings page
│   └── options.js          # Settings logic
├── scripts/
│   └── generate-icons.js   # Generate PNG icons
└── README.md
```

## Development

1. Load the extension in Chrome (see Installation above)
2. Set API base URL to `http://localhost:3000` in extension options
3. Use a valid API key from your local NicheFinder instance
4. Reload the extension after code changes