const app = Vue.createApp({
    data() {
        return {
            searchQuery: '',
            bookmarks: [],
            staticBookmarksBottom: [],
            staticBookmarksTop: [],
            selectedIndex: -1,
            isLoading: true,
            errorMessage: ''
        };
    },
    computed: {
        // Filters bookmarks based on the search query and prioritizes title matches over tag matches
        filteredBookmarks() {
            if (!this.searchQuery.trim()) {
                return this.bookmarks;
            }
            
            const query = this.searchQuery.toLowerCase().split(' ');
            
            // Filter and score bookmarks
            const scoredBookmarks = this.bookmarks.filter(bookmark => {
                const titleMatch = query.every(word => 
                    bookmark.name.toLowerCase().includes(word)
                );
                const tagMatch = query.every(word => 
                    bookmark.tags && bookmark.tags.some(tag => tag.toLowerCase().includes(word))
                );
                
                return titleMatch || tagMatch;
            }).map(bookmark => {
                // Calculate relevance score
                let score = 0;
                const title = bookmark.name.toLowerCase();
                
                query.forEach(word => {
                    // Higher score for title matches
                    if (title.includes(word)) {
                        score += title.startsWith(word) ? 100 : 50; // Even higher for starts with
                    }
                    // Lower score for tag matches
                    else if (bookmark.tags && bookmark.tags.some(tag => tag.toLowerCase().includes(word))) {
                        score += 10;
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
        
        // Extract icon from notes field
        extractIcon(notes) {
            if (!notes) return 'https://placehold.co/24x24';
            
            const iconMatch = notes.match(/icon::(.+?)(?:\s|$)/);
            return iconMatch?.[1]?.trim() || 'https://placehold.co/24x24';
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
                            icon: this.extractIcon(item.notes),
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
        
        // Fetches bookmarks from Linkding API
        async fetchBookmarks(query = '') {
            try {
                this.isLoading = true;
                this.errorMessage = '';
                
                const params = { limit: '100', offset: '0' };
                if (query) params.q = query;
                
                const data = await this.fetchAPI(params);
                
                if (data?.results?.length) {
                    this.bookmarks = data.results.map(item => ({
                        id: item.id,
                        name: item.title || item.url,
                        link: item.url,
                        icon: null,
                        tags: item.tag_names || [],
                        description: item.description || ''
                    }));
                } else {
                    this.bookmarks = [];
                }
            } catch (error) {
                this.errorMessage = 'Failed to load bookmarks';
                this.bookmarks = [];
            } finally {
                this.isLoading = false;
            }
        },
        // Handles keyboard navigation and actions for the search results
        handleKeydown(event) {
            if (event.key === 'ArrowDown') {
                this.selectedIndex = (this.selectedIndex + 1) % this.filteredBookmarks.length;
            } else if (event.key === 'ArrowUp') {
                this.selectedIndex = (this.selectedIndex - 1 + this.filteredBookmarks.length) % this.filteredBookmarks.length;
            } else if (event.key === 'Enter') {
                if (this.filteredBookmarks.length === 1 || this.selectedIndex >= 0) {
                    const link = this.filteredBookmarks[this.selectedIndex]?.link || this.filteredBookmarks[0].link;
                    window.location.href = link;
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
        // Load static bookmarks from Linkding API
        const [topBookmarks, bottomBookmarks] = await Promise.all([
            this.fetchStaticBookmarks('#startpage-top'),
            this.fetchStaticBookmarks('#startpage-bottom')
        ]);
        
        this.staticBookmarksTop = topBookmarks;
        this.staticBookmarksBottom = bottomBookmarks;
        
        // Fetch initial bookmarks
        this.fetchBookmarks();
        
        // Set up event listeners
        window.addEventListener('keydown', this.handleKeydown);
        this.$nextTick(() => this.$refs.searchInput.focus());
    },
    beforeUnmount() {
        window.removeEventListener('keydown', this.handleKeydown);
        clearTimeout(this.searchTimeout);
    }
});

app.mount('#app');