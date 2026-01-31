const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Web tools for the AI agent
 */

// User agent for requests
const USER_AGENT = 'OpenAgent/1.0 (AI Assistant)';

/**
 * Fetch content from a URL
 */
async function readUrl(url, options = {}) {
    return new Promise((resolve) => {
        try {
            const parsedUrl = new URL(url);
            const protocol = parsedUrl.protocol === 'https:' ? https : http;

            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                headers: {
                    'User-Agent': USER_AGENT,
                    'Accept': 'text/html,application/json,text/plain,*/*',
                    ...options.headers
                },
                timeout: options.timeout || 10000
            };

            const req = protocol.request(requestOptions, (res) => {
                let data = '';

                // Limit response size
                const maxSize = options.maxSize || 1024 * 1024; // 1MB default
                let totalSize = 0;

                res.on('data', (chunk) => {
                    totalSize += chunk.length;
                    if (totalSize > maxSize) {
                        req.destroy();
                        resolve({
                            success: false,
                            error: 'Response too large'
                        });
                        return;
                    }
                    data += chunk;
                });

                res.on('end', () => {
                    // Basic HTML to text conversion
                    let text = data;
                    if (res.headers['content-type']?.includes('text/html')) {
                        text = htmlToText(data);
                    }

                    resolve({
                        success: true,
                        url,
                        statusCode: res.statusCode,
                        contentType: res.headers['content-type'],
                        content: text.substring(0, 50000), // Limit content length
                        truncated: text.length > 50000
                    });
                });
            });

            req.on('error', (error) => {
                resolve({ success: false, error: error.message, url });
            });

            req.on('timeout', () => {
                req.destroy();
                resolve({ success: false, error: 'Request timed out', url });
            });

            req.end();
        } catch (error) {
            resolve({ success: false, error: error.message, url });
        }
    });
}

/**
 * Basic HTML to text conversion
 */
function htmlToText(html) {
    return html
        // Remove script and style content
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        // Remove HTML comments
        .replace(/<!--[\s\S]*?-->/g, '')
        // Convert common block elements to newlines
        .replace(/<\/?(p|div|br|h[1-6]|li|tr)[^>]*>/gi, '\n')
        // Remove all other HTML tags
        .replace(/<[^>]+>/g, ' ')
        // Decode HTML entities
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .replace(/\n\s+/g, '\n')
        .replace(/\n+/g, '\n')
        .trim();
}

/**
 * Web search using DuckDuckGo Instant Answer API
 * Note: This is a simple implementation. For production, consider using a proper search API.
 */
async function webSearch(query, options = {}) {
    const encodedQuery = encodeURIComponent(query);
    const url = `https://api.duckduckgo.com/?q=${encodedQuery}&format=json&no_html=1&skip_disambig=1`;

    return new Promise((resolve) => {
        https.get(url, { headers: { 'User-Agent': USER_AGENT } }, (res) => {
            let data = '';

            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);

                    const searchResult = {
                        success: true,
                        query,
                        abstract: result.Abstract || null,
                        abstractSource: result.AbstractSource || null,
                        abstractUrl: result.AbstractURL || null,
                        answer: result.Answer || null,
                        definition: result.Definition || null,
                        relatedTopics: (result.RelatedTopics || [])
                            .filter(t => t.Text)
                            .slice(0, 5)
                            .map(t => ({
                                text: t.Text,
                                url: t.FirstURL
                            })),
                        results: (result.Results || [])
                            .slice(0, 5)
                            .map(r => ({
                                title: r.Text,
                                url: r.FirstURL
                            }))
                    };

                    resolve(searchResult);
                } catch (error) {
                    resolve({ success: false, error: 'Failed to parse search results', query });
                }
            });
        }).on('error', (error) => {
            resolve({ success: false, error: error.message, query });
        });
    });
}

module.exports = {
    readUrl,
    webSearch,
    htmlToText
};
