/**
 * Web Search Tool - DuckDuckGo scraping without API keys
 */

const https = require('https');
const http = require('http');

/**
 * Search the web using DuckDuckGo HTML
 * @param {string} query - Search query
 * @param {number} maxResults - Maximum number of results
 * @returns {Promise<{success: boolean, results?: Array, error?: string}>}
 */
async function webSearch(query, maxResults = 5) {
    try {
        // Use DuckDuckGo HTML version for simplicity
        const encodedQuery = encodeURIComponent(query);
        const url = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

        const html = await fetchUrl(url);
        const results = parseSearchResults(html, maxResults);

        return {
            success: true,
            query,
            results,
            resultCount: results.length
        };
    } catch (error) {
        return {
            success: false,
            error: `Web search failed: ${error.message}`
        };
    }
}

/**
 * Fetch URL content
 */
function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;

        const req = protocol.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            },
            timeout: 10000
        }, (res) => {
            // Handle redirects
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                fetchUrl(res.headers.location).then(resolve).catch(reject);
                return;
            }

            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        });

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });
    });
}

/**
 * Parse DuckDuckGo HTML search results
 */
function parseSearchResults(html, maxResults) {
    const results = [];

    // Match result links - DuckDuckGo uses class="result__a" for links
    const linkRegex = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;
    const snippetRegex = /<a[^>]*class="result__snippet"[^>]*>([^<]*(?:<[^>]*>[^<]*)*)<\/a>/gi;

    // Simpler approach: find all result blocks
    const resultBlockRegex = /<div[^>]*class="[^"]*result[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/gi;

    let match;
    let linkMatches = [];
    let snippetMatches = [];

    // Find all links
    while ((match = linkRegex.exec(html)) !== null && linkMatches.length < maxResults) {
        const url = decodeURIComponent(match[1].replace(/.*uddg=([^&]*).*/, '$1') || match[1]);
        const title = match[2].replace(/<[^>]*>/g, '').trim();

        if (url && title && !url.includes('duckduckgo.com')) {
            linkMatches.push({ url, title });
        }
    }

    // Find all snippets
    while ((match = snippetRegex.exec(html)) !== null) {
        const snippet = match[1].replace(/<[^>]*>/g, '').trim();
        snippetMatches.push(snippet);
    }

    // Combine results
    for (let i = 0; i < Math.min(linkMatches.length, maxResults); i++) {
        results.push({
            title: linkMatches[i].title,
            url: linkMatches[i].url,
            snippet: snippetMatches[i] || ''
        });
    }

    return results;
}

/**
 * Read content from a URL
 * @param {string} url - URL to read
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
async function readUrl(url) {
    try {
        const html = await fetchUrl(url);

        // Extract text content from HTML
        const textContent = extractTextFromHtml(html);

        return {
            success: true,
            url,
            content: textContent.slice(0, 10000), // Limit to 10KB
            contentLength: textContent.length
        };
    } catch (error) {
        return {
            success: false,
            error: `Failed to read URL: ${error.message}`
        };
    }
}

/**
 * Extract readable text from HTML
 */
function extractTextFromHtml(html) {
    // Remove script and style elements
    let text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

    // Remove HTML tags
    text = text.replace(/<[^>]+>/g, ' ');

    // Decode HTML entities
    text = text.replace(/&nbsp;/g, ' ');
    text = text.replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<');
    text = text.replace(/&gt;/g, '>');
    text = text.replace(/&quot;/g, '"');
    text = text.replace(/&#39;/g, "'");

    // Clean up whitespace
    text = text.replace(/\s+/g, ' ').trim();

    return text;
}

module.exports = {
    webSearch,
    readUrl,
    fetchUrl
};
