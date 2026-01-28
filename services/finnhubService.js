const axios = require('axios');

class FinnhubService {
    constructor() {
        this.apiKey = process.env.FINNHUB_API_KEY;
        this.baseUrl = 'https://finnhub.io/api/v1';
        
        if (!this.apiKey) {
            console.warn('⚠️ Warning: FINNHUB_API_KEY not set');
        }
    }

    /**
     * 獲取股票報價
     */
    async getQuote(symbol) {
        try {
            const response = await axios.get(`${this.baseUrl}/quote`, {
                params: {
                    symbol: symbol,
                    token: this.apiKey
                }
            });
            
            return {
                symbol: symbol,
                currentPrice: response.data.c,
                change: response.data.d,
                changePercent: response.data.dp,
                high: response.data.h,
                low: response.data.l,
                open: response.data.o,
                previousClose: response.data.pc,
                timestamp: response.data.t
            };
        } catch (error) {
            console.error(`❌ Error fetching quote for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取公司基本資料
     */
    async getCompanyProfile(symbol) {
        try {
            const response = await axios.get(`${this.baseUrl}/stock/profile2`, {
                params: {
                    symbol: symbol,
                    token: this.apiKey
                }
            });
            
            return response.data;
        } catch (error) {
            console.error(`❌ Error fetching profile for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取歷史 K 線數據
     */
    async getCandles(symbol, resolution = 'D', daysBack = 365) {
        try {
            const to = Math.floor(Date.now() / 1000);
            const from = to - (daysBack * 24 * 60 * 60);
            
            const response = await axios.get(`${this.baseUrl}/stock/candle`, {
                params: {
                    symbol: symbol,
                    resolution: resolution,
                    from: from,
                    to: to,
                    token: this.apiKey
                }
            });
            
            if (response.data.s === 'no_data') {
                throw new Error('No data available');
            }
            
            return {
                timestamps: response.data.t,
                open: response.data.o,
                high: response.data.h,
                low: response.data.l,
                close: response.data.c,
                volume: response.data.v
            };
        } catch (error) {
            console.error(`❌ Error fetching candles for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取新聞
     */
    async getNews(symbol, limit = 10) {
        try {
            const response = await axios.get(`${this.baseUrl}/company-news`, {
                params: {
                    symbol: symbol,
                    from: this.getDateString(-30),
                    to: this.getDateString(0),
                    token: this.apiKey
                }
            });
            
            return response.data.slice(0, limit).map(news => ({
                headline: news.headline,
                summary: news.summary,
                source: news.source,
                url: news.url,
                datetime: new Date(news.datetime * 1000).toISOString()
            }));
        } catch (error) {
            console.error(`❌ Error fetching news for ${symbol}:`, error.message);
            return [];
        }
    }

    /**
     * 搜尋股票
     */
    async searchSymbol(query) {
        try {
            const response = await axios.get(`${this.baseUrl}/search`, {
                params: {
                    q: query,
                    token: this.apiKey
                }
            });
            
            return response.data.result.map(stock => ({
                symbol: stock.symbol,
                description: stock.description,
                type: stock.type,
                displaySymbol: stock.displaySymbol
            }));
        } catch (error) {
            console.error(`❌ Error searching for ${query}:`, error.message);
            throw error;
        }
    }

    /**
     * 輔助函數：獲取日期字串
     */
    getDateString(daysOffset) {
        const date = new Date();
        date.setDate(date.getDate() + daysOffset);
        return date.toISOString().split('T')[0];
    }

    /**
     * 延遲函數（避免超過 API 限制）
     */
    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new FinnhubService();