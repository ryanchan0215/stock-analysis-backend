const axios = require('axios');

class YahooFinanceService {
    constructor() {
        this.baseUrl = 'https://query1.finance.yahoo.com';
        console.log('✅ Yahoo Finance Service initialized (Direct API)');
    }

    /**
     * 獲取歷史 K 線數據
     */
    async getHistoricalData(symbol, daysBack = 365) {
        try {
            const period2 = Math.floor(Date.now() / 1000);
            const period1 = period2 - (daysBack * 24 * 60 * 60);

            console.log(`📊 Fetching ${daysBack} days of historical data for ${symbol}...`);

            const url = `${this.baseUrl}/v8/finance/chart/${symbol}`;
            const response = await axios.get(url, {
                params: {
                    period1,
                    period2,
                    interval: '1d',
                    includeAdjustedClose: true
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 30000
            });

            const result = response.data.chart.result[0];
            
            if (!result || !result.timestamp) {
                throw new Error(`No historical data for ${symbol}`);
            }

            const timestamps = result.timestamp;
            const quotes = result.indicators.quote[0];

            console.log(`✅ Got ${timestamps.length} days of data for ${symbol}`);

            return {
                timestamps: timestamps,
                open: quotes.open.map(v => v || 0),
                high: quotes.high.map(v => v || 0),
                low: quotes.low.map(v => v || 0),
                close: quotes.close.map(v => v || 0),
                volume: quotes.volume.map(v => v || 0)
            };

        } catch (error) {
            console.error(`❌ Error fetching Yahoo historical data for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取實時報價
     */
    async getQuote(symbol) {
        try {
            console.log(`📈 Fetching quote for ${symbol}...`);

            const url = `${this.baseUrl}/v8/finance/chart/${symbol}`;
            const response = await axios.get(url, {
                params: {
                    interval: '1d',
                    range: '1d'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            });

            const result = response.data.chart.result[0];
            const meta = result.meta;
            const quote = result.indicators.quote[0];
            
            const currentPrice = meta.regularMarketPrice;
            const previousClose = meta.chartPreviousClose;

            return {
                symbol: meta.symbol,
                currentPrice: currentPrice,
                change: currentPrice - previousClose,
                changePercent: ((currentPrice - previousClose) / previousClose) * 100,
                high: meta.regularMarketDayHigh,
                low: meta.regularMarketDayLow,
                open: quote.open[quote.open.length - 1] || currentPrice,
                previousClose: previousClose,
                volume: quote.volume[quote.volume.length - 1] || 0,
                timestamp: Math.floor(Date.now() / 1000)
            };

        } catch (error) {
            console.error(`❌ Error fetching Yahoo quote for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取公司資料（改良版 - 三重備援）
     */
    async getCompanyProfile(symbol) {
        try {
            console.log(`🏢 Fetching company profile for ${symbol}...`);

            // ✅ 方法 1：嘗試 quoteSummary API（最詳細但可能 401）
            try {
                const url = `${this.baseUrl}/v10/finance/quoteSummary/${symbol}`;
                const response = await axios.get(url, {
                    params: {
                        modules: 'assetProfile,price,summaryProfile,quoteType'
                    },
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                        'Accept': 'application/json',
                        'Accept-Language': 'en-US,en;q=0.9'
                    },
                    timeout: 10000
                });

                const result = response.data.quoteSummary.result[0];
                const profile = result.assetProfile || result.summaryProfile || {};
                const price = result.price || {};
                const quoteType = result.quoteType || {};

                console.log(`✅ Got company profile for ${symbol} (quoteSummary)`);

                return {
                    name: price.shortName || price.longName || quoteType.longName || symbol,
                    country: profile.country || 'N/A',
                    currency: price.currency || 'USD',
                    exchange: quoteType.exchange || price.exchangeName || 'N/A',
                    finnhubIndustry: profile.industry || profile.sector || 'N/A',
                    marketCapitalization: price.marketCap ? price.marketCap / 1e9 : 0,
                    weburl: profile.website || ''
                };
            } catch (quoteSummaryError) {
                console.warn(`⚠️ quoteSummary failed for ${symbol} (${quoteSummaryError.response?.status}), trying chart API...`);
            }

            // ✅ 方法 2：從 chart API 獲取基本資料
            const chartUrl = `${this.baseUrl}/v8/finance/chart/${symbol}`;
            const chartResponse = await axios.get(chartUrl, {
                params: {
                    interval: '1d',
                    range: '1d'
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            });

            const meta = chartResponse.data.chart.result[0].meta;

            console.log(`✅ Got basic profile for ${symbol} (chart API)`);

            return {
                name: meta.longName || meta.shortName || symbol,
                country: this.guessCountryFromExchange(meta.exchangeName),
                currency: meta.currency || 'USD',
                exchange: meta.exchangeName || 'N/A',
                finnhubIndustry: 'N/A',
                marketCapitalization: 0,
                weburl: ''
            };

        } catch (error) {
            console.error(`❌ All methods failed for ${symbol}:`, error.message);
            
            // ✅ 方法 3：返回基本資料（最後備援）
            return {
                name: symbol,
                country: 'N/A',
                currency: 'USD',
                exchange: 'N/A',
                finnhubIndustry: 'N/A',
                marketCapitalization: 0,
                weburl: ''
            };
        }
    }

    /**
     * 根據交易所推測國家
     */
    guessCountryFromExchange(exchange) {
        const exchangeMap = {
            'NMS': 'US',    // NASDAQ
            'NYQ': 'US',    // NYSE
            'PCX': 'US',    // NYSE Arca
            'HKG': 'HK',    // Hong Kong
            'HKD': 'HK',    // Hong Kong (alternative)
            'LSE': 'GB',    // London
            'FRA': 'DE',    // Frankfurt
            'JPX': 'JP'     // Japan
        };
        return exchangeMap[exchange] || 'N/A';
    }

    /**
     * 搜尋股票
     */
    async searchSymbol(query) {
        try {
            console.log(`🔍 Searching for: ${query}...`);

            const url = `${this.baseUrl}/v1/finance/search`;
            const response = await axios.get(url, {
                params: {
                    q: query,
                    quotesCount: 10,
                    newsCount: 0
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            });

            const quotes = response.data.quotes || [];

            return quotes
                .filter(q => q.quoteType === 'EQUITY')
                .map(q => ({
                    symbol: q.symbol,
                    name: q.longname || q.shortname || q.symbol,
                    type: q.quoteType,
                    exchange: q.exchange,
                    region: q.region || 'US'
                }));

        } catch (error) {
            console.error(`❌ Error searching Yahoo for ${query}:`, error.message);
            return [];
        }
    }

    /**
     * 獲取新聞
     */
    async getNews(symbol, limit = 10) {
        try {
            console.log(`📰 Fetching news for ${symbol}...`);

            const url = `${this.baseUrl}/v1/finance/search`;
            const response = await axios.get(url, {
                params: {
                    q: symbol,
                    quotesCount: 0,
                    newsCount: limit
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                },
                timeout: 10000
            });

            const newsItems = response.data.news || [];

            return newsItems.map(news => ({
                headline: news.title,
                summary: news.summary || news.title,
                source: news.publisher,
                url: news.link,
                datetime: (news.providerPublishTime || Date.now() / 1000).toString()
            }));

        } catch (error) {
            console.error(`❌ Error fetching Yahoo news for ${symbol}:`, error.message);
            return [];
        }
    }
}

module.exports = new YahooFinanceService();