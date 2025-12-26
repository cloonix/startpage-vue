const { createApp } = Vue;

createApp({
  data() {
    return {
      // Constants
      CONSTANTS: {
        SEARCH_MIN_LENGTH: 2,
        SEARCH_DEBOUNCE_MS: 200,
        API_TIMEOUT_MS: 10000,
        API_RETRY_COUNT: 1,
        ICON_PRELOAD_LIMIT: 8,
        ICON_PRELOAD_DELAY_MS: 150,
        ICON_CACHE_MAX_SIZE: 500,
        DRAG_THRESHOLD_PX: 5,
        BOOKMARK_LIMIT_PER_PAGE: 100,
        RETRY_MAX_ATTEMPTS: 3,
        RETRY_BASE_DELAY_MS: 1000,
        ERROR_TOAST_DURATION_MS: 5000,
        SUCCESS_TOAST_DURATION_MS: 3000,
        LOADING_TOAST_DURATION_MS: 0,
        API_CACHE_DURATION_MIN: 2
      },
      
      // Error Messages
      ERROR_MESSAGES: {
        API_TIMEOUT: 'Request timed out. Please check your connection and try again.',
        API_NETWORK: 'Network error. Please check your connection.',
        API_SERVER: 'Server error. Please try again later.',
        API_NOT_FOUND: 'Resource not found.',
        API_UNAUTHORIZED: 'Authentication failed. Please check your API token.',
        SEARCH_FAILED: 'Search failed. Please try again.',
        BOOKMARK_UPDATE_FAILED: 'Failed to update bookmark. Please try again.',
        BOOKMARK_LOAD_FAILED: (attempts) => `Failed to load bookmarks after ${attempts} attempts. Please check your connection and refresh.`,
        INVALID_URL: 'Please enter a valid URL (must start with http:// or https://)',
        ICON_UPDATE_LOADING: 'Updating icon...',
        ICON_UPDATE_SUCCESS: (name) => `✓ Icon updated for ${name}`,
        ICON_UPDATE_FAILED: 'Failed to update icon. Please try again.',
        GENERIC_ERROR: (message) => `Error: ${message}`
      },
      
      // Core application state
      store: {
        sections: {
          top: { items: [], status: 'loading', error: '' },
          bottom: { items: [], status: 'loading', error: '' }
        },
        search: { query: '', results: [], status: 'idle', error: '' },
        meta: { loadedAt: null },
        ui: { errorMessage: '', errorTimeout: null }
      },
      
      // UI state
      selectedIndex: -1,
      highlightedQuery: '',
      
      // Caching and performance
      iconCache: new Map(),
      sortedCache: {
        top: null,
        bottom: null,
        topVersion: 0,
        bottomVersion: 0
      },
      controllers: { search: null, searchId: null },
      timers: { search: null },
      
      // Drag and drop state
      dragState: {
        isDragging: false,
        draggedItem: null,
        draggedType: null,
        draggedFrom: null,
        startX: 0,
        startY: 0,
        preview: null,
        previewElement: null // Reusable preview element
      }
    };
  },
  
  computed: {
    // Alphabetically sorted groups with alphabetically sorted bookmarks
    groupedBottomBookmarks() {
      const bookmarks = this.store.sections.bottom.items || [];
      
      // Check if cache is valid
      if (this.sortedCache.bottom && 
          this.sortedCache.bottomVersion === bookmarks.length) {
        return this.sortedCache.bottom;
      }
      
      const grouped = {};
      
      bookmarks.forEach(bookmark => {
        const jsonData = this.parseBookmarkNotes(bookmark.notes);
        const group = jsonData?.group || 'default';
        
        if (!grouped[group]) grouped[group] = [];
        grouped[group].push(bookmark);
      });
      
      // Sort groups and bookmarks alphabetically
      const sorted = {};
      Object.keys(grouped).sort().forEach(key => {
        sorted[key] = grouped[key].sort((a, b) => a.name.localeCompare(b.name));
      });
      
      // Update cache
      this.sortedCache.bottom = sorted;
      this.sortedCache.bottomVersion = bookmarks.length;
      
      return sorted;
    },
    
    // Alphabetically sorted top bookmarks
    sortedTopBookmarks() {
      const items = this.store.sections.top.items || [];
      
      // Check if cache is valid
      if (this.sortedCache.top && 
          this.sortedCache.topVersion === items.length) {
        return this.sortedCache.top;
      }
      
      const sorted = [...items].sort((a, b) => a.name.localeCompare(b.name));
      
      // Update cache
      this.sortedCache.top = sorted;
      this.sortedCache.topVersion = items.length;
      
      return sorted;
    },
    
    // Enhanced search results with highlighting
    searchResults() {
      const query = this.store.search.query.trim();
      if (!query) return [];
      
      this.highlightedQuery = query;
      const normalizedQuery = query.toLowerCase();
      
      return this.store.search.results
        .map(item => ({ item, score: this.calculateScore(normalizedQuery, item) }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
        .map(({ item }) => ({
          ...item,
          highlightedName: this.highlightText(item.name, query),
          highlightedDescription: this.highlightText(item.description, query)
        }));
    }
  },
  
  methods: {
    // ERROR FEEDBACK METHODS
    showError(message, duration = this.CONSTANTS.ERROR_TOAST_DURATION_MS) {
      clearTimeout(this.store.ui.errorTimeout);
      this.store.ui.errorMessage = message;
      if (duration > 0) {
        this.store.ui.errorTimeout = setTimeout(() => {
          this.store.ui.errorMessage = '';
        }, duration);
      }
    },
    
    hideError() {
      clearTimeout(this.store.ui.errorTimeout);
      this.store.ui.errorMessage = '';
    },
    
    // API METHODS
    async apiCall(path, options = {}) {
      const { signal, params, timeout = this.CONSTANTS.API_TIMEOUT_MS, retry = this.CONSTANTS.API_RETRY_COUNT } = options;
      const url = new URL(path, window.location.origin);
      
      if (params) {
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      }
      
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      
      signal?.addEventListener('abort', () => controller.abort(), { once: true });
      
      const attempt = async (retryCount = 0) => {
        try {
          const response = await fetch(url, {
            signal: controller.signal,
            headers: { 'Accept': 'application/json' }
          });
          
          clearTimeout(timer);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          
          return response.json();
        } catch (error) {
          clearTimeout(timer);
          
          if (error.name === 'AbortError' || retryCount >= retry) {
            throw error;
          }
          
          // Retry on network errors
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            await new Promise(resolve => setTimeout(resolve, this.CONSTANTS.SEARCH_DEBOUNCE_MS + Math.random() * 300));
            return attempt(retryCount + 1);
          }
          
          throw error;
        }
      };
      
      return attempt();
    },
    
    async updateBookmark(bookmarkId, data) {
      try {
        const response = await fetch(`/api/bookmarks/${bookmarkId}/`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
          signal: AbortSignal.timeout(this.CONSTANTS.API_TIMEOUT_MS)
        });
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          throw new Error(`Failed to update bookmark: ${response.status}${errorText ? ' - ' + errorText : ''}`);
        }
        
        return response.json();
      } catch (error) {
        this.showError(this.ERROR_MESSAGES.BOOKMARK_UPDATE_FAILED);
        throw error;
      }
    },
    
    // BOOKMARK METHODS
    createBookmark(apiItem) {
      return {
        id: apiItem.id,
        name: apiItem.title || apiItem.url,
        link: apiItem.url,
        icon: this.resolveIcon(apiItem.notes, apiItem.url),
        tags: apiItem.tag_names || [],
        description: apiItem.description || '',
        notes: apiItem.notes || ''
      };
    },
    
    parseBookmarkNotes(notes) {
      if (!notes?.trim()) return null;
      
      try {
        const cleanNotes = notes.replace(/icon::[^\s]+\s*/, '').trim();
        return cleanNotes.startsWith('{') && cleanNotes.endsWith('}') 
          ? JSON.parse(cleanNotes) 
          : null;
      } catch {
        return null;
      }
    },
    
    createBookmarkNotes(section, group, iconUrl) {
      return JSON.stringify({
        section,
        group: group || 'default',
        icon: iconUrl || this.getPlaceholderIcon()
      });
    },
    
    async updateBookmarkNotes(bookmark, section, group, customIconUrl = null) {
      try {
        const currentIcon = customIconUrl || this.extractIconFromNotes(bookmark.notes, bookmark.link);
        const newNotes = this.createBookmarkNotes(section, group, currentIcon);
        
        const updated = await this.updateBookmark(bookmark.id, { notes: newNotes });
        this.updateLocalCache(bookmark.id, updated);
        
        return updated;
      } catch (error) {
        console.error('Failed to update bookmark notes:', error);
        return null;
      }
    },
    
    // ICON METHODS
    resolveIcon(notes, url) {
      const cacheKey = `${notes || ''}__${url || ''}`;
      
      // Check cache and move to end (LRU)
      if (this.iconCache.has(cacheKey)) {
        const value = this.iconCache.get(cacheKey);
        this.iconCache.delete(cacheKey);
        this.iconCache.set(cacheKey, value);
        return value;
      }
      
      let iconUrl = '';
      
      // Try JSON format first
      const jsonData = this.parseBookmarkNotes(notes);
      if (jsonData?.icon) {
        iconUrl = this.validateIconUrl(jsonData.icon, url);
      }
      
      // Fallback to old icon:: format
      if (!iconUrl && notes) {
        const match = notes.match(/icon::([^\s]+)/);
        if (match) {
          iconUrl = this.validateIconUrl(match[1], url);
        }
      }
      
      // Final fallback: domain favicon or placeholder
      if (!iconUrl) {
        iconUrl = this.getFaviconUrl(url) || this.getPlaceholderIcon();
      }
      
      // Evict oldest entry if cache is full
      if (this.iconCache.size >= this.CONSTANTS.ICON_CACHE_MAX_SIZE) {
        const firstKey = this.iconCache.keys().next().value;
        this.iconCache.delete(firstKey);
      }
      
      this.iconCache.set(cacheKey, iconUrl);
      return iconUrl;
    },
    
    validateIconUrl(iconUrl, baseUrl) {
      try {
        const url = new URL(iconUrl, baseUrl);
        return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
      } catch {
        return '';
      }
    },
    
    getFaviconUrl(url) {
      try {
        return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=32`;
      } catch {
        return null;
      }
    },
    
    getPlaceholderIcon() {
      return 'https://placehold.co/32x32/666/fff?text=?';
    },
    
    extractIconFromNotes(notes, url) {
      const jsonData = this.parseBookmarkNotes(notes);
      if (jsonData?.icon) return jsonData.icon;
      
      const match = notes?.match(/icon::([^\s]+)/);
      if (match) return match[1];
      
      return this.getPlaceholderIcon();
    },
    
    handleImageError(event, bookmark) {
      const img = event.target;
      
      if (!img.dataset.fallback1) {
        img.dataset.fallback1 = '1';
        img.src = this.getFaviconUrl(bookmark.link) || this.getPlaceholderIcon();
      } else if (!img.dataset.fallback2) {
        img.dataset.fallback2 = '1';
        img.src = this.getPlaceholderIcon();
      }
    },
    
    // SEARCH METHODS
    calculateScore(query, item) {
      const title = item.name.toLowerCase();
      const desc = (item.description || '').toLowerCase();
      const tags = (item.tags || []).join(' ').toLowerCase();
      const host = this.getHostname(item.link);
      
      if (title === query) return 1000;
      if (title.startsWith(query)) return 500;
      
      let score = 0;
      if (title.includes(query)) score += 120;
      if (host.includes(query)) score += 80;
      if (tags.includes(query)) score += 40;
      if (desc.includes(query)) score += 20;
      
      return score;
    },
    
    getHostname(url) {
      try {
        return new URL(url).hostname.toLowerCase();
      } catch {
        return '';
      }
    },
    
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    },
    
    isSafeUrl(url) {
      try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
      } catch {
        return false;
      }
    },
    
    highlightText(text, query) {
      if (!query?.trim() || !text) return text;
      
      // Escape HTML first to prevent XSS
      const escaped = this.escapeHtml(text);
      
      try {
        return query.split(' ')
          .filter(Boolean)
          .reduce((result, word) => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            return result.replace(
              new RegExp(`(${escapedWord})`, 'gi'),
              '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>'
            );
          }, escaped);
      } catch {
        return escaped;
      }
    },
    
    async searchBookmarks(query) {
      const normalizedQuery = query.trim().toLowerCase();
      
      if (normalizedQuery.length < this.CONSTANTS.SEARCH_MIN_LENGTH) {
        this.store.search = { query: '', results: [], status: 'idle', error: '' };
        return;
      }
      
      // Cancel previous search
      this.controllers.search?.abort();
      
      const controller = new AbortController();
      const searchId = Date.now(); // Unique search identifier
      this.controllers.search = controller;
      this.controllers.searchId = searchId;
      
      this.store.search.status = 'loading';
      this.store.search.error = '';
      
      try {
        const data = await this.apiCall('/api/bookmarks/', {
          params: { limit: String(this.CONSTANTS.BOOKMARK_LIMIT_PER_PAGE), q: normalizedQuery },
          signal: controller.signal
        });
        
        // Only update if this is still the current search
        if (this.controllers.searchId !== searchId) {
          return;
        }
        
        const results = (data?.results || []).map(item => this.createBookmark(item));
        this.store.search.results = results;
        
        if (results.length <= 20) {
          this.preloadIcons(results);
        }
        
        this.store.search.status = 'success';
        this.store.meta.loadedAt = new Date().toISOString();
      } catch (error) {
        if (error.name === 'AbortError' || this.controllers.searchId !== searchId) {
          return;
        }
        
        this.store.search.results = [];
        this.store.search.status = 'error';
        this.store.search.error = error.message || this.ERROR_MESSAGES.SEARCH_FAILED;
      } finally {
        if (this.controllers.searchId === searchId) {
          this.controllers.search = null;
        }
      }
    },
    
    // LOADING METHODS
    async fetchBookmarksByTag(tag) {
      try {
        const tagName = tag.replace('#', '');
        let allBookmarks = [];
        let nextUrl = `/api/bookmarks/?limit=100&q=${encodeURIComponent(`#${tagName}`)}`;
        
        // Fetch all pages of bookmarks
        while (nextUrl) {
          const data = await this.apiCall(nextUrl);
          const bookmarks = (data?.results || [])
            .filter(item => item.tag_names?.includes(tagName))
            .map(item => this.createBookmark(item));
          
          allBookmarks.push(...bookmarks);
          
          // Check if there's a next page
          nextUrl = data?.next ? new URL(data.next).pathname + new URL(data.next).search : null;
        }
        
        return allBookmarks;
      } catch (error) {
        console.error(`Failed to fetch bookmarks for tag ${tag}:`, error);
        return [];
      }
    },
    
    async loadAllBookmarks() {
      const maxRetries = this.CONSTANTS.RETRY_MAX_ATTEMPTS;
      let attempt = 0;
      
      while (attempt < maxRetries) {
        try {
          // Fetch all bookmarks with the 'startpage' tag
          const allBookmarks = await this.fetchBookmarksByTag('#startpage');
          
          // Organize by JSON data (section property determines top/bottom)
          const top = [];
          const bottom = [];
          
          allBookmarks.forEach(bookmark => {
            const jsonData = this.parseBookmarkNotes(bookmark.notes);
            
            if (jsonData?.section === 'top') {
              top.push(bookmark);
            } else if (jsonData?.section === 'bottom') {
              bottom.push(bookmark);
            } else {
              // Default fallback: put in bottom section if no JSON data
              bottom.push(bookmark);
            }
          });
          
          this.store.sections.top.items = top;
          this.store.sections.bottom.items = bottom;
          this.store.sections.top.status = 'success';
          this.store.sections.bottom.status = 'success';
          return; // Success, exit
          
        } catch (error) {
          attempt++;
          console.error(`Failed to load bookmarks (attempt ${attempt}/${maxRetries}):`, error);
          
          if (attempt >= maxRetries) {
            this.store.sections.top.status = 'error';
            this.store.sections.bottom.status = 'error';
            this.store.sections.top.error = this.ERROR_MESSAGES.BOOKMARK_LOAD_FAILED(maxRetries);
            this.store.sections.bottom.error = error.message;
            this.showError(this.ERROR_MESSAGES.BOOKMARK_LOAD_FAILED(maxRetries), this.CONSTANTS.ERROR_TOAST_DURATION_MS * 2);
          } else {
            // Wait before retry with exponential backoff
            await new Promise(resolve => setTimeout(resolve, this.CONSTANTS.RETRY_BASE_DELAY_MS * attempt));
          }
        }
      }
    },
    
    preloadIcons(bookmarks, limit = this.CONSTANTS.ICON_PRELOAD_LIMIT) {
      const loadIcon = (url) => {
        const img = new Image();
        img.src = url;
      };
      
      // Load first batch immediately
      bookmarks.slice(0, limit).forEach(b => loadIcon(b.icon));
      
      // Load rest when idle
      const remaining = bookmarks.slice(limit);
      if (remaining.length) {
        const loadRemaining = () => remaining.forEach(b => loadIcon(b.icon));
        
        'requestIdleCallback' in window 
          ? requestIdleCallback(loadRemaining)
          : setTimeout(loadRemaining, this.CONSTANTS.ICON_PRELOAD_DELAY_MS);
      }
    },
    
    updateLocalCache(bookmarkId, updatedData) {
      const updated = this.createBookmark(updatedData);
      
      // Use indexed lookup instead of iteration
      const sections = ['top', 'bottom'];
      for (const section of sections) {
        const items = this.store.sections[section].items;
        const index = items.findIndex(b => b.id === bookmarkId);
        if (index !== -1) {
          items.splice(index, 1, updated);
          break; // Bookmark can only be in one section
        }
      }
      
      // Update search results if present
      const searchIndex = this.store.search.results.findIndex(b => b.id === bookmarkId);
      if (searchIndex !== -1) {
        this.store.search.results.splice(searchIndex, 1, updated);
      }
      
      // Clear only relevant icon cache entries
      const oldNotes = updatedData.notes || '';
      const newKey = `${oldNotes}__${updatedData.url || ''}`;
      this.iconCache.delete(newKey);
      
      // Also try to clear the old key if notes changed
      if (updatedData.notes) {
        const altKey = `__${updatedData.url || ''}`;
        this.iconCache.delete(altKey);
      }
      
      // Invalidate sort cache
      this.sortedCache.top = null;
      this.sortedCache.bottom = null;
    },
    
    // DRAG AND DROP METHODS
    onMouseDown(event, item, type, from) {
      // Only handle left-clicks for drag operations
      // Let middle-clicks and right-clicks use native browser behavior
      if (event.button !== 0) {
        return;
      }
      
      // Prevent default link behavior for draggable links (left-click only)
      event.preventDefault();
      
      this.dragState = {
        ...this.dragState,
        startX: event.clientX,
        startY: event.clientY,
        draggedItem: item,
        draggedType: type,
        draggedFrom: from
      };
      
      document.addEventListener('mousemove', this.onMouseMove);
      document.addEventListener('mouseup', this.onMouseUp);
    },
    
    onMouseMove(event) {
      if (!this.dragState.draggedItem) return;
      
      const deltaX = Math.abs(event.clientX - this.dragState.startX);
      const deltaY = Math.abs(event.clientY - this.dragState.startY);
      
      if (!this.dragState.isDragging && (deltaX > this.CONSTANTS.DRAG_THRESHOLD_PX || deltaY > this.CONSTANTS.DRAG_THRESHOLD_PX)) {
        this.startDrag(event);
      }
      
      if (this.dragState.isDragging) {
        this.updateDragPreview(event.clientX, event.clientY);
      }
    },
    
    onMouseUp(event) {
      if (this.dragState.isDragging) {
        this.handleDrop(event);
      } else if (this.dragState.draggedType === 'bookmark') {
        // Just a click - navigate
        const link = this.dragState.draggedItem.link;
        if (this.isSafeUrl(link)) {
          window.location.href = link;
        } else {
          console.error('Unsafe URL blocked:', link);
        }
      }
      
      this.cleanupDrag();
    },
    
    startDrag(event) {
      this.dragState.isDragging = true;
      this.createDragPreview(event.clientX, event.clientY);
      document.body.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';
    },
    
    createDragPreview(x, y) {
      // Reuse existing preview if available
      if (!this.dragState.previewElement) {
        const preview = document.createElement('div');
        preview.className = 'drag-preview';
        this.dragState.previewElement = preview;
        document.body.appendChild(preview);
      }
      
      const preview = this.dragState.previewElement;
      const item = this.dragState.draggedItem;
      
      preview.innerHTML = `
        <div class="drag-preview-content">
          <img src="${item.icon}" alt="${item.name}" class="drag-preview-icon">
          <span class="drag-preview-text">${item.name}</span>
        </div>
      `;
      
      preview.style.display = 'block';
      preview.style.left = (x + 10) + 'px';
      preview.style.top = (y + 10) + 'px';
      this.dragState.preview = preview;
    },
    
    updateDragPreview(x, y) {
      if (this.dragState.preview) {
        this.dragState.preview.style.left = (x + 10) + 'px';
        this.dragState.preview.style.top = (y + 10) + 'px';
      }
    },
    
    handleDrop(event) {
      if (this.dragState.preview) this.dragState.preview.style.display = 'none';
      const target = document.elementFromPoint(event.clientX, event.clientY);
      if (this.dragState.preview) this.dragState.preview.style.display = 'block';
      
      if (this.dragState.draggedType === 'bookmark') {
        this.handleBookmarkDrop(target);
      }
    },
    
    handleBookmarkDrop(target) {
      const actionElement = target.closest('[data-action]');
      const groupElement = target.closest('[data-group]');
      
      if (actionElement?.dataset.action === '__UPDATE_ICON__') {
        this.updateBookmarkIcon();
        return;
      }
      
      if (groupElement) {
        const targetGroup = groupElement.dataset.group;
        
        if (targetGroup === '__NEW_GROUP__') {
          this.createNewGroup();
        } else {
          this.moveBookmarkToGroup(targetGroup);
        }
      }
    },
    
    async moveBookmarkToGroup(targetGroup) {
      const bookmark = this.dragState.draggedItem;
      const fromGroup = this.dragState.draggedFrom;
      
      if (fromGroup === targetGroup) return;
      
      // Determine sections based on target group
      const fromSection = fromGroup === 'startpage-top' ? 'top' : 'bottom';
      const toSection = targetGroup === 'startpage-top' ? 'top' : 'bottom';
      
      // Update local state (keep original bookmark data)
      const updatedBookmark = { ...bookmark };
      
      // Remove from source
      const fromItems = this.store.sections[fromSection].items;
      const fromIndex = fromItems.findIndex(b => b.id === bookmark.id);
      if (fromIndex !== -1) fromItems.splice(fromIndex, 1);
      
      // Add to target
      this.store.sections[toSection].items.push(updatedBookmark);
      
      // Update API with JSON notes (this is now the primary way to track sections/groups)
      await this.updateBookmarkNotes(updatedBookmark, toSection, targetGroup);
      this.$forceUpdate();
    },
    
    async createNewGroup() {
      const bookmark = this.dragState.draggedItem;
      if (!bookmark) return;
      
      const groupName = prompt('Enter new group name:', '');
      if (!groupName?.trim()) return;
      
      const cleanGroupName = groupName.trim().toLowerCase().replace(/\s+/g, '-');
      
      // Check if group exists
      const existingGroups = Object.keys(this.groupedBottomBookmarks);
      if (existingGroups.includes(cleanGroupName)) {
        alert(`Group "${cleanGroupName}" already exists. Moving bookmark to existing group.`);
      }
      
      await this.moveBookmarkToGroup(cleanGroupName);
      this.$nextTick(() => this.$forceUpdate());
    },
    
    async updateBookmarkIcon() {
      const bookmark = this.dragState.draggedItem;
      if (!bookmark) return;
      
      const iconUrl = prompt('Enter icon URL:', '');
      if (!iconUrl?.trim()) return;
      
      const cleanIconUrl = iconUrl.trim();
      
      // Validate URL
      try {
        const parsed = new URL(cleanIconUrl);
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          this.showError(this.ERROR_MESSAGES.INVALID_URL, this.CONSTANTS.ERROR_TOAST_DURATION_MS);
          return;
        }
      } catch {
        this.showError(this.ERROR_MESSAGES.INVALID_URL, this.CONSTANTS.ERROR_TOAST_DURATION_MS);
        return;
      }
      
      // Show loading state
      this.showError(this.ERROR_MESSAGES.ICON_UPDATE_LOADING, this.CONSTANTS.LOADING_TOAST_DURATION_MS);
      
      try {
        // Get current data
        const currentData = this.parseBookmarkNotes(bookmark.notes) || {};
        const section = currentData.section || 'bottom'; // Default to bottom if no section specified
        const group = currentData.group || 'default';
        
        // Update with new icon
        const result = await this.updateBookmarkNotes(bookmark, section, group, cleanIconUrl);
        
        if (result) {
          this.hideError();
          this.showError(this.ERROR_MESSAGES.ICON_UPDATE_SUCCESS(bookmark.name), this.CONSTANTS.SUCCESS_TOAST_DURATION_MS);
          this.$forceUpdate();
        } else {
          this.showError(this.ERROR_MESSAGES.ICON_UPDATE_FAILED, this.CONSTANTS.ERROR_TOAST_DURATION_MS);
        }
      } catch (error) {
        this.showError(this.ERROR_MESSAGES.GENERIC_ERROR(error.message), this.CONSTANTS.ERROR_TOAST_DURATION_MS);
      }
    },
    
    cleanupDrag() {
      if (this.dragState.preview) {
        this.dragState.preview.style.display = 'none';
        // Don't remove from DOM, just hide it for reuse
      }
      
      document.removeEventListener('mousemove', this.onMouseMove);
      document.removeEventListener('mouseup', this.onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      
      this.dragState = {
        isDragging: false,
        draggedItem: null,
        draggedType: null,
        draggedFrom: null,
        startX: 0,
        startY: 0,
        preview: null,
        previewElement: this.dragState.previewElement // Keep reusable element
      };
    },
    
    // KEYBOARD NAVIGATION
    handleKeydown(event) {
      const bookmarks = this.searchResults;
      
      const actions = {
        ArrowDown: () => {
          if (bookmarks.length) {
            this.selectedIndex = (this.selectedIndex + 1) % bookmarks.length;
          }
        },
        ArrowUp: () => {
          if (bookmarks.length) {
            this.selectedIndex = (this.selectedIndex - 1 + bookmarks.length) % bookmarks.length;
          }
        },
        Enter: () => {
          const target = bookmarks[this.selectedIndex] || bookmarks[0];
          if (target && (bookmarks.length === 1 || this.selectedIndex >= 0)) {
            if (this.isSafeUrl(target.link)) {
              window.location.href = target.link;
            } else {
              console.error('Unsafe URL blocked:', target.link);
            }
          }
        },
        Escape: () => {
          this.store.search.query = '';
          this.selectedIndex = -1;
          this.$nextTick(() => this.$refs.searchInput?.focus());
        }
      };
      
      // Handle Ctrl+J (down) and Ctrl+K (up) shortcuts
      if (event.ctrlKey && event.key === 'j') {
        event.preventDefault();
        if (bookmarks.length) {
          this.selectedIndex = (this.selectedIndex + 1) % bookmarks.length;
        }
        return;
      }
      
      if (event.ctrlKey && event.key === 'k') {
        event.preventDefault();
        if (bookmarks.length) {
          this.selectedIndex = (this.selectedIndex - 1 + bookmarks.length) % bookmarks.length;
        }
        return;
      }
      
      if (actions[event.key]) {
        actions[event.key]();
      }
    },
    
    // UTILITY METHODS
  },
  
  watch: {
    'store.search.query'(newQuery) {
      this.selectedIndex = -1;
      clearTimeout(this.timers.search);
      this.timers.search = setTimeout(() => this.searchBookmarks(newQuery), this.CONSTANTS.SEARCH_DEBOUNCE_MS);
    }
  },
  
  async mounted() {
    window.addEventListener('keydown', this.handleKeydown);
    this.$nextTick(() => this.$refs.searchInput?.focus());
    
    await this.loadAllBookmarks();
  },
  
  beforeUnmount() {
    window.removeEventListener('keydown', this.handleKeydown);
    clearTimeout(this.timers.search);
    if (this.controllers.search) this.controllers.search.abort();
    if (this.dragState.isDragging) this.cleanupDrag();
    
    // Clean up drag preview element on component unmount
    if (this.dragState.previewElement) {
      document.body.removeChild(this.dragState.previewElement);
    }
  }
}).mount('#app');