const axios = require('axios');

class AlphaVantageService {
    constructor() {
        this.apiKey = process.env.ALPHA_VANTAGE_API_KEY;
        this.baseUrl = 'https://www.alphavantage.co/query';
        
        if (!this.apiKey) {
            console.warn('⚠️ Warning: ALPHA_VANTAGE_API_KEY not set');
        }
    }

    /**
     * 獲取日線 K 線數據
     */
   async getDailyData(symbol, outputSize = 'full') {
    try {
        console.log(`🔍 Fetching Alpha Vantage daily data for ${symbol}...`);
        console.log(`🔑 API Key: ${this.apiKey ? this.apiKey.substring(0, 8) + '...' : 'NOT SET'}`);
        
        const response = await axios.get(this.baseUrl, {
            params: {
                function: 'TIME_SERIES_DAILY',
                symbol: symbol,
                outputsize: outputSize,
                apikey: this.apiKey
            }
        });

        console.log(`📦 Response keys:`, Object.keys(response.data));

            if (response.data['Error Message']) {
                throw new Error(`Invalid symbol: ${symbol}`);
            }

            if (response.data['Note']) {
                throw new Error('API call frequency limit reached. Please wait.');
            }

            const timeSeries = response.data['Time Series (Daily)'];
            
            if (!timeSeries) {
                throw new Error('No data available');
            }

            // 轉換為統一格式
            const dates = Object.keys(timeSeries).sort();
            const candles = {
                timestamps: [],
                open: [],
                high: [],
                low: [],
                close: [],
                volume: []
            };

            dates.forEach(date => {
                const data = timeSeries[date];
                candles.timestamps.push(new Date(date).getTime() / 1000);
                candles.open.push(parseFloat(data['1. open']));
                candles.high.push(parseFloat(data['2. high']));
                candles.low.push(parseFloat(data['3. low']));
                candles.close.push(parseFloat(data['4. close']));
                candles.volume.push(parseInt(data['5. volume']));
            });

            return candles;

        } catch (error) {
            console.error(`❌ Error fetching daily data for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取週線 K 線數據
     */
    async getWeeklyData(symbol) {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: 'TIME_SERIES_WEEKLY',
                    symbol: symbol,
                    apikey: this.apiKey
                }
            });

            if (response.data['Error Message']) {
                throw new Error(`Invalid symbol: ${symbol}`);
            }

            const timeSeries = response.data['Weekly Time Series'];
            
            if (!timeSeries) {
                throw new Error('No data available');
            }

            const dates = Object.keys(timeSeries).sort();
            const candles = {
                timestamps: [],
                open: [],
                high: [],
                low: [],
                close: [],
                volume: []
            };

            dates.forEach(date => {
                const data = timeSeries[date];
                candles.timestamps.push(new Date(date).getTime() / 1000);
                candles.open.push(parseFloat(data['1. open']));
                candles.high.push(parseFloat(data['2. high']));
                candles.low.push(parseFloat(data['3. low']));
                candles.close.push(parseFloat(data['4. close']));
                candles.volume.push(parseInt(data['5. volume']));
            });

            return candles;

        } catch (error) {
            console.error(`❌ Error fetching weekly data for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 獲取實時報價
     */
    async getQuote(symbol) {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: 'GLOBAL_QUOTE',
                    symbol: symbol,
                    apikey: this.apiKey
                }
            });

            const quote = response.data['Global Quote'];
            
            if (!quote || Object.keys(quote).length === 0) {
                throw new Error('No quote data available');
            }

            return {
                symbol: quote['01. symbol'],
                currentPrice: parseFloat(quote['05. price']),
                change: parseFloat(quote['09. change']),
                changePercent: parseFloat(quote['10. change percent'].replace('%', '')),
                high: parseFloat(quote['03. high']),
                low: parseFloat(quote['04. low']),
                open: parseFloat(quote['02. open']),
                previousClose: parseFloat(quote['08. previous close']),
                volume: parseInt(quote['06. volume']),
                timestamp: new Date(quote['07. latest trading day']).getTime() / 1000
            };

        } catch (error) {
            console.error(`❌ Error fetching quote for ${symbol}:`, error.message);
            throw error;
        }
    }

    /**
     * 搜尋股票
     */
    async searchSymbol(query) {
        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    function: 'SYMBOL_SEARCH',
                    keywords: query,
                    apikey: this.apiKey
                }
            });

            const matches = response.data['bestMatches'];
            
            if (!matches) {
                return [];
            }

            return matches.map(match => ({
                symbol: match['1. symbol'],
                name: match['2. name'],
                type: match['3. type'],
                region: match['4. region'],
                currency: match['8. currency']
            }));

        } catch (error) {
            console.error(`❌ Error searching for ${query}:`, error.message);
            return [];
        }
    }
}

module.exports = new AlphaVantageService();