const https = require('https');
const http = require('http');

/**
 * Search the web using DuckDuckGo Instant Answer API
 * @param {string} query - Search query
 * @param {number} numResults - Number of results to return (max 10)
 * @returns {Promise<{success: boolean, results?: Array, error?: string}>}
 */
async function searchWeb(query, numResults = 5) {
    return new Promise((resolve) => {
        const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;

        https.get(searchUrl, (res) => {
            let data = '';

            res.on('data', chunk => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const json = JSON.parse(data);
                    const results = [];

                    // Abstract (direct answer)
                    if (json.Abstract) {
                        results.push({
                            title: json.Heading || 'Overview',
                            url: json.AbstractURL || '',
                            snippet: json.Abstract,
                            source: json.AbstractSource || 'DuckDuckGo'
                        });
                    }

                    // Related topics
                    if (json.RelatedTopics && Array.isArray(json.RelatedTopics)) {
                        for (const topic of json.RelatedTopics.slice(0, numResults - results.length)) {
                            if (topic.Text && topic.FirstURL) {
                                results.push({
                                    title: topic.Text.split(' - ')[0] || '',
                                    url: topic.FirstURL,
                                    snippet: topic.Text,
                                    source: 'DuckDuckGo'
                                });
                            }
                        }
                    }

                    // Infobox
                    if (json.Infobox && json.Infobox.content) {
                        const infoContent = json.Infobox.content
                            .map(item => `${item.label}: ${item.value}`)
                            .join('\n');
                        if (infoContent && results.length < numResults) {
                            results.push({
                                title: 'Quick Facts',
                                url: json.AbstractURL || '',
                                snippet: infoContent,
                                source: 'DuckDuckGo Infobox'
                            });
                        }
                    }

                    if (results.length === 0) {
                        resolve({
                            success: true,
                            results: [],
                            message: `No instant results found for "${query}". Try a more specific search term.`
                        });
                    } else {
                        resolve({
                            success: true,
                            results: results.slice(0, numResults),
                            query: query
                        });
                    }
                } catch (error) {
                    resolve({
                        success: false,
                        error: `Failed to parse search results: ${error.message}`
                    });
                }
            });
        }).on('error', (error) => {
            resolve({
                success: false,
                error: `Search request failed: ${error.message}`
            });
        });
    });
}

/**
 * Fetch a URL and return its content
 * @param {string} url - URL to fetch
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function fetchUrl(url) {
    return new Promise((resolve) => {
        const protocol = url.startsWith('https') ? https : http;

        protocol.get(url, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(res.headers.location).then(resolve);
            }

            if (res.statusCode !== 200) {
                resolve({
                    success: false,
                    error: `HTTP ${res.statusCode}: ${res.statusMessage}`
                });
                return;
            }

            let data = '';
            res.on('data', chunk => {
                data += chunk;
                // Limit response size
                if (data.length > 100000) {
                    res.destroy();
                    resolve({
                        success: true,
                        content: data.slice(0, 100000) + '\n... (truncated)',
                        truncated: true
                    });
                }
            });

            res.on('end', () => {
                // Basic HTML to text conversion
                let text = data
                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                    .replace(/<[^>]+>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim();

                resolve({
                    success: true,
                    content: text.slice(0, 50000),
                    truncated: text.length > 50000
                });
            });
        }).on('error', (error) => {
            resolve({
                success: false,
                error: `Fetch failed: ${error.message}`
            });
        });
    });
}

module.exports = {
    searchWeb,
    fetchUrl
};
