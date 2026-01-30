const express = require('express');
const router = express.Router();
const stockService = require('../services/stockService');
const technicalIndicators = require('../services/technicalIndicators');

/**
 * GET /api/stocks/search?q=AAPL
 * 搜尋股票
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q || q.length < 1) {
            return res.status(400).json({
                success: false,
                error: '請輸入股票代號或名稱'
            });
        }

        const results = await stockService.searchSymbol(q);

        res.json({
            success: true,
            data: results
        });

    } catch (error) {
        console.error('❌ Search error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/stocks/quote/:symbol
 * 獲取股票報價（帶完整錯誤處理）
 */
router.get('/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const upperSymbol = symbol.toUpperCase();
        
        console.log(`\n========== 🎯 API Request: /api/stocks/${upperSymbol} ==========`);

        // Fetch all data
        const [quote, profile, technical] = await Promise.all([
            stockService.getQuote(upperSymbol),
            stockService.getProfile(upperSymbol),
            stockService.getTechnicalIndicators(upperSymbol)
        ]);

        console.log(`📦 Data fetched:`);
        console.log(`   Quote:`, quote ? '✅' : '❌');
        console.log(`   Profile:`, profile ? '✅' : '❌');
        console.log(`   Technical:`, technical ? '✅' : '❌');

        // ✅ 確保 profile 有 fallback 值
        const safeProfile = {
            exchange: profile?.exchange || 'N/A',
            finnhubIndustry: profile?.finnhubIndustry || 'N/A',
            marketCapitalization: profile?.marketCapitalization || 0,
            country: profile?.country || 'N/A',
            currency: profile?.currency || 'USD',
            weburl: profile?.weburl || ''
        };

        console.log(`📤 Sending profile:`, safeProfile);

        const response = {
            success: true,
            data: {
                symbol: quote.symbol,
                name: profile?.name || upperSymbol,
                quote: {
                    currentPrice: quote.currentPrice,
                    highPrice: quote.high,
                    lowPrice: quote.low,
                    openPrice: quote.open,
                    previousClose: quote.previousClose,
                    change: quote.change,
                    changePercent: quote.changePercent,
                    timestamp: quote.timestamp
                },
                profile: safeProfile,  // ✅ 確保包含 profile
                technical: {
                    rsi: technical.rsi,
                    ma50: technical.ma50,
                    ma200: technical.ma200,
                    trend: technical.trend,
                    volatility: technical.volatility,
                    macd: technical.macd,
                    bollingerBands: technical.bollingerBands,
                    signals: technical.signals
                }
            }
        };

        console.log(`========== ✅ API Response Complete ==========\n`);
        res.json(response);

    } catch (error) {
        console.error(`❌ Error in /api/stocks/:symbol:`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/stocks/news/:symbol
 * 獲取股票新聞
 */
router.get('/news/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const news = await stockService.getNews(symbol);

        res.json({
            success: true,
            data: news
        });

    } catch (error) {
        console.error('❌ News error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * ✅ GET /api/stocks/candles/:symbol?days=60
 * 獲取 K 線數據 + 每日技術指標（MA50/MA200/MACD）
 */
router.get('/candles/:symbol', async (req, res) => {
    try {
        const { symbol } = req.params;
        const { days = 365 } = req.query;

        console.log(`📊 Fetching ${days} days of candles for ${symbol}...`);

        // ✅ 安全調用
        let candles;
        try {
            candles = await stockService.getCandles(symbol, parseInt(days));
        } catch (candleError) {
            console.error(`❌ Candles fetch failed:`, candleError);
            return res.status(500).json({
                success: false,
                error: `無法獲取 ${symbol} K 線數據：${candleError.message}`
            });
        }

        // ✅ 驗證返回數據
        if (!candles || !candles.close || candles.close.length === 0) {
            console.error(`❌ Empty candles data for ${symbol}`);
            return res.status(404).json({
                success: false,
                error: `${symbol} 沒有可用的 K 線數據`
            });
        }

        const closePrices = candles.close;

        if (closePrices.length < 200) {
            console.warn(`⚠️ Insufficient data: only ${closePrices.length} days`);
            return res.json({
                success: false,
                error: `數據不足（需要至少 200 天，目前只有 ${closePrices.length} 天）`
            });
        }

        console.log(`📊 Got ${closePrices.length} candles for ${symbol}`);

        // ✅ 計算歷史技術指標
        const ma50History = technicalIndicators.calculateSMAHistory(closePrices, 50);
        const ma200History = technicalIndicators.calculateSMAHistory(closePrices, 200);
        const macdHistory = technicalIndicators.calculateMACDHistory(closePrices);

        console.log(`📈 Calculated indicators:`);
        console.log(`   MA50: ${ma50History.length} points`);
        console.log(`   MA200: ${ma200History.length} points`);
        console.log(`   MACD: ${macdHistory.length} points`);

        // ✅ 計算每條線的起始位置
        const ma50StartIndex = closePrices.length - ma50History.length;
        const ma200StartIndex = closePrices.length - ma200History.length;
        const macdStartIndex = closePrices.length - macdHistory.length;

        // ✅ 合併數據：K 線 + 技術指標
        const chartData = candles.timestamps.map((timestamp, index) => {
            const ma50Index = index - ma50StartIndex;
            const ma200Index = index - ma200StartIndex;
            const macdIndex = index - macdStartIndex;

            return {
                date: new Date(timestamp * 1000).toLocaleDateString('zh-HK'),
                timestamp: timestamp,
                open: parseFloat(candles.open[index].toFixed(2)),
                high: parseFloat(candles.high[index].toFixed(2)),
                low: parseFloat(candles.low[index].toFixed(2)),
                close: parseFloat(candles.close[index].toFixed(2)),
                volume: candles.volume[index],
                ma50: ma50Index >= 0 ? ma50History[ma50Index] : null,
                ma200: ma200Index >= 0 ? ma200History[ma200Index] : null,
                macd: macdIndex >= 0 ? macdHistory[macdIndex].macd : null,
                signal: macdIndex >= 0 ? macdHistory[macdIndex].signal : null,
                histogram: macdIndex >= 0 ? macdHistory[macdIndex].histogram : null
            };
        });

        res.json({
            success: true,
            data: {
                symbol: symbol.toUpperCase(),
                dataPoints: chartData.length,
                candles: chartData,
                summary: {
                    firstDate: chartData[0]?.date,
                    lastDate: chartData[chartData.length - 1]?.date,
                    highestPrice: Math.max(...candles.high),
                    lowestPrice: Math.min(...candles.low),
                    averageVolume: (candles.volume.reduce((a, b) => a + b, 0) / candles.volume.length).toFixed(0),
                    indicators: {
                        ma50Points: ma50History.length,
                        ma200Points: ma200History.length,
                        macdPoints: macdHistory.length
                    }
                }
            }
        });

    } catch (error) {
        console.error('❌ Candles route error:', error);
        res.status(500).json({
            success: false,
            error: error.message || '無法獲取 K 線數據'
        });
    }
});

module.exports = router;