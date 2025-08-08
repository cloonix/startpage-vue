const app = Vue.createApp({
    data() {
        return {
            searchQuery: '',
            bookmarks: [],
            staticBookmarksBottom: [],
            staticBookmarksTop: [],
            selectedIndex: -1,
            isLoading: false,
            isLoadingTop: true,
            isLoadingBottom: true,
            isSearching: false,
            errorMessage: '',
            searchResults: [],
            highlightedQuery: '',
            iconCache: new Map()
        };
    },
    computed: {
        // Simplified search with basic relevance scoring
        filteredBookmarks() {
            if (!this.searchQuery.trim()) return this.bookmarks;
            
            const query = this.searchQuery.toLowerCase();
            this.highlightedQuery = this.searchQuery;
            
            return this.bookmarks.filter(bookmark => {
                const title = bookmark.name.toLowerCase();
                const tags = bookmark.tags?.join(' ').toLowerCase() || '';
                const desc = bookmark.description?.toLowerCase() || '';
                return title.includes(query) || tags.includes(query) || desc.includes(query);
            }).sort((a, b) => {
                const titleA = a.name.toLowerCase();
                const titleB = b.name.toLowerCase();
                // Prioritize exact matches, then starts-with, then alphabetical
                const exactA = titleA === query ? 1000 : titleA.startsWith(query) ? 100 : 1;
                const exactB = titleB === query ? 1000 : titleB.startsWith(query) ? 100 : 1;
                return exactB - exactA || titleA.localeCompare(titleB);
            });
        },
        // Groups and sorts static bookmarks for the bottom section by tags
        groupedStaticBookmarksBottom() {
            const bookmarks = this.validateArray(this.staticBookmarksBottom);
            const grouped = bookmarks.reduce((groups, bookmark) => {
                bookmark.tags?.forEach(tag => {
                    if (tag !== 'startpage-bottom') {
                        (groups[tag] = groups[tag] || []).push(bookmark);
                    }
                });
                return groups;
            }, {});
            
            return Object.keys(grouped).sort().reduce((result, tag) => {
                result[tag] = grouped[tag].sort(this.sortByName);
                return result;
            }, {});
        },
        // Returns sorted static bookmarks for the top section
        sortedStaticBookmarksTop() {
            return this.validateArray(this.staticBookmarksTop).sort(this.sortByName);
        },
        
        // Enhanced filtered bookmarks with highlighting
        enhancedFilteredBookmarks() {
            return this.filteredBookmarks.map(bookmark => ({
                ...bookmark,
                highlightedName: this.highlightText(bookmark.name, this.highlightedQuery),
                highlightedDescription: this.highlightText(bookmark.description, this.highlightedQuery)
            }));
        }
    },
    methods: {
        // Array validation helper
        validateArray(arr) {
            return arr && Array.isArray(arr) ? arr : [];
        },
        // Helper method to sort bookmarks alphabetically by name
        sortByName(a, b) {
            return a.name.localeCompare(b.name);
        },
        // Common API fetch method
        async fetchAPI(params) {
            const queryString = new URLSearchParams(params).toString();
            const response = await fetch(`/api/bookmarks/?${queryString}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json' }
            });
            
            if (!response.ok) {
                throw new Error(`API request failed: ${response.statusText}`);
            }
            
            return response.json();
        },
        
        // Extract icon from notes field with favicon fallback and caching
        extractIcon(notes, url) {
            const cacheKey = `${notes || ''}_${url || ''}`;
            if (this.iconCache.has(cacheKey)) {
                return this.iconCache.get(cacheKey);
            }
            
            let iconUrl;
            if (notes) {
                const iconMatch = notes.match(/icon::(.+?)(?:\s|$)/);
                if (iconMatch?.[1]?.trim()) {
                    iconUrl = iconMatch[1].trim();
                    this.iconCache.set(cacheKey, iconUrl);
                    return iconUrl;
                }
            }
            
            // Favicon fallback
            if (url) {
                try {
                    const domain = new URL(url).hostname;
                    iconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=24`;
                } catch {
                    iconUrl = 'https://placehold.co/24x24';
                }
            } else {
                iconUrl = 'https://placehold.co/24x24';
            }
            
            this.iconCache.set(cacheKey, iconUrl);
            return iconUrl;
        },
        
        // Highlight matching text (for use in computed properties)
        highlightText(text, query) {
            if (!query.trim() || !text) return text;
            
            try {
                const words = query.split(' ').filter(word => word.length > 0);
                let result = text;
                
                words.forEach(word => {
                    const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')})`, 'gi');
                    result = result.replace(regex, '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>');
                });
                
                return result;
            } catch {
                return text;
            }
},
        
        // Fetches static bookmarks from Linkding API
        async fetchStaticBookmarks(searchTerm, isTopSection = false) {
            try {
                const tagName = searchTerm.replace('#', '');
                const data = await this.fetchAPI({ limit: '50', q: `#${tagName}` });
                
                const bookmarks = data?.results
                    ?.filter(item => item.tag_names?.includes(tagName))
                    ?.map(item => ({
                        id: item.id,
                        name: item.title || item.url,
                        link: item.url,
                        icon: this.extractIcon(item.notes, item.url),
                        tags: item.tag_names || []
                    })) || [];
                
                this.preloadIcons(bookmarks);
                return bookmarks;
            } catch (error) {
                console.error('Failed to load static bookmarks:', error);
                return [];
            } finally {
                if (isTopSection) this.isLoadingTop = false;
                else this.isLoadingBottom = false;
            }
        },
        
        // Preload icons for better performance
        preloadIcons(bookmarks, limit = 8) {
            bookmarks.slice(0, limit).forEach(bookmark => {
                const img = new Image();
                img.src = bookmark.icon;
            });
        },
        
        // Enhanced bookmark fetching with better error handling
        async fetchBookmarks(query = '') {
            try {
                this.isSearching = !!query;
                this.errorMessage = '';
                
                const params = { limit: query ? '50' : '100' };
                if (query) params.q = query;
                
                const data = await this.fetchAPI(params);
                const bookmarks = data?.results?.map(item => ({
                    id: item.id,
                    name: item.title || item.url,
                    link: item.url,
                    icon: this.extractIcon(item.notes, item.url),
                    tags: item.tag_names || [],
                    description: item.description || ''
                })) || [];
                
                this.bookmarks = bookmarks;
                if (query && bookmarks.length <= 20) this.preloadIcons(bookmarks);
                if (query && !bookmarks.length) this.errorMessage = `No bookmarks found for "${query}"`;
                
            } catch (error) {
                console.error('Fetch error:', error);
                this.errorMessage = error.message.includes('Failed to fetch') 
                    ? 'Unable to connect to Linkding server. Please check your connection.'
                    : error.message.includes('40') ? 'Authentication failed. Please check your API token.'
                    : `Failed to load bookmarks: ${error.message}`;
                this.bookmarks = [];
            } finally {
                this.isSearching = false;
            }
        },
        // Handles keyboard navigation and actions for the search results
        handleKeydown(event) {
            const bookmarkList = this.searchQuery ? this.enhancedFilteredBookmarks : [];
            
            if (event.key === 'ArrowDown' && bookmarkList.length) {
                this.selectedIndex = (this.selectedIndex + 1) % bookmarkList.length;
            } else if (event.key === 'ArrowUp' && bookmarkList.length) {
                this.selectedIndex = (this.selectedIndex - 1 + bookmarkList.length) % bookmarkList.length;
            } else if (event.key === 'Enter') {
                if (bookmarkList.length === 1 || this.selectedIndex >= 0) {
                    const link = bookmarkList[this.selectedIndex]?.link || bookmarkList[0]?.link;
                    if (link) window.location.href = link;
                }
            } else if (event.key === 'Escape') {
                this.searchQuery = '';
                this.selectedIndex = -1;
                this.$nextTick(() => {
                    this.$refs.searchInput?.focus();
                });
            }
        }
    },
    watch: {
        // Debounced search with optimized timing
        searchQuery(newQuery) {
            this.selectedIndex = -1;
            clearTimeout(this.searchTimeout);
            
            this.searchTimeout = setTimeout(() => {
                this.fetchBookmarks(newQuery.length >= 2 ? newQuery : '');
            }, 200);
        }
    },
    async mounted() {
        // Set up event listeners and focus immediately
        window.addEventListener('keydown', this.handleKeydown);
        this.$nextTick(() => this.$refs.searchInput?.focus());
        
        // Load top section first (most important)
        this.fetchStaticBookmarks('#startpage-top', true)
            .then(bookmarks => {
                this.staticBookmarksTop = bookmarks;
            });
        
        // Load bottom section after a short delay
        setTimeout(() => {
            this.fetchStaticBookmarks('#startpage-bottom', false)
                .then(bookmarks => {
                    this.staticBookmarksBottom = bookmarks;
                });
        }, 100);
        
        // Load search bookmarks in background after sections are loaded
        setTimeout(() => {
            this.fetchBookmarks();
        }, 200);
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKeydown);
        clearTimeout(this.searchTimeout);
    }
});

app.mount('#app');