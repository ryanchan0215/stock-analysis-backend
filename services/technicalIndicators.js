class TechnicalIndicators {
    /**
     * 計算 RSI (相對強弱指標)
     */
    calculateRSI(prices, period = 14) {
        if (prices.length < period + 1) {
            return null;
        }

        let gains = 0;
        let losses = 0;

        // 計算初始平均漲跌
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains += change;
            } else {
                losses += Math.abs(change);
            }
        }

        let avgGain = gains / period;
        let avgLoss = losses / period;

        // 計算後續平均
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            } else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
            }
        }

        if (avgLoss === 0) return 100;
        
        const rs = avgGain / avgLoss;
        const rsi = 100 - (100 / (1 + rs));

        return rsi;
    }

    /**
     * 計算移動平均線 (SMA)
     */
    calculateSMA(prices, period) {
        if (prices.length < period) {
            return null;
        }

        const relevantPrices = prices.slice(-period);
        const sum = relevantPrices.reduce((a, b) => a + b, 0);
        return sum / period;
    }

    /**
     * ✅ 新增：計算每日移動平均線（用於畫圖表）
     */
    calculateSMAHistory(prices, period) {
        if (prices.length < period) {
            return [];
        }

        const result = [];

        // 從第 period 天開始計算
        for (let i = period - 1; i < prices.length; i++) {
            const slice = prices.slice(i - period + 1, i + 1);  // 拎最近 period 天
            const sum = slice.reduce((a, b) => a + b, 0);
            const sma = sum / period;
            result.push(parseFloat(sma.toFixed(2)));
        }

        return result;
    }

    /**
     * 計算 EMA (指數移動平均)
     */
    calculateEMA(prices, period) {
        if (prices.length < period) {
            return null;
        }

        const multiplier = 2 / (period + 1);
        let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    /**
     * 計算指定索引的 EMA
     */
    calculateEMAAtIndex(prices, period, index) {
        // 確保有足夠數據點
        // index = period - 1 時，剛好有 period 個數據
        if (index < period - 1) {
            return null;
        }
        
        const multiplier = 2 / (period + 1);
        const slice = prices.slice(0, index + 1);  // 拎頭 (index + 1) 個數據
        
        // 計算初始 SMA
        let ema = slice.slice(0, period).reduce((a, b) => a + b, 0) / period;

        // 計算 EMA
        for (let i = period; i < slice.length; i++) {
            ema = (slice[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    /**
     * 從數組計算 EMA
     */
    calculateEMAFromArray(values, period) {
        if (values.length < period) return 0;
        
        const multiplier = 2 / (period + 1);
        let ema = values.slice(0, period).reduce((a, b) => a + b, 0) / period;

        for (let i = period; i < values.length; i++) {
            ema = (values[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    /**
     * ✅ 計算每日 MACD 歷史數據（保留原有 Debug Log）
     */
    calculateMACDHistory(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        console.log('🔍 ===== MACD Debug =====');
        console.log('📊 輸入數據:', {
            pricesLength: prices.length,
            minRequired: slowPeriod + signalPeriod,
            firstPrice: prices[0],
            lastPrice: prices[prices.length - 1],
            sample: prices.slice(0, 5)  // 睇頭 5 條
        });

        if (prices.length < slowPeriod + signalPeriod) {
            console.log('❌ 數據不足！');
            return [];
        }

        const result = [];
        const macdLine = [];

        for (let i = slowPeriod - 1; i < prices.length; i++) {
            const fastEMA = this.calculateEMAAtIndex(prices, fastPeriod, i);
            const slowEMA = this.calculateEMAAtIndex(prices, slowPeriod, i);
            
            // 🔍 Debug 每一步
            if (i === slowPeriod - 1) {  // 只 log 第一次
                console.log(`🔍 第 ${i} 天:`, { 
                    fastEMA, 
                    slowEMA,
                    isFastEMAValid: !!fastEMA,
                    isSlowEMAValid: !!slowEMA
                });
            }
            
            if (fastEMA && slowEMA) {
                const macd = fastEMA - slowEMA;
                macdLine.push(macd);
                
                // 🔍 Log MACD 值
                if (i === slowPeriod - 1) {
                    console.log(`📈 MACD = ${macd.toFixed(4)}`);
                }
                
                if (macdLine.length >= signalPeriod) {
                    const signal = this.calculateEMAFromArray(macdLine, signalPeriod);
                    const histogram = macd - signal;
                    
                    result.push({
                        macd: parseFloat(macd.toFixed(4)),
                        signal: parseFloat(signal.toFixed(4)),
                        histogram: parseFloat(histogram.toFixed(4))
                    });
                } else {
                    result.push({
                        macd: parseFloat(macd.toFixed(4)),
                        signal: 0,
                        histogram: parseFloat(macd.toFixed(4))
                    });
                }
            } else {
                // 🔍 如果 EMA 計算失敗
                console.log(`❌ 第 ${i} 天 EMA 計算失敗！fastEMA=${fastEMA}, slowEMA=${slowEMA}`);
            }
        }

        console.log('✅ 最終結果:', {
            resultLength: result.length,
            first3: result.slice(0, 3),
            last3: result.slice(-3)
        });
        console.log('🔍 ===== MACD Debug End =====');

        return result;
    }

    /**
     * 計算完整 MACD（當前值，保留用於技術指標卡片）
     */
    calculateMACDFull(prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
        if (prices.length < slowPeriod + signalPeriod) {
            return null;
        }

        // 計算 MACD 歷史
        const macdHistory = [];
        for (let i = slowPeriod - 1; i < prices.length; i++) {
            const fastEMA = this.calculateEMAAtIndex(prices, fastPeriod, i);
            const slowEMA = this.calculateEMAAtIndex(prices, slowPeriod, i);
            if (fastEMA && slowEMA) {
                macdHistory.push(fastEMA - slowEMA);
            }
        }

        if (macdHistory.length < signalPeriod) {
            return null;
        }

        // 計算當前值
        const macdLine = macdHistory[macdHistory.length - 1];
        const signalLine = this.calculateEMAFromArray(macdHistory, signalPeriod);
        const histogram = macdLine - signalLine;

        return {
            macd: parseFloat(macdLine.toFixed(4)),
            signal: parseFloat(signalLine.toFixed(4)),
            histogram: parseFloat(histogram.toFixed(4))
        };
    }

    /**
     * 計算布林通道 (Bollinger Bands)
     */
    calculateBollingerBands(prices, period = 20, stdDev = 2) {
        if (prices.length < period) {
            return null;
        }

        const sma = this.calculateSMA(prices, period);
        const relevantPrices = prices.slice(-period);
        
        // 計算標準差
        const squaredDiffs = relevantPrices.map(price => 
            Math.pow(price - sma, 2)
        );
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        const standardDeviation = Math.sqrt(variance);

        return {
            upper: parseFloat((sma + (stdDev * standardDeviation)).toFixed(2)),
            middle: parseFloat(sma.toFixed(2)),
            lower: parseFloat((sma - (stdDev * standardDeviation)).toFixed(2))
        };
    }

    /**
     * 檢測買賣信號
     */
    detectSignals(prices, rsi, macd) {
        const signals = [];
        
        // RSI 信號
        if (rsi <= 30) {
            signals.push({
                type: 'buy',
                indicator: 'RSI',
                reason: 'RSI 進入超賣區 (<30)',
                strength: 'strong',
                value: rsi.toFixed(2)
            });
        } else if (rsi >= 70) {
            signals.push({
                type: 'sell',
                indicator: 'RSI',
                reason: 'RSI 進入超買區 (>70)',
                strength: 'strong',
                value: rsi.toFixed(2)
            });
        }

        // MACD 信號
        if (macd && macd.histogram > 0 && Math.abs(macd.histogram) > 0.3) {
            signals.push({
                type: 'buy',
                indicator: 'MACD',
                reason: 'MACD 柱狀圖為正（多頭）',
                strength: 'medium',
                value: macd.histogram.toFixed(2)
            });
        } else if (macd && macd.histogram < 0 && Math.abs(macd.histogram) > 0.3) {
            signals.push({
                type: 'sell',
                indicator: 'MACD',
                reason: 'MACD 柱狀圖為負（空頭）',
                strength: 'medium',
                value: macd.histogram.toFixed(2)
            });
        }

        // 金叉/死叉
        const currentPrice = prices[prices.length - 1];
        const ma50 = this.calculateSMA(prices, 50);
        const ma200 = this.calculateSMA(prices, 200);
        
        if (ma50 && ma200) {
            if (ma50 > ma200 && currentPrice > ma50) {
                signals.push({
                    type: 'buy',
                    indicator: 'Golden Cross',
                    reason: 'MA50 在 MA200 上方（金叉形態）',
                    strength: 'strong',
                    value: `${ma50.toFixed(2)} > ${ma200.toFixed(2)}`
                });
            } else if (ma50 < ma200 && currentPrice < ma50) {
                signals.push({
                    type: 'sell',
                    indicator: 'Death Cross',
                    reason: 'MA50 在 MA200 下方（死叉形態）',
                    strength: 'strong',
                    value: `${ma50.toFixed(2)} < ${ma200.toFixed(2)}`
                });
            }
        }

        return signals;
    }

    /**
     * 判斷趨勢
     */
    getTrend(currentPrice, ma50, ma200) {
        if (currentPrice > ma50 && ma50 > ma200) {
            return '上升趨勢';
        } else if (currentPrice < ma50 && ma50 < ma200) {
            return '下降趨勢';
        } else {
            return '橫行整固';
        }
    }

    /**
     * RSI 解讀
     */
    getRSILevel(rsi) {
        if (rsi >= 70) {
            return { level: '超買區', signal: '可能回調' };
        } else if (rsi <= 30) {
            return { level: '超賣區', signal: '可能反彈' };
        } else if (rsi >= 50) {
            return { level: '強勢區', signal: '偏多' };
        } else {
            return { level: '弱勢區', signal: '偏空' };
        }
    }

    /**
     * 計算波動率
     */
    calculateVolatility(prices, period = 20) {
        if (prices.length < period) {
            return null;
        }

        const relevantPrices = prices.slice(-period);
        const mean = relevantPrices.reduce((a, b) => a + b, 0) / period;
        
        const squaredDiffs = relevantPrices.map(price => Math.pow(price - mean, 2));
        const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
        
        return Math.sqrt(variance);
    }
}

module.exports = new TechnicalIndicators();