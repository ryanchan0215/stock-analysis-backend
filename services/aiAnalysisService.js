const { HfInference } = require('@huggingface/inference');

class AIAnalysisService {
    constructor() {
        this.client = new HfInference(process.env.HUGGINGFACE_TOKEN);
        
        // ✅ 使用支援 conversational 嘅免費模型
        this.models = [
            'meta-llama/Meta-Llama-3-8B-Instruct',
            'mistralai/Mistral-7B-Instruct-v0.2',
            'microsoft/Phi-3-mini-4k-instruct'
        ];
        
        this.currentModel = this.models[0];
        
        if (!process.env.HUGGINGFACE_TOKEN) {
            console.warn('⚠️ Warning: HUGGINGFACE_TOKEN not set');
        } else {
            console.log('✅ AI Service initialized with Hugging Face');
        }
    }

    /**
     * 單股分析
     */
async analyzeSingleStock(stockData, customPrompt = null) {
    const prompt = customPrompt || this.buildSingleStockPrompt(stockData);
        
        try {
            let response;
            let modelUsed = this.currentModel;
            
            // 嘗試主力模型
            try {
                console.log(`🤖 Trying primary model: ${this.currentModel}`);
                response = await this.callModelConversational(this.currentModel, prompt);
                console.log(`✅ Primary model succeeded: ${this.currentModel}`);
            } catch (error) {
                console.warn(`⚠️ ${this.currentModel} failed (${error.message}), trying backup...`);
                
                // 嘗試備用模型
                modelUsed = this.models[1];
                console.log(`🤖 Trying backup model: ${modelUsed}`);
                response = await this.callModelConversational(modelUsed, prompt);
                console.log(`✅ Backup model succeeded: ${modelUsed}`);
            }

            return {
                analysis: this.cleanResponse(response),
                timestamp: new Date().toISOString(),
                model: modelUsed
            };
        } catch (error) {
            console.error('❌ AI Analysis error:', error.message);
            
            // ✅ 如果所有模型都失敗，返回靜態分析
            console.warn('⚠️ All AI models failed, using static analysis');
            return {
                analysis: this.getStaticAnalysis(stockData),
                timestamp: new Date().toISOString(),
                model: 'static-fallback'
            };
        }
    }

    /**
     * 組合分析
     */
    async analyzePortfolio(portfolioData) {
        const prompt = this.buildPortfolioPrompt(portfolioData);
        
        try {
            let response;
            let modelUsed = this.currentModel;
            
            try {
                console.log(`🤖 Trying primary model: ${this.currentModel}`);
                response = await this.callModelConversational(this.currentModel, prompt);
                console.log(`✅ Primary model succeeded: ${this.currentModel}`);
            } catch (error) {
                console.warn(`⚠️ ${this.currentModel} failed, trying backup...`);
                modelUsed = this.models[1];
                console.log(`🤖 Trying backup model: ${modelUsed}`);
                response = await this.callModelConversational(modelUsed, prompt);
                console.log(`✅ Backup model succeeded: ${modelUsed}`);
            }

            return {
                analysis: this.cleanResponse(response),
                timestamp: new Date().toISOString(),
                model: modelUsed
            };
        } catch (error) {
            console.error('❌ AI Analysis error:', error.message);
            
            console.warn('⚠️ All AI models failed, using static analysis');
            return {
                analysis: this.getStaticPortfolioAnalysis(portfolioData),
                timestamp: new Date().toISOString(),
                model: 'static-fallback'
            };
        }
    }

    /**
     * ✅ 使用 Conversational API（支援度更高）
     */
    async callModelConversational(modelId, userMessage) {
        try {
            const systemPrompt = '你是一位資深股票分析師，擅長用貼地、人性化嘅廣東話分析股票。請用繁體中文回覆。';
            
            // ✅ 使用 chatCompletion API（支援 conversational task）
            const response = await this.client.chatCompletion({
                model: modelId,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ],
                max_tokens: 2500,
                temperature: 0.7,
                top_p: 0.95
            });

            if (!response || !response.choices || response.choices.length === 0) {
                throw new Error('No response from model');
            }

            return response.choices[0].message.content;
        } catch (error) {
            console.error(`❌ Model ${modelId} failed:`, error.message);
            throw error;
        }
    }

    /**
     * 清理回應
     */
    cleanResponse(text) {
        if (!text) return '';
        
        return text
            .replace(/<\|.*?\|>/g, '')
            .replace(/\[INST\].*?\[\/INST\]/g, '')
            .replace(/### Assistant:/g, '')
            .replace(/### User:/g, '')
            .trim();
    }

    /**
     * 靜態分析（備援方案）
     */
    getStaticAnalysis(data) {
        const { symbol, name, quote, technical, holding } = data;

        let analysis = `📊 ${symbol} - ${name || symbol} 技術分析報告\n\n`;

        // ✅ 你而家嘅狀況
        analysis += `## ✅ 你而家嘅狀況\n`;
        if (holding) {
            const totalInvest = holding.quantity * holding.buy_price;
            const currentValue = holding.quantity * quote.currentPrice;
            const pnl = currentValue - totalInvest;
            const pnlPercent = ((pnl / totalInvest) * 100).toFixed(2);
            
            analysis += `持有 ${holding.quantity} 股，成本 $${holding.buy_price}，現價 $${quote.currentPrice}\n`;
            analysis += `盈虧：${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent}%)\n\n`;
        } else {
            analysis += `你而家查緊 ${symbol} 嘅資料，未持有此股票。\n\n`;
        }

        // 👉 重點分析
        analysis += `## 👉 重點分析\n`;
        const changeDirection = quote.changePercent >= 0 ? '升' : '跌';
        analysis += `- 今日${changeDirection}咗 ${Math.abs(quote.changePercent).toFixed(2)}%\n`;
        analysis += `- RSI ${technical.rsi?.toFixed(2)} (${technical.rsiLevel?.level})\n`;
        analysis += `- 趨勢：${technical.trend}\n\n`;

        // 📊 技術面分析
        analysis += `## 📊 技術面分析\n`;
        if (technical.rsi > 70) {
            analysis += `RSI 超買，小心回調風險。股價可能短期內出現調整，唔建議追高。\n`;
        } else if (technical.rsi < 30) {
            analysis += `RSI 超賣，可能有反彈機會。如果配合其他指標確認，可以考慮分批入貨。\n`;
        } else {
            analysis += `RSI 中性，等埋其他信號先決定。暫時保持觀望，唔好急住入市。\n`;
        }

        if (quote.currentPrice > technical.ma50 && quote.currentPrice > technical.ma200) {
            analysis += `股價喺 MA50 ($${technical.ma50?.toFixed(2)}) 同 MA200 ($${technical.ma200?.toFixed(2)}) 上方，屬於強勢。呢個係「金叉」形態，趨勢向好。\n\n`;
        } else if (quote.currentPrice < technical.ma50 && quote.currentPrice < technical.ma200) {
            analysis += `股價喺 MA50 ($${technical.ma50?.toFixed(2)}) 同 MA200 ($${technical.ma200?.toFixed(2)}) 下方，屬於弱勢。呢個係「死叉」形態，小心繼續下跌。\n\n`;
        } else {
            analysis += `股價喺均線之間，等明確突破先。可能處於整固階段，耐心等待方向確立。\n\n`;
        }

        // 🎯 三種情境
        analysis += `## 🎯 三種情境\n`;
        const resistance = (quote.currentPrice * 1.05).toFixed(2);
        const support = (quote.currentPrice * 0.95).toFixed(2);
        
        analysis += `1. **樂觀情境**：如果突破阻力位 $${resistance}，可以考慮追入，目標價 $${(quote.currentPrice * 1.1).toFixed(2)}\n`;
        analysis += `2. **悲觀情境**：如果跌破支撐位 $${support}，要設止蝕位 $${(quote.currentPrice * 0.92).toFixed(2)}，減少損失\n`;
        analysis += `3. **中性情境**：喺 $${support}-$${resistance} 範圍內橫行，可以等待更好嘅入場點\n\n`;

        // 💡 行動建議
        analysis += `## 💡 行動建議\n`;
        if (technical.rsi < 30 && quote.changePercent < -2) {
            analysis += `**建議：可以考慮分批買入**\n`;
            analysis += `- 第一批：現價附近入 30%\n`;
            analysis += `- 第二批：如果再跌 3-5%，加碼 40%\n`;
            analysis += `- 保留 30% 現金應變\n`;
            analysis += `- 設止蝕位：$${support}\n\n`;
        } else if (technical.rsi > 70 && quote.changePercent > 2) {
            analysis += `**建議：可以考慮減倉或止盈**\n`;
            analysis += `- 如有盈利，可以先獲利 30-50%\n`;
            analysis += `- 設移動止盈位：跌破 $${(quote.currentPrice * 0.95).toFixed(2)} 全部沽出\n`;
            analysis += `- 唔好貪心追頂\n\n`;
        } else {
            analysis += `**建議：暫時持有觀望**\n`;
            analysis += `- 等待更明確嘅買入或賣出信號\n`;
            analysis += `- 留意支撐位 $${support} 同阻力位 $${resistance}\n`;
            analysis += `- 如果你未入場，等跌多啲先\n\n`;
        }

        // 🔥 一句總結
        analysis += `## 🔥 一句總結\n`;
        let summary = '';
        if (technical.rsi < 30) {
            summary = `${symbol} 而家${technical.trend}，${technical.rsiLevel?.signal}，可以留意反彈機會！`;
        } else if (technical.rsi > 70) {
            summary = `${symbol} 而家${technical.trend}，${technical.rsiLevel?.signal}，小心回調風險！`;
        } else {
            summary = `${symbol} 而家${technical.trend}，${technical.rsiLevel?.signal}，暫時觀望等信號！`;
        }
        analysis += `${summary}\n\n`;
        
        analysis += `---\n`;
        analysis += `⚠️ **免責聲明**：此分析由系統自動生成，僅供參考。投資有風險，入市需謹慎，請根據自身情況做決定。`;

        return analysis;
    }

    /**
     * 靜態組合分析
     */
    getStaticPortfolioAnalysis(data) {
        const { portfolio, holdings } = data;

        const totalInvest = holdings.reduce((sum, h) => sum + (h.quantity * h.buy_price), 0);
        const totalValue = holdings.reduce((sum, h) => sum + (h.quantity * h.current_price), 0);
        const totalPnl = totalValue - totalInvest;
        const totalPnlPercent = ((totalPnl / totalInvest) * 100).toFixed(2);

        let analysis = `💼 ${portfolio.name} - 投資組合分析\n\n`;

        analysis += `## 💼 組合健康度\n`;
        analysis += `總投入：$${totalInvest.toFixed(2)}\n`;
        analysis += `總市值：$${totalValue.toFixed(2)}\n`;
        analysis += `總盈虧：${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnlPercent >= 0 ? '+' : ''}${totalPnlPercent}%)\n`;
        
        let healthScore = '';
        if (parseFloat(totalPnlPercent) > 10) {
            healthScore = '優秀 🌟🌟🌟 - 繼續保持！';
        } else if (parseFloat(totalPnlPercent) > 0) {
            healthScore = '良好 🌟🌟 - 穩步增長中';
        } else if (parseFloat(totalPnlPercent) > -10) {
            healthScore = '一般 🌟 - 需要關注';
        } else {
            healthScore = '需要調整 ⚠️ - 考慮重新配置';
        }
        analysis += `健康評分：${healthScore}\n\n`;

        analysis += `## 📊 持股分析\n`;
        
        // 表現最好
        const bestStock = holdings.reduce((best, h) => {
            const pnl = ((h.current_price - h.buy_price) / h.buy_price) * 100;
            const bestPnl = best ? ((best.current_price - best.buy_price) / best.buy_price) * 100 : -Infinity;
            return pnl > bestPnl ? h : best;
        }, null);
        
        const bestPnl = ((bestStock.current_price - bestStock.buy_price) / bestStock.buy_price) * 100;
        analysis += `**表現最好**：${bestStock.symbol} (+${bestPnl.toFixed(2)}%) 💪\n`;
        
        // 需要關注
        const worstStock = holdings.reduce((worst, h) => {
            const pnl = ((h.current_price - h.buy_price) / h.buy_price) * 100;
            const worstPnl = worst ? ((worst.current_price - worst.buy_price) / worst.buy_price) * 100 : Infinity;
            return pnl < worstPnl ? h : worst;
        }, null);
        
        const worstPnl = ((worstStock.current_price - worstStock.buy_price) / worstStock.buy_price) * 100;
        analysis += `**需要關注**：${worstStock.symbol} (${worstPnl >= 0 ? '+' : ''}${worstPnl.toFixed(2)}%) ⚠️\n\n`;

        analysis += `## 🎯 配置建議\n`;
        analysis += `組合有 ${holdings.length} 隻股票，分散度${holdings.length >= 5 ? '良好' : holdings.length >= 3 ? '中等，可以增加' : '不足，建議增加到 5-8 隻'}。\n`;
        
        // 計算最大持倉佔比
        const maxWeight = Math.max(...holdings.map(h => {
            const value = h.quantity * h.current_price;
            return (value / totalValue) * 100;
        }));
        
        if (maxWeight > 40) {
            analysis += `⚠️ 最大持倉佔比 ${maxWeight.toFixed(1)}% 過高，建議控制在 30% 以下。\n\n`;
        } else {
            analysis += `✅ 持倉分散合理，單一股票風險可控。\n\n`;
        }

        analysis += `## 💡 行動計劃\n`;
        analysis += `**優先級 1**：檢視表現最差嘅股票，考慮係咪要止蝕\n`;
        analysis += `**優先級 2**：表現好嘅股票可以考慮部分獲利\n`;
        analysis += `**優先級 3**：留意市場動態，定期重新平衡\n\n`;

        analysis += `## 🔥 一句總結\n`;
        const summaryText = parseFloat(totalPnlPercent) > 0 
            ? `組合整體有賺 ${totalPnlPercent}%，繼續監察持倉！` 
            : `組合暫時蝕緊 ${totalPnlPercent}%，要檢討調整！`;
        analysis += `${summaryText}\n\n`;
        
        analysis += `---\n`;
        analysis += `⚠️ **免責聲明**：此分析由系統自動生成，僅供參考。投資有風險，請謹慎決策。`;

        return analysis;
    }

    /**
     * 構建單股分析 Prompt
     */
    buildSingleStockPrompt(data) {
        const {
            symbol,
            name,
            holding,
            quote,
            technical,
            profile,
            news
        } = data;

        const totalInvest = holding ? (holding.quantity * holding.buy_price).toFixed(2) : null;
        const currentValue = holding ? (holding.quantity * quote.currentPrice).toFixed(2) : null;
        const pnl = holding ? (currentValue - totalInvest).toFixed(2) : null;
        const pnlPercent = holding ? ((pnl / totalInvest) * 100).toFixed(2) : null;

        return `請用繁體中文、廣東話風格分析以下股票：

股票：${symbol} - ${name || profile?.name || 'N/A'}

${holding ? `持倉資料：
- 成本：$${holding.buy_price}
- 持股：${holding.quantity} 股
- 總投入：$${totalInvest}
- 目前市值：$${currentValue}
- 盈虧：${pnl >= 0 ? '+' : ''}$${pnl} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent}%)
` : '未持有此股票'}

市場數據：
- 現價：$${quote.currentPrice}
- 今日變動：${quote.change >= 0 ? '+' : ''}$${quote.change} (${quote.changePercent >= 0 ? '+' : ''}${quote.changePercent}%)
- 最高/最低：$${quote.high} / $${quote.low}

技術指標：
- RSI：${technical.rsi?.toFixed(2)} (${technical.rsiLevel?.level})
- 趨勢：${technical.trend}
- 50日均線：$${technical.ma50?.toFixed(2)} (現價${quote.currentPrice > technical.ma50 ? '在上方' : '在下方'})
- 200日均線：$${technical.ma200?.toFixed(2)} (現價${quote.currentPrice > technical.ma200 ? '在上方' : '在下方'})

${profile ? `公司資料：
- 市值：$${(profile.marketCapitalization).toFixed(2)}B
- 行業：${profile.finnhubIndustry || 'N/A'}
` : ''}

${news && news.length > 0 ? `最新新聞（近 7 日）：
${news.slice(0, 3).map((n, i) => `
${i + 1}. ${n.headline}
   來源：${n.source}
   摘要：${n.summary || '無摘要'}
   連結：${n.url}
`).join('\n')}
` : '無最新新聞'}

請按以下結構分析（用繁體中文、廣東話）：

## ✅ 你而家嘅狀況
${holding ? '（確認持倉）' : '（確認查詢）'}

## 👉 重點分析
（2-3 點關鍵觀察）

## 📊 技術面 + 基本面 + 市場情緒
（簡單解讀，用人話講）

## 🎯 三種情境
1. 樂觀：突破 $X 可以點
2. 悲觀：跌破 $X 要點做
3. 中性：橫行要點等

## 💡 行動建議
（具體、可執行）

## 🔥 一句總結

記住：用「可以考慮」、「留意」呢啲詞，唔好直接講「買」或「賣」。`;
    }

    /**
     * 構建組合分析 Prompt
     */
    buildPortfolioPrompt(data) {
        const { portfolio, holdings } = data;

        const totalInvest = holdings.reduce((sum, h) => 
            sum + (h.quantity * h.buy_price), 0);
        const totalValue = holdings.reduce((sum, h) => 
            sum + (h.quantity * h.current_price), 0);
        const totalPnl = totalValue - totalInvest;
        const totalPnlPercent = ((totalPnl / totalInvest) * 100).toFixed(2);

        const holdingsList = holdings.map(h => {
            const invest = h.quantity * h.buy_price;
            const value = h.quantity * h.current_price;
            const pnl = value - invest;
            const pnlPercent = ((pnl / invest) * 100).toFixed(2);
            const weight = ((value / totalValue) * 100).toFixed(1);

            return `${h.symbol}: 成本$${h.buy_price} 現價$${h.current_price} | 盈虧${pnl >= 0 ? '+' : ''}${pnlPercent}% | 佔比${weight}% | RSI${h.rsi?.toFixed(1)} 趨勢${h.trend}`;
        }).join('\n');

        return `請用繁體中文、廣東話風格分析以下投資組合：

組合：${portfolio.name}
總投入：$${totalInvest.toFixed(2)}
總市值：$${totalValue.toFixed(2)}
總盈虧：${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnlPercent >= 0 ? '+' : ''}${totalPnlPercent}%)
持股數：${holdings.length} 隻

持股明細：
${holdingsList}

請按以下結構分析（用繁體中文、廣東話）：

## 💼 組合健康度
（整體評分）

## 📊 持股分析
- 表現最好嘅股票
- 需要關注嘅股票

## 🎯 配置建議
- 行業分散
- 倉位調整

## 💡 行動計劃
（分優先級）

## 🔥 一句總結

用廣東話、貼地嘅語氣。`;
    }
}

module.exports = new AIAnalysisService();