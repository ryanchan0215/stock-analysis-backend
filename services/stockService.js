const yahooFinanceService = require('./yahooFinanceService');
const finnhubService = require('./finnhubService');
const technicalIndicators = require('./technicalIndicators');

class StockService {
    /**
     * 獲取股票報價（優先用 Yahoo Finance）
     */
    async getQuote(symbol) {
        try {
            return await yahooFinanceService.getQuote(symbol);
        } catch (error) {
            console.warn(`⚠️ Yahoo Finance failed, trying Finnhub for ${symbol}`);
            try {
                return await finnhubService.getQuote(symbol);
            } catch (err) {
                console.error(`❌ Both services failed for ${symbol}`);
                throw error;
            }
        }
    }

  /**
     * 獲取公司資料（優先用 Yahoo Finance，缺少欄位補充 Finnhub）
     */
    async getProfile(symbol) {
        try {
            console.log(`\n========== 📊 [getProfile] ${symbol} ==========`);
            
            // 1️⃣ 先拎 Yahoo Finance 數據
            console.log(`🔍 Step 1: Fetching Yahoo profile...`);
            const yahooProfile = await yahooFinanceService.getCompanyProfile(symbol);
            
            console.log(`📦 Yahoo raw response:`, JSON.stringify(yahooProfile, null, 2));
            
            // 2️⃣ 詳細檢查每個欄位
            console.log(`\n📊 Yahoo profile analysis:`);
            console.log(`   name: ${yahooProfile?.name}`);
            console.log(`   country: ${yahooProfile?.country}`);
            console.log(`   currency: ${yahooProfile?.currency}`);
            console.log(`   exchange: ${yahooProfile?.exchange}`);
            console.log(`   industry: ${yahooProfile?.industry}`);
            console.log(`   sector: ${yahooProfile?.sector}`);
            console.log(`   finnhubIndustry: ${yahooProfile?.finnhubIndustry}`);
            console.log(`   marketCapitalization: ${yahooProfile?.marketCapitalization}`);
            console.log(`   weburl: ${yahooProfile?.weburl}`);
            
            const hasBasicInfo = yahooProfile && 
                                yahooProfile.name && 
                                yahooProfile.name !== symbol;
            
            console.log(`\n✅ Has basic info: ${hasBasicInfo}`);

            // 3️⃣ 檢查行業欄位（三個來源）
            const hasIndustry = !!(yahooProfile?.finnhubIndustry || 
                                  yahooProfile?.industry || 
                                  yahooProfile?.sector);
            
            const hasMarketCap = yahooProfile?.marketCapitalization && 
                                yahooProfile.marketCapitalization > 0;
            
            console.log(`✅ Has industry: ${hasIndustry}`);
            console.log(`   - finnhubIndustry: ${!!yahooProfile?.finnhubIndustry}`);
            console.log(`   - industry: ${!!yahooProfile?.industry}`);
            console.log(`   - sector: ${!!yahooProfile?.sector}`);
            console.log(`✅ Has market cap: ${hasMarketCap} (${yahooProfile?.marketCapitalization})`);

            // 4️⃣ 如果 Yahoo 缺少數據，補充 Finnhub
            let finnhubProfile = null;
            
            if (!hasBasicInfo || !hasIndustry || !hasMarketCap) {
                console.log(`\n🔍 Step 2: Yahoo missing data, trying Finnhub...`);
                console.log(`   Reason: basicInfo=${hasBasicInfo}, industry=${hasIndustry}, marketCap=${hasMarketCap}`);
                
                try {
                    finnhubProfile = await finnhubService.getCompanyProfile(symbol);
                    
                    console.log(`📦 Finnhub raw response:`, JSON.stringify(finnhubProfile, null, 2));
                    
                    console.log(`\n📊 Finnhub profile analysis:`);
                    console.log(`   name: ${finnhubProfile?.name}`);
                    console.log(`   country: ${finnhubProfile?.country}`);
                    console.log(`   finnhubIndustry: ${finnhubProfile?.finnhubIndustry}`);
                    console.log(`   marketCapitalization: ${finnhubProfile?.marketCapitalization}`);
                    
                } catch (finnhubError) {
                    console.error(`❌ Finnhub failed:`, finnhubError.message);
                }
            } else {
                console.log(`\n✅ Yahoo data complete, skipping Finnhub`);
            }

            // 5️⃣ 合併數據（Yahoo 優先，Finnhub 補充）
            console.log(`\n🔍 Step 3: Merging data...`);
            
            const industryValue = yahooProfile?.finnhubIndustry || 
                                 yahooProfile?.industry || 
                                 yahooProfile?.sector ||
                                 finnhubProfile?.finnhubIndustry || 
                                 'N/A';
            
            const marketCapValue = yahooProfile?.marketCapitalization || 
                                  finnhubProfile?.marketCapitalization || 
                                  0;
            
            console.log(`   Industry sources:`);
            console.log(`      Yahoo.finnhubIndustry: ${yahooProfile?.finnhubIndustry || 'null'}`);
            console.log(`      Yahoo.industry: ${yahooProfile?.industry || 'null'}`);
            console.log(`      Yahoo.sector: ${yahooProfile?.sector || 'null'}`);
            console.log(`      Finnhub.finnhubIndustry: ${finnhubProfile?.finnhubIndustry || 'null'}`);
            console.log(`   ➡️ Final industry: ${industryValue}`);
            
            console.log(`   Market cap sources:`);
            console.log(`      Yahoo: ${yahooProfile?.marketCapitalization || 0}`);
            console.log(`      Finnhub: ${finnhubProfile?.marketCapitalization || 0}`);
            console.log(`   ➡️ Final market cap: ${marketCapValue}`);

            const mergedProfile = {
                name: yahooProfile?.name || finnhubProfile?.name || symbol,
                country: yahooProfile?.country || finnhubProfile?.country || 'N/A',
                currency: yahooProfile?.currency || finnhubProfile?.currency || 'USD',
                exchange: yahooProfile?.exchange || finnhubProfile?.exchange || 'N/A',
                finnhubIndustry: industryValue,
                marketCapitalization: marketCapValue,
                weburl: yahooProfile?.weburl || finnhubProfile?.weburl || ''
            };

            console.log(`\n✅ Final merged profile:`);
            console.log(JSON.stringify(mergedProfile, null, 2));
            console.log(`========== ✅ [getProfile] Complete ==========\n`);

            return mergedProfile;

        } catch (error) {
            console.error(`\n❌❌❌ ERROR in getProfile for ${symbol} ❌❌❌`);
            console.error(`Error message: ${error.message}`);
            console.error(`Stack trace:`, error.stack);
            
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
     * 獲取股票新聞（優先用 Yahoo Finance）
     */
    async getNews(symbol, limit = 10) {
        try {
            const news = await yahooFinanceService.getNews(symbol, limit);
            if (news && news.length > 0) return news;
            
            // 如果 Yahoo 無新聞，試 Finnhub
            console.warn(`⚠️ Yahoo news empty for ${symbol}, trying Finnhub...`);
            return await finnhubService.getNews(symbol, limit);
        } catch (error) {
            console.warn(`⚠️ Error getting news for ${symbol}:`, error.message);
            return [];
        }
    }

    /**
     * 搜尋股票（優先用 Yahoo Finance）
     */
    async searchSymbol(query) {
        try {
            return await yahooFinanceService.searchSymbol(query);
        } catch (error) {
            console.warn(`⚠️ Yahoo search failed, trying Finnhub`);
            try {
                return await finnhubService.searchSymbol(query);
            } catch (err) {
                console.error(`❌ Search failed for ${query}`);
                return [];
            }
        }
    }

   /**
 * 獲取 K 線數據（用 Yahoo Finance）
 */
async getCandles(symbol, daysBack = 365) {
    try {
        console.log(`📊 Getting candles for ${symbol}...`);
        const candles = await yahooFinanceService.getHistoricalData(symbol, daysBack);
        
        // ✅ 驗證返回數據
        if (!candles || !candles.timestamps || candles.timestamps.length === 0) {
            throw new Error(`${symbol} 返回空數據`);
        }
        
        console.log(`✅ Successfully got ${candles.timestamps.length} candles for ${symbol}`);
        return candles;
        
    } catch (error) {
        console.error(`❌ Error getting candles for ${symbol}:`, error.message);
        throw new Error(`無法獲取 ${symbol} K 線數據：${error.message}`);
    }
}

/**
 * 獲取技術指標（用 Yahoo Finance K 線計算）
 */
async getTechnicalIndicators(symbol) {
    try {
        console.log(`📈 Calculating technical indicators for ${symbol}...`);
        
        // ✅ 1. 獲取 K 線數據
        const candles = await this.getCandles(symbol, 365);
        
        // ✅ 2. 驗證數據結構
        if (!candles || !candles.close || !Array.isArray(candles.close)) {
            console.error(`❌ Invalid candles structure for ${symbol}:`, candles);
            throw new Error('Invalid candle data structure');
        }
        
        const closePrices = candles.close;

        if (closePrices.length < 200) {
            console.warn(`⚠️ Insufficient data for ${symbol}: only ${closePrices.length} days`);
            throw new Error(`Insufficient data: need 200+ days, got ${closePrices.length}`);
        }

        console.log(`✅ Got ${closePrices.length} days of close prices for ${symbol}`);

        // ✅ 3. 計算基礎指標
        const rsi = technicalIndicators.calculateRSI(closePrices, 14);
        const ma50 = technicalIndicators.calculateSMA(closePrices, 50);
        const ma200 = technicalIndicators.calculateSMA(closePrices, 200);
        const currentPrice = closePrices[closePrices.length - 1];

        console.log(`📊 Basic indicators: RSI=${rsi?.toFixed(2)}, MA50=${ma50?.toFixed(2)}, MA200=${ma200?.toFixed(2)}`);

        // ✅ 4. 檢查基礎指標
        if (rsi === null || ma50 === null || ma200 === null) {
            console.error(`❌ Failed to calculate basic indicators for ${symbol}`);
            throw new Error('Basic indicator calculation failed');
        }

        // ✅ 5. 計算進階指標
        const macd = technicalIndicators.calculateMACDFull(closePrices);
        const bollingerBands = technicalIndicators.calculateBollingerBands(closePrices);
        const signals = technicalIndicators.detectSignals(closePrices, rsi, macd);

        const trend = technicalIndicators.getTrend(currentPrice, ma50, ma200);
        const rsiLevel = technicalIndicators.getRSILevel(rsi);
        const volatility = technicalIndicators.calculateVolatility(closePrices, 20);

        console.log(`✅ Technical indicators calculated for ${symbol}`);
        console.log(`   RSI: ${rsi.toFixed(2)}, MACD: ${macd?.macd.toFixed(2)}, Trend: ${trend}`);

        return {
            rsi: parseFloat(rsi.toFixed(2)),
            rsiLevel,
            ma50: parseFloat(ma50.toFixed(2)),
            ma200: parseFloat(ma200.toFixed(2)),
            trend,
            volatility: parseFloat(volatility.toFixed(2)),
            currentPrice: parseFloat(currentPrice.toFixed(2)),
            dataPoints: closePrices.length,
            // 新增進階指標
            macd: macd || null,
            bollingerBands: bollingerBands || null,
            signals: signals || []
        };

    } catch (error) {
        console.error(`❌ Error calculating indicators for ${symbol}:`, error.message);
        console.error('Stack trace:', error.stack);
        
        // ✅ 返回空指標而非 throw error（避免整個 API 掛掉）
        return {
            rsi: null,
            rsiLevel: { level: '未知', signal: '數據不足' },
            ma50: null,
            ma200: null,
            trend: '未知',
            volatility: null,
            currentPrice: null,
            dataPoints: 0,
            macd: null,
            bollingerBands: null,
            signals: [],
            error: error.message
        };
    }
}

/**
 * ✅ 獲取圖表數據（包含 K 線 + 技術指標歷史）
 */
async getChartData(symbol, period = '1y') {
    try {
        console.log(`📊 Getting chart data for ${symbol} (${period})...`);

        // 1️⃣ 計算需要嘅天數
        const daysMap = {
            '1w': 7,
            '1m': 30,
            '3m': 90,
            '6m': 180,
            '1y': 365,
            '5y': 1825
        };
        const daysBack = daysMap[period] || 365;

        // 2️⃣ 拎 K 線數據
        const candles = await this.getCandles(symbol, daysBack);
        
        // ✅ 正確 destructure（timestamps 唔係 dates）
        const { timestamps, open, high, low, close, volume } = candles;

        if (!close || close.length === 0) {
            throw new Error('No price data available');
        }

        console.log(`📊 Got ${close.length} candles for ${symbol}`);

        // 3️⃣ 計算技術指標歷史
        const ma50History = technicalIndicators.calculateSMAHistory(close, 50);
        const ma200History = technicalIndicators.calculateSMAHistory(close, 200);
        const macdHistory = technicalIndicators.calculateMACDHistory(close);

        console.log(`📊 Indicator lengths: MA50=${ma50History.length}, MA200=${ma200History.length}, MACD=${macdHistory.length}`);

        // 4️⃣ 對齊日期（因為 MA/MACD 會比 K 線少）
        const ma50StartIndex = close.length - ma50History.length;
        const ma200StartIndex = close.length - ma200History.length;
        const macdStartIndex = close.length - macdHistory.length;

        // 5️⃣ ✅ 返回正確格式（用 timestamps 而非 dates）
        return {
            timestamps,  // ✅ 改呢度
            candles: {
                open,
                high,
                low,
                close,
                volume
            },
            indicators: {
                ma50: {
                    data: ma50History,
                    startIndex: ma50StartIndex
                },
                ma200: {
                    data: ma200History,
                    startIndex: ma200StartIndex
                },
                macd: {
                    data: macdHistory,
                    startIndex: macdStartIndex
                }
            }
        };

    } catch (error) {
        console.error(`❌ Error getting chart data for ${symbol}:`, error.message);
        throw error;
    }
}
}

module.exports = new StockService();