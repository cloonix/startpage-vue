const { createApp } = Vue;

createApp({
  data() {
    return {
      // Core application state
      store: {
        sections: {
          top: { items: [], status: 'loading', error: '' },
          bottom: { items: [], status: 'loading', error: '' }
        },
        search: { query: '', results: [], status: 'idle', error: '' },
        meta: { loadedAt: null }
      },
      
      // UI state
      selectedIndex: -1,
      highlightedQuery: '',
      
      // Caching and performance
      iconCache: new Map(),
      controllers: { search: null },
      timers: { search: null },
      
      // Drag and drop state
      dragState: {
        isDragging: false,
        draggedItem: null,
        draggedType: null,
        draggedFrom: null,
        startX: 0,
        startY: 0,
        preview: null
      }
    };
  },
  
  computed: {
    // Alphabetically sorted groups with alphabetically sorted bookmarks
    groupedBottomBookmarks() {
      const bookmarks = this.store.sections.bottom.items || [];
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
      
      return sorted;
    },
    
    // Alphabetically sorted top bookmarks
    sortedTopBookmarks() {
      return [...(this.store.sections.top.items || [])]
        .sort((a, b) => a.name.localeCompare(b.name));
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
    // API METHODS
    async apiCall(path, options = {}) {
      const { signal, params, timeout = 10000, retry = 1 } = options;
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
            await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
            return attempt(retryCount + 1);
          }
          
          throw error;
        }
      };
      
      return attempt();
    },
    
    async updateBookmark(bookmarkId, data) {
      const response = await fetch(`/api/bookmarks/${bookmarkId}/`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update bookmark: ${response.status}`);
      }
      
      return response.json();
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
      if (this.iconCache.has(cacheKey)) {
        return this.iconCache.get(cacheKey);
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
      
      if (normalizedQuery.length < 2) {
        this.store.search = { query: '', results: [], status: 'idle', error: '' };
        return;
      }
      
      this.controllers.search?.abort();
      
      const controller = new AbortController();
      this.controllers.search = controller;
      this.store.search.status = 'loading';
      this.store.search.error = '';
      
      try {
        const data = await this.apiCall('/api/bookmarks/', {
          params: { limit: '100', q: normalizedQuery },
          signal: controller.signal
        });
        
        const results = (data?.results || []).map(item => this.createBookmark(item));
        this.store.search.results = results;
        
        if (results.length <= 20) {
          this.preloadIcons(results);
        }
        
        this.store.search.status = 'success';
        this.store.meta.loadedAt = new Date().toISOString();
      } catch (error) {
        if (error.name === 'AbortError') return;
        
        this.store.search.results = [];
        this.store.search.status = 'error';
        this.store.search.error = error.message || 'Search failed';
      } finally {
        if (this.controllers.search === controller) {
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
      } catch (error) {
        console.error('Failed to load bookmarks:', error);
        this.store.sections.top.status = 'error';
        this.store.sections.bottom.status = 'error';
      }
    },
    
    preloadIcons(bookmarks, limit = 8) {
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
          : setTimeout(loadRemaining, 150);
      }
    },
    
    updateLocalCache(bookmarkId, updatedData) {
      ['top', 'bottom'].forEach(section => {
        const items = this.store.sections[section].items;
        const index = items.findIndex(b => b.id === bookmarkId);
        
        if (index !== -1) {
          const updated = this.createBookmark(updatedData);
          items.splice(index, 1, updated);
        }
      });
      
      // Update search results if present
      const searchIndex = this.store.search.results.findIndex(b => b.id === bookmarkId);
      if (searchIndex !== -1) {
        const updated = this.createBookmark(updatedData);
        this.store.search.results.splice(searchIndex, 1, updated);
      }
      
      // Clear icon cache
      this.iconCache.forEach((value, key) => {
        if (key.includes(bookmarkId) || key.includes(updatedData.url)) {
          this.iconCache.delete(key);
        }
      });
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
      
      if (!this.dragState.isDragging && (deltaX > 5 || deltaY > 5)) {
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
      const preview = document.createElement('div');
      preview.className = 'drag-preview';
      const item = this.dragState.draggedItem;
      
      preview.innerHTML = `
        <div class="drag-preview-content">
          <img src="${item.icon}" alt="${item.name}" class="drag-preview-icon">
          <span class="drag-preview-text">${item.name}</span>
        </div>
      `;
      
      preview.style.left = (x + 10) + 'px';
      preview.style.top = (y + 10) + 'px';
      document.body.appendChild(preview);
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
        new URL(cleanIconUrl);
      } catch {
        alert('Please enter a valid URL (must start with http:// or https://)');
        return;
      }
      
      // Get current data
      const currentData = this.parseBookmarkNotes(bookmark.notes) || {};
      const section = currentData.section || 'bottom'; // Default to bottom if no section specified
      const group = currentData.group || 'default';
      
      // Update with new icon
      const result = await this.updateBookmarkNotes(bookmark, section, group, cleanIconUrl);
      if (result) {
        console.log(`Updated icon for ${bookmark.name}`);
        this.$forceUpdate();
      } else {
        alert('Failed to update icon. Please try again.');
      }
    },
    
    cleanupDrag() {
      if (this.dragState.preview) {
        document.body.removeChild(this.dragState.preview);
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
        preview: null
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
      this.timers.search = setTimeout(() => this.searchBookmarks(newQuery), 200);
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
  }
}).mount('#app');