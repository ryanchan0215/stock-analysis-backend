const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

/**
 * GET /api/portfolios/user/:userId
 * 獲取用戶的所有組合
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const { data, error } = await supabase
            .from('portfolios')
            .select(`
                *,
                holdings (
                    id,
                    symbol,
                    quantity,
                    buy_price
                )
            `)
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('❌ Get portfolios error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/portfolios
 * 新建組合
 */
router.post('/', async (req, res) => {
    try {
        const { user_id, name, description } = req.body;

        const { data, error } = await supabase
            .from('portfolios')
            .insert({
                user_id,
                name,
                description
            })
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('❌ Create portfolio error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * PUT /api/portfolios/:id
 * 更新組合
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description } = req.body;

        const { data, error } = await supabase
            .from('portfolios')
            .update({ name, description })
            .eq('id', id)
            .select()
            .single();

        if (error) throw error;

        res.json({
            success: true,
            data
        });

    } catch (error) {
        console.error('❌ Update portfolio error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * DELETE /api/portfolios/:id
 * 刪除組合
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const { error } = await supabase
            .from('portfolios')
            .delete()
            .eq('id', id);

        if (error) throw error;

        res.json({
            success: true,
            message: '組合已刪除'
        });

    } catch (error) {
        console.error('❌ Delete portfolio error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;