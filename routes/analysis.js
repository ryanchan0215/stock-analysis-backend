const express = require('express');
const router = express.Router();
const aiAnalysisService = require('../services/aiAnalysisService');
const stockService = require('../services/stockService');
const supabase = require('../config/supabase');
const { HfInference } = require('@huggingface/inference');

// ✅ 統一用 Hugging Face SDK
const hfClient = new HfInference(process.env.HUGGINGFACE_TOKEN);

if (!process.env.HUGGINGFACE_TOKEN) {
  console.error('❌ HUGGINGFACE_TOKEN not found in .env');
} else {
  console.log('✅ Hugging Face Token loaded:', process.env.HUGGINGFACE_TOKEN.substring(0, 10) + '...');
}

// ==================== 原有功能：單股分析 ====================

router.post('/stock/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params;
    const { userId, holdingId, customPrompt } = req.body;

    console.log(`📊 Analyzing stock: ${symbol}`);
    if (customPrompt) {
      console.log('🎯 Using custom prompt from frontend');
    }

    // 獲取股票數據
    const [quote, profile, news] = await Promise.all([
      stockService.getQuote(symbol),
      stockService.getProfile(symbol),
      stockService.getNews(symbol)
    ]);

    // 計算技術指標
    const technical = await stockService.getTechnicalIndicators(symbol);

    // 獲取持倉資料（如果有）
    let holding = null;
    if (holdingId) {
      const { data } = await supabase
        .from('holdings')
        .select('*')
        .eq('id', holdingId)
        .single();
      holding = data;
    }

    // 準備分析數據
    const analysisData = {
      symbol,
      name: profile?.name,
      holding,
      quote,
      technical,
      profile,
      news
    };

    // ✅ 呼叫 AI 分析（傳入 customPrompt）
    const result = await aiAnalysisService.analyzeSingleStock(
      analysisData,
      customPrompt
    );

    // 儲存分析結果到資料庫
    if (userId && holdingId) {
      await supabase.from('analyses').insert({
        user_id: userId,
        holding_id: holdingId,
        analysis_type: 'stock',
        analysis_data: result,
        created_at: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 原有功能：組合分析 ====================

router.post('/portfolio/:portfolioId', async (req, res) => {
  try {
    const { portfolioId } = req.params;
    const { userId, customPrompt } = req.body;

    console.log(`📊 Analyzing portfolio: ${portfolioId}`);
    if (customPrompt) {
      console.log('🎯 Using custom prompt from frontend');
    }

    // 獲取組合資料
    const { data: portfolio } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single();

    if (!portfolio) {
      return res.status(404).json({
        success: false,
        error: '找不到此投資組合'
      });
    }

    // 獲取所有持倉
    const { data: holdings } = await supabase
      .from('holdings')
      .select('*')
      .eq('portfolio_id', portfolioId);

    if (!holdings || holdings.length === 0) {
      return res.status(400).json({
        success: false,
        error: '此組合沒有任何持倉'
      });
    }

    // 獲取每個持倉的最新數據
    const enrichedHoldings = await Promise.all(
      holdings.map(async (holding) => {
        const [quote, technical] = await Promise.all([
          stockService.getQuote(holding.symbol),
          stockService.getTechnicalIndicators(holding.symbol)
        ]);

        return {
          ...holding,
          current_price: quote.currentPrice,
          change: quote.change,
          change_percent: quote.changePercent,
          rsi: technical.rsi,
          trend: technical.trend
        };
      })
    );

    // 準備分析數據
    const analysisData = {
      portfolio,
      holdings: enrichedHoldings
    };

    // ✅ 呼叫 AI 分析（傳入 customPrompt）
    const result = await aiAnalysisService.analyzePortfolio(
      analysisData,
      customPrompt
    );

    // 儲存分析結果
    if (userId) {
      await supabase.from('analyses').insert({
        user_id: userId,
        portfolio_id: portfolioId,
        analysis_type: 'portfolio',
        analysis_data: result,
        created_at: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: result
    });

  } catch (error) {
    console.error('❌ Analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 原有功能：分析歷史 ====================

router.get('/history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;

    const { data, error } = await supabase
      .from('analyses')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data
    });

  } catch (error) {
    console.error('❌ Get history error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 🔥 新功能：持倉詳細分析（完整優化版） ====================

router.post('/holdings', async (req, res) => {
  try {
    const { holdings } = req.body;

    if (!holdings || holdings.length === 0) {
      return res.status(400).json({
        success: false,
        error: '請提供持倉數據'
      });
    }

    console.log(`📊 Analyzing ${holdings.length} holdings...`);

    const advice = [];

    for (const holding of holdings) {
      try {
        // 1️⃣ 獲取股票數據
        const [quote, technical, news] = await Promise.all([
          stockService.getQuote(holding.symbol),
          stockService.getTechnicalIndicators(holding.symbol),
          stockService.getNews(holding.symbol).catch(() => [])
        ]);

        // 2️⃣ 計算技術信號（✅ 修正版）
        const signals = calculateTechnicalSignals(technical, quote);

        // 3️⃣ 生成 AI 建議
        const aiAdvice = await generateHoldingAdvice(holding, quote, technical, signals, news);

        advice.push(aiAdvice);

        console.log(`✅ Analyzed ${holding.symbol}: ${aiAdvice.action} (${aiAdvice.confidence}%)`);

      } catch (error) {
        console.error(`❌ Analyze ${holding.symbol} error:`, error.message);
        advice.push({
          symbol: holding.symbol,
          action: 'HOLD',
          confidence: 0,
          targetPrice: holding.current_price || 0,
          stopLoss: (holding.current_price || 0) * 0.95,
          addMorePrice: (holding.current_price || 0) * 0.95,
          reasoning: `無法獲取 ${holding.symbol} 數據，建議手動檢查`,
          technicalSignals: {
            macd: { text: 'N/A', score: 0 },
            rsi: { text: 'N/A', score: 0 },
            ma: { text: 'N/A', score: 0 },
            bollinger: { text: 'N/A', score: 0 },
            overall: 'N/A'
          }
        });
      }
    }

    // 🔥 組合整體建議
    const portfolioSummary = generatePortfolioSummary(holdings, advice);

    res.json({
      success: true,
      data: { 
        advice,
        summary: portfolioSummary
      }
    });

  } catch (error) {
    console.error('❌ Holdings analysis error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ==================== 🔥 修正版：技術信號計算（返回評分） ====================

function calculateTechnicalSignals(technical, quote) {
  const signals = {
    macd: { text: 'N/A', score: 0 },
    rsi: { text: 'N/A', score: 0 },
    ma: { text: 'N/A', score: 0 },
    bollinger: { text: 'N/A', score: 0 },
    overall: 'N/A',
    bullishScore: 0,
    bearishScore: 0
  };

  // ===== MACD 信號 (2.5分) =====
  if (technical.macd) {
    const { macd, signal, histogram } = technical.macd;
    
    if (macd > signal && histogram > 0) {
      const strength = Math.min(2.5, Math.abs(histogram) * 0.5);
      signals.macd = {
        text: `金叉 ✅ (DIF: ${macd.toFixed(2)} > DEA: ${signal.toFixed(2)})`,
        score: strength
      };
      signals.bullishScore += 8;
    } else if (macd < signal && histogram < 0) {
      const strength = Math.max(0.5, 2.5 - Math.abs(histogram) * 0.5);
      signals.macd = {
        text: `死叉 ❌ (DIF: ${macd.toFixed(2)} < DEA: ${signal.toFixed(2)})`,
        score: strength
      };
      signals.bearishScore += 8;
    } else {
      signals.macd = {
        text: `中性 ⏸️ (Histogram: ${histogram.toFixed(2)})`,
        score: 1.5
      };
    }
  }

  // ===== RSI 信號 (2.5分) =====
  if (technical.rsi) {
    const rsi = technical.rsi;
    let score = 0;
    let text = '';
    
    if (rsi > 70) {
      score = 0.5 + (80 - rsi) / 10;
      text = `超買 (${rsi.toFixed(1)}) ⚠️`;
      signals.bearishScore += 7;
    } else if (rsi < 30) {
      score = 2.5;
      text = `超賣 (${rsi.toFixed(1)}) 📈`;
      signals.bullishScore += 7;
    } else if (rsi >= 50) {
      score = 1.5 + (rsi - 50) / 20;
      text = `正常 (${rsi.toFixed(1)}) ✅`;
      signals.bullishScore += 3;
    } else {
      score = 1.0 + rsi / 50;
      text = `偏弱 (${rsi.toFixed(1)})`;
    }
    
    signals.rsi = { text, score };
  }

  // ===== 均線信號 (2.5分) =====
  if (technical.ma50 && technical.ma200) {
    const currentPrice = quote?.currentPrice || 0;
    let score = 0;
    let text = '';
    
    if (technical.ma50 > technical.ma200) {
      if (currentPrice > technical.ma50 && currentPrice > technical.ma200) {
        score = 2.5;
        text = '黃金交叉 ✅（價格在兩條均線上方）';
      } else if (currentPrice > technical.ma50) {
        score = 1.8;
        text = '黃金交叉 ✅（價格在 MA50 上方）';
      } else {
        score = 1.2;
        text = '黃金交叉（但價格在均線下方）';
      }
      signals.bullishScore += 8;
    } else {
      if (currentPrice < technical.ma50 && currentPrice < technical.ma200) {
        score = 0.5;
        text = '死亡交叉 ❌（價格在兩條均線下方）';
      } else if (currentPrice > technical.ma200) {
        score = 1.5;
        text = '死亡交叉（但價格在 MA200 上方）';
      } else {
        score = 1.0;
        text = '死亡交叉 ❌';
      }
      signals.bearishScore += 8;
    }
    
    signals.ma = { text, score };
  }

  // ===== 布林通道信號 (2.5分) =====
  if (technical.bollingerBands) {
    const { upper, middle, lower } = technical.bollingerBands;
    const currentPrice = quote?.currentPrice || 0;
    let score = 0;
    let text = '';
    
    const bandwidth = ((upper - lower) / middle * 100).toFixed(1);
    
    if (currentPrice > upper) {
      score = 0.8;
      text = `突破上軌 ⚠️ (帶寬: ${bandwidth}%)`;
      signals.bearishScore += 5;
    } else if (currentPrice < lower) {
      score = 2.5;
      text = `跌破下軌 📈 (帶寬: ${bandwidth}%)`;
      signals.bullishScore += 7;
    } else if (currentPrice > middle) {
      score = 1.5;
      text = `上半區 (帶寬: ${bandwidth}%)`;
    } else {
      score = 1.2;
      text = `下半區 (帶寬: ${bandwidth}%)`;
    }
    
    signals.bollinger = { text, score };
  }

  // ===== 綜合評分 =====
  const totalScore = signals.bullishScore + signals.bearishScore;
  if (totalScore > 0) {
    const bullishPercent = (signals.bullishScore / totalScore) * 100;
    if (bullishPercent > 60) {
      signals.overall = `看多 ${bullishPercent.toFixed(0)}% 📈`;
    } else if (bullishPercent < 40) {
      signals.overall = `看空 ${(100 - bullishPercent).toFixed(0)}% 📉`;
    } else {
      signals.overall = '中性 ⏸️';
    }
  }

  return signals;
}

// 🔥 智能價位計算（根據技術指標動態調整）
function calculateSmartPrices(currentPrice, buyPrice, technical, signals) {
  let stopLoss, addMorePrice, targetPrice;
  let stopLossReason, addMoreReason, targetReason;

  // 📊 計算盈虧百分比
  const pnlPercent = ((currentPrice - buyPrice) / buyPrice) * 100;
  const isProfit = pnlPercent > 0;

  console.log(`💰 買入價: $${buyPrice.toFixed(2)}, 現價: $${currentPrice.toFixed(2)}, 盈虧: ${pnlPercent.toFixed(2)}%`);

  // ==================== 1️⃣ 止損價（基於現價） ====================
  if (isProfit) {
    if (pnlPercent > 20) {
      stopLoss = Math.max(buyPrice * 1.10, currentPrice * 0.90);
      stopLossReason = `盈利超過 20%，止損設喺成本價上方 10% 以保護利潤`;
    } else if (pnlPercent > 10) {
      stopLoss = Math.max(buyPrice * 1.05, currentPrice * 0.92);
      stopLossReason = `盈利超過 10%，止損設喺成本價上方 5%`;
    } else {
      stopLoss = Math.max(buyPrice, currentPrice * 0.93);
      stopLossReason = `小幅盈利，止損設喺成本價附近`;
    }
  } else {
    if (pnlPercent < -20) {
      stopLoss = currentPrice * 0.90;
      stopLossReason = `已虧損 ${Math.abs(pnlPercent).toFixed(1)}%，止損設喺現價下方 10%`;
    } else if (pnlPercent < -10) {
      stopLoss = currentPrice * 0.88;
      stopLossReason = `已虧損 ${Math.abs(pnlPercent).toFixed(1)}%，止損設喺現價下方 12%`;
    } else {
      stopLoss = Math.min(buyPrice * 0.90, currentPrice * 0.88);
      stopLossReason = `小幅虧損，止損設喺成本價下方 10%`;
    }
  }

  // ==================== 2️⃣ 加倉價（基於現價） ====================
  if (isProfit) {
    if (technical.rsi > 70) {
      addMorePrice = currentPrice * 0.93;
      addMoreReason = `RSI 超買 (${technical.rsi.toFixed(1)})，等回調 7% 先加倉`;
    } else {
      addMorePrice = currentPrice * 0.95;
      addMoreReason = `現價已盈利，等回調 5% 先加倉`;
    }
  } else {
    if (pnlPercent < -30) {
      addMorePrice = currentPrice * 0.98;
      addMoreReason = `已虧損 ${Math.abs(pnlPercent).toFixed(1)}%，可考慮攤平成本（慎重！）`;
    } else if (pnlPercent < -20) {
      addMorePrice = currentPrice * 0.95;
      addMoreReason = `已虧損 ${Math.abs(pnlPercent).toFixed(1)}%，等跌多 5% 先考慮加倉`;
    } else {
      addMorePrice = currentPrice * 0.92;
      addMoreReason = `小幅虧損，等回調 8% 先考慮加倉`;
    }
  }

  // ==================== 3️⃣ 目標價（基於買入價） ====================
  if (isProfit) {
    if (signals.overall.includes('看多')) {
      targetPrice = currentPrice * 1.15;
      targetReason = `技術面看多，目標再升 15%`;
    } else {
      targetPrice = currentPrice * 1.08;
      targetReason = `技術面中性，目標升 8%`;
    }
  } else {
    const breakEvenTarget = buyPrice * 1.05;
    
    if (pnlPercent < -30) {
      targetPrice = buyPrice;
      targetReason = `已虧損 ${Math.abs(pnlPercent).toFixed(1)}%，第一目標：回到成本價 $${buyPrice.toFixed(2)}`;
    } else if (pnlPercent < -20) {
      targetPrice = breakEvenTarget;
      targetReason = `已虧損 ${Math.abs(pnlPercent).toFixed(1)}%，目標：回本 + 5%`;
    } else {
      targetPrice = Math.max(breakEvenTarget, currentPrice * 1.10);
      targetReason = `小幅虧損，目標：回本 + 5% 或現價升 10%（取較高者）`;
    }

    if (signals.overall.includes('看多') && technical.rsi < 50) {
      targetPrice = Math.max(targetPrice, buyPrice * 1.10);
      targetReason += `（技術面轉強，可上望成本價上方 10%）`;
    }
  }

  // ==================== 4️⃣ 參考技術位 ====================
  if (technical.ma50) {
    if (currentPrice < technical.ma50 && addMorePrice > technical.ma50) {
      addMorePrice = technical.ma50 * 0.98;
      addMoreReason = `參考 MA50 支撐位 $${technical.ma50.toFixed(2)}`;
    }
    
    if (currentPrice < technical.ma50 && targetPrice < technical.ma50 * 1.05) {
      targetPrice = Math.max(targetPrice, technical.ma50 * 1.05);
      targetReason += ` (突破 MA50 $${technical.ma50.toFixed(2)} 後上望 5%)`;
    }
  }

  if (technical.ma200) {
    if (currentPrice < technical.ma200 && stopLoss < technical.ma200 * 0.95) {
      stopLoss = Math.max(stopLoss, technical.ma200 * 0.95);
      stopLossReason = `參考 MA200 支撐位 $${technical.ma200.toFixed(2)}`;
    }
  }

  if (technical.bollingerBands) {
    const { upper, lower } = technical.bollingerBands;
    
    if (lower && currentPrice < lower * 1.05) {
      addMorePrice = Math.min(addMorePrice, lower * 1.02);
      addMoreReason = `現價接近布林下軌 $${lower.toFixed(2)}，可考慮加倉`;
    }
    
    if (upper && targetPrice < upper) {
      targetPrice = Math.max(targetPrice, upper * 0.98);
      targetReason += ` (參考布林上軌 $${upper.toFixed(2)})`;
    }
  }

  // 最終驗證
  stopLoss = Math.min(stopLoss, currentPrice * 0.95);
  addMorePrice = Math.min(addMorePrice, currentPrice * 0.98);
  
  if (!isProfit || pnlPercent < 50) {
    targetPrice = Math.max(targetPrice, currentPrice * 1.02);
  }

  console.log(`🎯 最終價位：止損 $${stopLoss.toFixed(2)}, 加倉 $${addMorePrice.toFixed(2)}, 目標 $${targetPrice.toFixed(2)}`);

  return {
    stopLoss: parseFloat(stopLoss.toFixed(2)),
    addMorePrice: parseFloat(addMorePrice.toFixed(2)),
    targetPrice: parseFloat(targetPrice.toFixed(2)),
    stopLossReason,
    addMoreReason,
    targetReason
  };
}

// 🔥 根據技術信號計算基礎信心度
function calculateBaseConfidence(signals, technical, pnlPercent) {
  let confidence = 50;

  const totalScore = signals.bullishScore + signals.bearishScore;
  if (totalScore > 0) {
    const bullishPercent = (signals.bullishScore / totalScore) * 100;
    
    if (bullishPercent > 70) {
      confidence += 25;
    } else if (bullishPercent > 55) {
      confidence += 15;
    } else if (bullishPercent < 30) {
      confidence -= 25;
    } else if (bullishPercent < 45) {
      confidence -= 15;
    }
  }

  if (technical.rsi) {
    if (technical.rsi > 70) {
      confidence -= 8;
    } else if (technical.rsi < 30) {
      confidence += 8;
    } else if (technical.rsi >= 45 && technical.rsi <= 55) {
      confidence += 5;
    }
  }

  if (pnlPercent > 20) {
    confidence += 10;
  } else if (pnlPercent > 10) {
    confidence += 5;
  } else if (pnlPercent < -20) {
    confidence -= 15;
  } else if (pnlPercent < -10) {
    confidence -= 8;
  }

  if (signals.macd.text.includes('金叉')) {
    confidence += 6;
  } else if (signals.macd.text.includes('死叉')) {
    confidence -= 6;
  }

  if (signals.ma.text.includes('黃金交叉')) {
    confidence += 5;
  } else if (signals.ma.text.includes('死亡交叉')) {
    confidence -= 5;
  }

  const randomAdjustment = Math.floor(Math.random() * 7) - 3;
  confidence += randomAdjustment;

  confidence = Math.max(15, Math.min(95, confidence));

  console.log(`📊 ${technical.rsi ? 'RSI:' + technical.rsi.toFixed(1) : ''} | 盈虧:${pnlPercent.toFixed(1)}% | 基礎信心度: ${confidence}`);

  return confidence;
}

// ✅ 生成持倉建議
async function generateHoldingAdvice(holding, quote, technical, signals, news) {
  const currentPrice = quote.currentPrice;
  const buyPrice = holding.buy_price || holding.buyPrice || currentPrice;
  const pnlPercent = ((currentPrice - buyPrice) / buyPrice) * 100;

  const prices = calculateSmartPrices(currentPrice, buyPrice, technical, signals);
  const baseConfidence = calculateBaseConfidence(signals, technical, pnlPercent);

  const prompt = `你係專業投資顧問，請用**繁體中文、廣東話**分析以下持倉並提供建議：

股票：${holding.symbol}
買入價：$${buyPrice.toFixed(2)}
現價：$${currentPrice.toFixed(2)}
盈虧：${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%

技術信號（系統計算）：
- MACD：${signals.macd.text} (評分: ${signals.macd.score.toFixed(1)}/2.5)
- RSI：${signals.rsi.text} (評分: ${signals.rsi.score.toFixed(1)}/2.5)
- 均線：${signals.ma.text} (評分: ${signals.ma.score.toFixed(1)}/2.5)
- 布林通道：${signals.bollinger.text} (評分: ${signals.bollinger.score.toFixed(1)}/2.5)
- 綜合：${signals.overall}
- 技術評分：看多 ${signals.bullishScore} 分 vs 看空 ${signals.bearishScore} 分

${technical.ma50 ? `- MA50：$${technical.ma50.toFixed(2)} (現價${currentPrice > technical.ma50 ? '在上方 ✅' : '在下方 ⚠️'})` : ''}
${technical.ma200 ? `- MA200：$${technical.ma200.toFixed(2)} (現價${currentPrice > technical.ma200 ? '在上方 ✅' : '在下方 ⚠️'})` : ''}

${news && news.length > 0 ? `
📰 最新新聞（${news.length} 條）：
${news.slice(0, 3).map((n, i) => `${i + 1}. ${n.headline}`).join('\n')}
` : ''}

系統建議價位（你可以微調 ±3-5%）：
- 🚨 止損價：$${prices.stopLoss.toFixed(2)} (${((prices.stopLoss / currentPrice - 1) * 100).toFixed(1)}%)
  理由：${prices.stopLossReason}
- 💰 加倉價：$${prices.addMorePrice.toFixed(2)} (${((prices.addMorePrice / currentPrice - 1) * 100).toFixed(1)}%)
  理由：${prices.addMoreReason}
- 🎯 目標價：$${prices.targetPrice.toFixed(2)} (${((prices.targetPrice / currentPrice - 1) * 100).toFixed(1)}%)
  理由：${prices.targetReason}

請提供：
1. **操作建議**（HOLD/BUY_MORE/REDUCE/SELL）
2. **信心度**（${baseConfidence - 8} 到 ${baseConfidence + 8} 之間的具體數字）
   - 系統計算基礎信心度為 ${baseConfidence}
   - 根據你的判斷微調 ±5-8 分
3. **確認或調整上述 3 個價位**
4. **理由**（80-120 字，廣東話）

請用 JSON 格式返回：
{
  "action": "HOLD",
  "confidence": ${baseConfidence},
  "targetPrice": ${prices.targetPrice.toFixed(2)},
  "stopLoss": ${prices.stopLoss.toFixed(2)},
  "addMorePrice": ${prices.addMorePrice.toFixed(2)},
  "reasoning": "技術面偏強，MACD 評分 ${signals.macd.score.toFixed(1)}/2.5。建議繼續持有。"
}`;

  try {
    console.log(`🤖 Calling Hugging Face API for ${holding.symbol}...`);

    const models = [
      'meta-llama/Meta-Llama-3-8B-Instruct',
      'mistralai/Mistral-7B-Instruct-v0.2'
    ];

    let response;
    for (const model of models) {
      try {
        console.log(`🤖 Trying model: ${model}`);
        response = await hfClient.chatCompletion({
          model: model,
          messages: [
            { role: 'system', content: '你是專業投資顧問，用廣東話回覆。' },
            { role: 'user', content: prompt }
          ],
          max_tokens: 1024,
          temperature: 0.7
        });
        console.log(`✅ Model ${model} succeeded`);
        break;
      } catch (error) {
        console.warn(`⚠️ Model ${model} failed:`, error.message);
        if (model === models[models.length - 1]) throw error;
      }
    }

    const aiText = response.choices[0].message.content;
    console.log(`✅ AI Response for ${holding.symbol}:`, aiText.substring(0, 100) + '...');

    const jsonMatch = aiText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const aiAdvice = JSON.parse(jsonMatch[0]);
      
      let finalConfidence = aiAdvice.confidence || baseConfidence;
      if ([0, 25, 50, 75, 100].includes(finalConfidence)) {
        const adjustment = Math.floor(Math.random() * 8) + 1;
        finalConfidence = finalConfidence + (Math.random() > 0.5 ? adjustment : -adjustment);
        finalConfidence = Math.max(0, Math.min(100, finalConfidence));
        console.log(`⚠️ AI returned round number ${aiAdvice.confidence}, adjusted to ${finalConfidence}`);
      }
      
      return {
        symbol: holding.symbol,
        action: aiAdvice.action || 'HOLD',
        confidence: finalConfidence,
        targetPrice: aiAdvice.targetPrice || prices.targetPrice,
        stopLoss: aiAdvice.stopLoss || prices.stopLoss,
        addMorePrice: aiAdvice.addMorePrice || prices.addMorePrice,
        reasoning: aiAdvice.reasoning || aiText.substring(0, 200),
        technicalSignals: signals  // ✅ 包含新的評分結構
      };
    }

    return {
      symbol: holding.symbol,
      action: 'HOLD',
      confidence: baseConfidence,
      targetPrice: prices.targetPrice,
      stopLoss: prices.stopLoss,
      addMorePrice: prices.addMorePrice,
      reasoning: aiText.substring(0, 200) || '技術面偏中性，建議繼續觀察',
      technicalSignals: signals
    };

  } catch (error) {
    console.error(`❌ AI analysis error for ${holding.symbol}:`, error.message);
    
    return {
      symbol: holding.symbol,
      action: 'HOLD',
      confidence: baseConfidence,
      targetPrice: prices.targetPrice,
      stopLoss: prices.stopLoss,
      addMorePrice: prices.addMorePrice,
      reasoning: `AI 分析失敗，但系統根據技術指標建議：${prices.targetReason}`,
      technicalSignals: signals
    };
  }
}

// 🔥 組合整體建議
function generatePortfolioSummary(holdings, advice) {
  const totalHoldings = holdings.length;
  const actionsCount = {
    HOLD: advice.filter(a => a.action === 'HOLD').length,
    BUY_MORE: advice.filter(a => a.action === 'BUY_MORE').length,
    REDUCE: advice.filter(a => a.action === 'REDUCE').length,
    SELL: advice.filter(a => a.action === 'SELL').length
  };

  const avgConfidence = (advice.reduce((sum, a) => sum + a.confidence, 0) / advice.length).toFixed(0);
  
  const needAction = actionsCount.BUY_MORE + actionsCount.REDUCE + actionsCount.SELL;
  const highRisk = actionsCount.SELL;
  const opportunities = actionsCount.BUY_MORE;

  let suggestion = '';
  if (highRisk > 0) {
    suggestion = `⚠️ 有 ${highRisk} 隻股票建議清倉，請優先處理高風險項目`;
  } else if (needAction > totalHoldings / 2) {
    suggestion = `⚠️ 超過一半持倉需要調整 (${needAction}/${totalHoldings})，建議檢討組合配置`;
  } else if (opportunities > 0) {
    suggestion = `📈 有 ${opportunities} 隻股票適合加倉，可考慮增持優質標的`;
  } else {
    suggestion = '✅ 組合整體穩健，繼續監察即可';
  }

  return {
    totalHoldings,
    actionsCount,
    avgConfidence: parseInt(avgConfidence),
    needAction,
    highRisk,
    opportunities,
    suggestion
  };
}

module.exports = router;