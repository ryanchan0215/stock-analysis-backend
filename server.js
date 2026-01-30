const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'http://localhost:5001',  // ← 加呢行
    'https://stock-analysis-frontend-gules.vercel.app'
  ],
  credentials: true
}));

app.use(express.json());

// 健康檢查
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        services: {
            supabase: !!process.env.SUPABASE_URL,
            finnhub: !!process.env.FINNHUB_API_KEY,
            ai: !!process.env.HUGGINGFACE_TOKEN
        }
    });
});



// Routes
const portfoliosRouter = require('./routes/portfolios');
const holdingsRouter = require('./routes/holdings');
const analysisRouter = require('./routes/analysis');
const stocksRouter = require('./routes/stocks');  // 新增

app.use('/api/portfolios', portfoliosRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/stocks', stocksRouter);  // 新增


// 404 處理
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found'
    });
});

// 錯誤處理
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// 啟動服務器
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  🚀 Stock Analysis Backend Server     ║
╠════════════════════════════════════════╣
║  Port: ${PORT}                            ║
║  Environment: ${process.env.NODE_ENV || 'development'}              ║
║  Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}                    ║
║  Finnhub: ${process.env.FINNHUB_API_KEY ? '✅' : '❌'}                     ║
║  AI Service: ${process.env.HUGGINGFACE_TOKEN ? '✅' : '❌'}                  ║
╚════════════════════════════════════════╝
    `);
});

module.exports = app;