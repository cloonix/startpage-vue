# Vue Startpage

A fast, lightweight self-hosted startpage that integrates with [Linkding](https://github.com/sissbruecker/linkding) for bookmark management. Built with Vue.js and served via nginx for optimal performance.

## 🥸 Disclaimer

One of my colleagues originally came up with the idea for this start page. We are currently working closely with AI tools, as well as developing them. The idea was to use different LLMs to develop this project. Vibe coding. It took me a few weeks, though, to get it to where it is now. I mainly used Claude 4 and Gemini Pro. I realized that experience with the components used was necessary. AI was only a booster, not a replacement.

## ✨ Features

- 🔖 **Linkding Integration** - Search and browse your bookmarks with real-time filtering
- 🏷️ **Tag-Based Sections** - Organize bookmarks into visual sections using tags
- ⌨️ **Keyboard Navigation** - Full keyboard support for efficient browsing
- 🖼️ **Custom Icons** - Add custom icons to bookmarks via notes field
- 📱 **Responsive Design** - Works seamlessly on desktop and mobile
- 🔒 **Secure Proxy** - Server-side API calls protect your credentials
- ⚡ **Performance Optimized** - Aggressive caching and gzip compression
- � **Docker Ready** - Single command deployment

## 🖼️ Screenshot

![screenshot](https://github.com/user-attachments/assets/171cef32-3e98-4155-93dc-303e84c070da)

## 🐳 Docker Ready - Single command deployment

### Prerequisites
- Docker and Docker Compose installed
- A running [Linkding](https://github.com/sissbruecker/linkding) instance
- Linkding API token (from your Linkding settings)

### 1. Clone Repository
```bash
git clone https://github.com/cloonix/startpage-vue.git
cd startpage-vue
```

### 2. Configure Environment
```bash
cp .env.example .env
# Edit .env with your settings
```

### 3. Deploy
```bash
./build.sh
```

That's it! Your startpage will be available at `http://localhost:3000`

## 📋 Environment Variables

Required in your `.env` file:

```bash
# Server Configuration
PORT=3000                                    # Port for the web interface

# Linkding Configuration (Required)
LINKDING_BASE_URL=https://your-linkding.com # Your Linkding instance URL
LINKDING_API_TOKEN=your_api_token_here       # API token from Linkding settings

# Optional: Cloudflare Access (if using CF protection)
CF_ACCESS_CLIENT_ID=your_client_id
CF_ACCESS_CLIENT_SECRET=your_client_secret
```

### Getting Your Linkding API Token
1. Go to your Linkding instance
2. Navigate to **Settings** → **Integrations**
3. Generate or copy your **REST API Token**
4. Add it to your `.env` file

## 🎯 Usage

### Setting Up Static Bookmark Sections

Create organized bookmark sections by tagging your bookmarks in Linkding:

**Top Section (Horizontal Grid):**
- Tag bookmarks with `#startpage-top`
- Perfect for frequently used services
- Displays in a clean grid layout

**Bottom Section (Grouped by Category):**
- Tag bookmarks with `#startpage-bottom` + category tag
- Example: `#startpage-bottom #media #tools #development`
- Groups bookmarks by their additional tags

### Adding Custom Icons

Make your bookmarks visually appealing:

1. Edit a bookmark in Linkding
2. In the **Notes** field, add:
   ```
   icon::https://example.com/favicon.png
   ```
3. Use any image URL (PNG, JPG, SVG)
4. Icons display at 24x24px

### Keyboard Navigation

- **Type** to search bookmarks instantly
- **↑/↓ Arrow Keys** - Navigate search results
- **Enter** - Open selected bookmark
- **Esc** - Clear search and return to homepage

## 🐳 Docker Commands

```bash
# Start/stop with docker-compose
docker compose up -d
docker compose down

# View logs
docker compose logs -f startpage-vue

# Rebuild after changes
docker compose up --build --force-recreate -d

# Access container shell for debugging
docker compose exec startpage-vue sh
```

## 🔧 Technical Architecture

- **Frontend**: Pure Vue.js 3 (no build process required)
- **Server**: nginx with optimized caching and gzip compression
- **Proxy**: Server-side API calls to Linkding (credentials never exposed to browser)
- **Caching**: Aggressive static file caching with content-based cache busting
- **Security**: CORS headers, security headers, IPv6 disabled for compatibility

## 🚀 Performance Features

- **Content-based Cache Busting**: Uses MD5 hash of app.js for efficient browser caching
- **Optimized nginx Configuration**: 7-day static file caching, 2-minute API response caching
- **Gzip Compression**: Reduces transfer size for better loading speeds
- **Debounced Search**: 200ms debounce prevents excessive API calls
- **Efficient Vue Rendering**: Unique keys for optimal list rendering performance

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## 📝 License

MIT - see the [LICENSE](LICENSE) file for details.
