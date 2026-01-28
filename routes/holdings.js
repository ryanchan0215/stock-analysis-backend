const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const stockService = require('../services/stockService');

/**
 * GET /api/holdings/portfolio/:portfolioId
 * 獲取組合的所有持倉
 */
router.get('/portfolio/:portfolioId', async (req, res) => {
    try {
        const { portfolioId } = req.params;

        const { data, error } = await supabase
            .from('holdings')
            .select('*')
            .eq('portfolio_id', portfolioId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // 獲取每個持倉的最新股價
        const enrichedHoldings = await Promise.all(
            data.map(async (holding) => {
                try {
                    const quote = await stockService.getQuote(holding.symbol);
                    const technical = await stockService.getTechnicalIndicators(holding.symbol);
                    
                    const currentValue = holding.quantity * quote.currentPrice;
                    const totalCost = holding.quantity * holding.buy_price;
                    const pnl = currentValue - totalCost;
                    const pnlPercent = (pnl / totalCost) * 100;

                    return {
                        ...holding,
                        current_price: quote.currentPrice,
                        current_value: currentValue,
                        total_cost: totalCost,
                        pnl,
                        pnl_percent: pnlPercent,
                        change: quote.change,
                        change_percent: quote.changePercent,
                        rsi: technical.rsi,
                        trend: technical.trend
                    };
                } catch (err) {
                    console.error(`Error fetching data for ${holding.symbol}:`, err);
                    return holding;
                }
            })
        );

        res.json({
            success: true,
            data: enrichedHoldings
        });

    } catch (error) {
        console.error('❌ Get holdings error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/holdings
 * 新增持倉
 */
router.post('/', async (req, res) => {
    try {
        const { portfolio_id, symbol, quantity, buy_price, buy_date, notes } = req.body;

        // 驗證股票代號
        try {
            await stockService.getQuote(symbol);
        } catch (err) {
            return res.status(400).json({
                success: false,
                error: '無效的股票代號'
            });
        }

        // 獲取股票名稱
        const profile = await stockService.getProfile(symbol);

        const { data, error } = await supabase
            .from('holdings')
            .insert({
                portfolio_id,
                symbol: symbol.toUpperCase(),
                name: profile?.name || symbol,
                quantity: parseFloat(quantity),
                buy_price: parseFloat(buy_price),
                buy_date: buy_date || new Date().toISOString().split('T')[0],
                notes
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('❌ Create holding error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/holdings/:id
 * 更新持倉
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { quantity, buy_price, buy_date, notes } = req.body;

        const updates = {};
        if (quantity !== undefined) updates.quantity = parseFloat(quantity);
        if (buy_price !== undefined) updates.buy_price = parseFloat(buy_price);
        if (buy_date !== undefined) updates.buy_date = buy_date;
        if (notes !== undefined) updates.notes = notes;

        const { data, error } = await supabase
            .from('holdings')
            .update(updates)
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('❌ Update holding error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/holdings/:id
 * 刪除持倉
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('holdings')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: '持倉已刪除'
        });

    } catch (error) {
        console.error('❌ Delete holding error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});


/**
 * PATCH /api/holdings/:id/ai-suggestions
 * 儲存 AI 建議到持倉
 */
router.patch('/:id/ai-suggestions', async (req, res) => {
    try {
        const { id } = req.params;
        const { confidence, stopLoss, addMorePrice, targetPrice, action, reasoning, technicalSignals } = req.body;

        console.log(`💾 Saving AI suggestions for holding ${id}:`, {
            confidence,
            stopLoss,
            addMorePrice,
            targetPrice,
            action
        });

        // 驗證數據
        if (!confidence || !stopLoss || !addMorePrice || !targetPrice) {
            return res.status(400).json({
                success: false,
                error: '缺少必要的 AI 建議數據'
            });
        }

        const aiSuggestions = {
            confidence,
            stopLoss,
            addMorePrice,
            targetPrice,
            action,
            reasoning,
            technicalSignals,
            updatedAt: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('holdings')
            .update({
                ai_suggestions: aiSuggestions,
                ai_updated_at: new Date().toISOString()
            })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        console.log(`✅ AI suggestions saved for ${data.symbol}`);

        res.json({
            success: true,
            data,
            message: `${data.symbol} AI 建議已儲存`
        });

    } catch (error) {
        console.error('❌ Save AI suggestions error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
module.exports = router;