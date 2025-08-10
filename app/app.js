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
        // Create bookmark object from API response
        createBookmark(item) {
            return {
                id: item.id,
                name: item.title || item.url,
                link: item.url,
                icon: this.extractIcon(item.notes, item.url),
                tags: item.tag_names || [],
                description: item.description || ''
            };
        },

        // Handle API errors with user-friendly messages
        handleError(error, context = 'bookmarks') {
            console.error(`Failed to load ${context}:`, error);
            const message = error.message.includes('Failed to fetch') 
                ? 'Unable to connect to server. Please check your connection.'
                : error.message.includes('40') ? 'Authentication failed. Please check your API token.'
                : `Failed to load ${context}: ${error.message}`;
            if (context === 'bookmarks') this.errorMessage = message;
        },

        // Fetch bookmarks from API
        async fetchFromAPI(params) {
            const response = await fetch(`/api/bookmarks/?${new URLSearchParams(params)}`);
            if (!response.ok) throw new Error(`API request failed: ${response.statusText}`);
            return response.json();
        },
        
        // Extract icon with caching and fallback
        extractIcon(notes, url) {
            const cacheKey = `${notes || ''}_${url || ''}`;
            if (this.iconCache.has(cacheKey)) return this.iconCache.get(cacheKey);
            
            // Check for custom icon in notes
            const iconMatch = notes?.match(/icon::(.+?)(?:\s|$)/);
            let iconUrl = iconMatch?.[1]?.trim();
            
            if (!iconUrl && url) {
                try {
                    iconUrl = `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=24`;
                } catch {
                    iconUrl = 'https://placehold.co/24x24';
                }
            } else if (!iconUrl) {
                iconUrl = 'https://placehold.co/24x24';
            }
            
            this.iconCache.set(cacheKey, iconUrl);
            return iconUrl;
        },
        
        // Highlight matching text
        highlightText(text, query) {
            if (!query?.trim() || !text) return text;
            
            try {
                return query.split(' ')
                    .filter(word => word.length > 0)
                    .reduce((result, word) => {
                        const escaped = word.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
                        return result.replace(new RegExp(`(${escaped})`, 'gi'), 
                            '<mark class="bg-yellow-200 dark:bg-yellow-800 px-1 rounded">$1</mark>');
                    }, text);
            } catch {
                return text;
            }
        },
        
        // Fetch static bookmarks by tag
        async fetchStaticBookmarks(tag, isTopSection = false) {
            try {
                const tagName = tag.replace('#', '');
                const data = await this.fetchFromAPI({ limit: '50', q: `#${tagName}` });
                const bookmarks = data?.results
                    ?.filter(item => item.tag_names?.includes(tagName))
                    ?.map(item => this.createBookmark(item)) || [];
                
                this.preloadIcons(bookmarks);
                return bookmarks;
            } catch (error) {
                this.handleError(error, 'static bookmarks');
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
        
        // Fetch all bookmarks with search support - only when query is provided
        async fetchBookmarks(query = '') {
            if (!query.trim()) {
                this.bookmarks = [];
                this.errorMessage = '';
                return;
            }
            
            try {
                this.isSearching = true;
                this.errorMessage = '';
                
                const params = { limit: '50', q: query };
                
                const data = await this.fetchFromAPI(params);
                const bookmarks = data?.results?.map(item => this.createBookmark(item)) || [];
                
                this.bookmarks = bookmarks;
                if (bookmarks.length <= 20) this.preloadIcons(bookmarks);
                if (!bookmarks.length) this.errorMessage = `No bookmarks found for "${query}"`;
                
            } catch (error) {
                this.handleError(error);
                this.bookmarks = [];
            } finally {
                this.isSearching = false;
            }
        },
        // Handle keyboard navigation
        handleKeydown(event) {
            const bookmarks = this.searchQuery ? this.enhancedFilteredBookmarks : [];
            const actions = {
                ArrowDown: () => bookmarks.length && (this.selectedIndex = (this.selectedIndex + 1) % bookmarks.length),
                ArrowUp: () => bookmarks.length && (this.selectedIndex = (this.selectedIndex - 1 + bookmarks.length) % bookmarks.length),
                Enter: () => {
                    const link = bookmarks[this.selectedIndex]?.link || bookmarks[0]?.link;
                    if (link && (bookmarks.length === 1 || this.selectedIndex >= 0)) {
                        window.location.href = link;
                    }
                },
                Escape: () => {
                    this.searchQuery = '';
                    this.selectedIndex = -1;
                    this.$nextTick(() => this.$refs.searchInput?.focus());
                }
            };
            actions[event.key]?.();
        }
    },
    watch: {
        // Debounced search with optimized timing
        searchQuery(newQuery) {
            this.selectedIndex = -1;
            clearTimeout(this.searchTimeout);
            
            this.searchTimeout = setTimeout(() => {
                if (newQuery.length >= 2) {
                    this.fetchBookmarks(newQuery);
                } else {
                    this.bookmarks = [];
                    this.errorMessage = '';
                }
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
        
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKeydown);
        clearTimeout(this.searchTimeout);
    }
});

app.mount('#app');