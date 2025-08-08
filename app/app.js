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
        // Enhanced search with fuzzy matching and highlighting
        filteredBookmarks() {
            if (!this.searchQuery.trim()) {
                return this.bookmarks;
            }
            
            this.highlightedQuery = this.searchQuery;
            const query = this.searchQuery.toLowerCase();
            const queryWords = query.split(' ');
            
            // Enhanced filter with fuzzy search
            const scoredBookmarks = this.bookmarks.filter(bookmark => {
                const titleMatch = this.fuzzySearch(bookmark.name, query) || 
                                 queryWords.some(word => bookmark.name.toLowerCase().includes(word));
                const tagMatch = bookmark.tags && bookmark.tags.some(tag => 
                    this.fuzzySearch(tag, query) || queryWords.some(word => tag.toLowerCase().includes(word))
                );
                const descMatch = bookmark.description && this.fuzzySearch(bookmark.description, query);
                
                return titleMatch || tagMatch || descMatch;
            }).map(bookmark => {
                // Enhanced scoring
                let score = 0;
                const title = bookmark.name.toLowerCase();
                
                queryWords.forEach(word => {
                    if (title === word) score += 200; // Exact match
                    else if (title.startsWith(word)) score += 150; // Starts with
                    else if (title.includes(word)) score += 100; // Contains
                    else if (this.fuzzySearch(bookmark.name, word)) score += 50; // Fuzzy match
                    
                    // Tag matches
                    if (bookmark.tags) {
                        bookmark.tags.forEach(tag => {
                            const tagLower = tag.toLowerCase();
                            if (tagLower === word) score += 80;
                            else if (tagLower.includes(word)) score += 30;
                            else if (this.fuzzySearch(tag, word)) score += 15;
                        });
                    }
                    
                    // Description matches
                    if (bookmark.description && this.fuzzySearch(bookmark.description, word)) {
                        score += 20;
                    }
                });
                
                return { ...bookmark, score };
            });
            
            // Sort by score (descending) then alphabetically
            return scoredBookmarks.sort((a, b) => {
                if (a.score !== b.score) {
                    return b.score - a.score;
                }
                return this.sortByName(a, b);
            });
        },
        // Groups and sorts static bookmarks for the bottom section by tags
        groupedStaticBookmarksBottom() {
            if (!this.staticBookmarksBottom || !Array.isArray(this.staticBookmarksBottom)) {
                return {};
            }
            const grouped = this.staticBookmarksBottom.reduce((groups, bookmark) => {
                if (bookmark.tags && Array.isArray(bookmark.tags)) {
                    bookmark.tags.forEach(tag => {
                        if (tag === 'startpage-bottom') return;
                        if (!groups[tag]) groups[tag] = [];
                        groups[tag].push(bookmark);
                    });
                }
                return groups;
            }, {});
            
            // Sort tags and bookmarks within each tag
            return Object.keys(grouped).sort().reduce((result, tag) => {
                result[tag] = grouped[tag].sort(this.sortByName);
                return result;
            }, {});
        },
        // Returns sorted static bookmarks for the top section
        sortedStaticBookmarksTop() {
            if (!this.staticBookmarksTop || !Array.isArray(this.staticBookmarksTop)) {
                return [];
            }
            return [...this.staticBookmarksTop].sort(this.sortByName);
        },
        
        // Enhanced filtered bookmarks with highlighting
        enhancedFilteredBookmarks() {
            if (!this.filteredBookmarks || !Array.isArray(this.filteredBookmarks)) {
                return [];
            }
            return this.filteredBookmarks.map(bookmark => ({
                ...bookmark,
                highlightedName: this.highlightText(bookmark.name, this.highlightedQuery),
                highlightedDescription: this.highlightText(bookmark.description, this.highlightedQuery)
            }));
        }
    },
    methods: {
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
        
        // Fuzzy search function
        fuzzySearch(text, query) {
            const textLower = text.toLowerCase();
            const queryLower = query.toLowerCase();
            
            if (textLower.includes(queryLower)) return true;
            
            let textIndex = 0;
            for (let char of queryLower) {
                const index = textLower.indexOf(char, textIndex);
                if (index === -1) return false;
                textIndex = index + 1;
            }
            return true;
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
        
        // Fetches static bookmarks from Linkding API with progressive loading
        async fetchStaticBookmarks(searchTerm, isTopSection = false) {
            try {
                const tagName = searchTerm.replace('#', '');
                
                const data = await this.fetchAPI({
                    limit: '50',
                    offset: '0',
                    q: `#${tagName}`
                });

                if (data?.results?.length) {
                    const bookmarks = data.results
                        .filter(item => item.tag_names?.includes(tagName))
                        .map(item => ({
                            id: item.id,
                            name: item.title || item.url,
                            link: item.url,
                            icon: this.extractIcon(item.notes, item.url),
                            tags: item.tag_names || []
                        }));
                    
                    // Preload first few icons
                    this.preloadIcons(bookmarks.slice(0, 8));
                    return bookmarks;
                }
                return [];
            } catch (error) {
                console.error('Failed to load static bookmarks:', error);
                return [];
            } finally {
                if (isTopSection) {
                    this.isLoadingTop = false;
                } else {
                    this.isLoadingBottom = false;
                }
            }
        },
        
        // Preload icons for better performance
        async preloadIcons(bookmarks) {
            const preloadPromises = bookmarks.map(bookmark => {
                return new Promise(resolve => {
                    const img = new Image();
                    img.onload = img.onerror = resolve;
                    img.src = bookmark.icon;
                });
            });
            
            // Don't wait for all icons, just start the preload
            Promise.allSettled(preloadPromises);
        },
        
        // Enhanced bookmark fetching with better error handling and reduced payload
        async fetchBookmarks(query = '') {
            try {
                this.isSearching = !!query;
                this.errorMessage = '';
                
                const params = { 
                    limit: query ? '50' : '100', 
                    offset: '0'
                };
                if (query) params.q = query;
                
                const data = await this.fetchAPI(params);
                
                if (data?.results?.length) {
                    const bookmarks = data.results.map(item => ({
                        id: item.id,
                        name: item.title || item.url,
                        link: item.url,
                        icon: this.extractIcon(item.notes, item.url),
                        tags: item.tag_names || [],
                        description: item.description || ''
                    }));
                    
                    this.bookmarks = bookmarks;
                    
                    // Preload search result icons
                    if (query && bookmarks.length <= 20) {
                        this.preloadIcons(bookmarks);
                    }
                } else {
                    this.bookmarks = [];
                    if (query) {
                        this.errorMessage = `No bookmarks found for "${query}"`;
                    }
                }
            } catch (error) {
                console.error('Fetch error:', error);
                if (error.message.includes('Failed to fetch')) {
                    this.errorMessage = 'Unable to connect to Linkding server. Please check your connection.';
                } else if (error.message.includes('401') || error.message.includes('403')) {
                    this.errorMessage = 'Authentication failed. Please check your API token.';
                } else {
                    this.errorMessage = `Failed to load bookmarks: ${error.message}`;
                }
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