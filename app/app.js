const app = Vue.createApp({
    data() {
        return {
            searchQuery: '',
            bookmarks: [],
            staticBookmarksBottom: [],
            staticBookmarksTop: [],
            selectedIndex: -1,
            isLoading: true,
            isSearching: false,
            errorMessage: '',
            searchResults: [],
            highlightedQuery: ''
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
            const grouped = this.staticBookmarksBottom.reduce((groups, bookmark) => {
                bookmark.tags.forEach(tag => {
                    if (tag === 'startpage-bottom') return;
                    if (!groups[tag]) groups[tag] = [];
                    groups[tag].push(bookmark);
                });
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
            return [...this.staticBookmarksTop].sort(this.sortByName);
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
        
        // Extract icon from notes field with favicon fallback
        extractIcon(notes, url) {
            if (notes) {
                const iconMatch = notes.match(/icon::(.+?)(?:\s|$)/);
                if (iconMatch?.[1]?.trim()) {
                    return iconMatch[1].trim();
                }
            }
            
            // Favicon fallback
            if (url) {
                try {
                    const domain = new URL(url).hostname;
                    return `https://www.google.com/s2/favicons?domain=${domain}&sz=24`;
                } catch {
                    return 'https://placehold.co/24x24';
                }
            }
            
            return 'https://placehold.co/24x24';
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
        
        // Fetches static bookmarks from Linkding API and handles errors
        async fetchStaticBookmarks(searchTerm) {
            try {
                this.isLoading = true;
                const tagName = searchTerm.replace('#', '');
                
                const data = await this.fetchAPI({
                    limit: '100',
                    offset: '0',
                    q: `#${tagName}`
                });

                if (data?.results?.length) {
                    return data.results
                        .filter(item => item.tag_names?.includes(tagName))
                        .map(item => ({
                            id: item.id,
                            name: item.title || item.url,
                            link: item.url,
                            icon: this.extractIcon(item.notes, item.url),
                            tags: item.tag_names || []
                        }));
                }
                return [];
            } catch (error) {
                this.errorMessage = 'Failed to load bookmarks';
                return [];
            } finally {
                this.isLoading = false;
            }
        },
        
        // Enhanced bookmark fetching with better error handling
        async fetchBookmarks(query = '') {
            try {
                this.isSearching = !!query;
                if (!query) this.isLoading = true;
                this.errorMessage = '';
                
                const params = { limit: '100', offset: '0' };
                if (query) params.q = query;
                
                const data = await this.fetchAPI(params);
                
                if (data?.results?.length) {
                    this.bookmarks = data.results.map(item => ({
                        id: item.id,
                        name: item.title || item.url,
                        link: item.url,
                        icon: this.extractIcon(item.notes, item.url),
                        tags: item.tag_names || [],
                        description: item.description || ''
                    }));
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
                this.isLoading = false;
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
        try {
            // Load static bookmarks from Linkding API
            const [topBookmarks, bottomBookmarks] = await Promise.all([
                this.fetchStaticBookmarks('#startpage-top'),
                this.fetchStaticBookmarks('#startpage-bottom')
            ]);
            
            this.staticBookmarksTop = topBookmarks;
            this.staticBookmarksBottom = bottomBookmarks;
            
            // Fetch initial bookmarks
            await this.fetchBookmarks();
        } catch (error) {
            console.error('Initialization error:', error);
            this.errorMessage = 'Failed to initialize application. Please refresh the page.';
        }
        
        // Set up event listeners
        window.addEventListener('keydown', this.handleKeydown);
        this.$nextTick(() => this.$refs.searchInput?.focus());
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKeydown);
        clearTimeout(this.searchTimeout);
    }
});

app.mount('#app');