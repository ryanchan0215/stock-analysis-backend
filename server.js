const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

// ===== CORS 設定 =====
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5001',
  'http://localhost:5173',  // Vite dev server
  process.env.FRONTEND_URL,  // Railway 環境變數
];

// 移除 undefined 或 null 值
const validOrigins = allowedOrigins.filter(Boolean);

console.log('✅ Allowed CORS origins:', validOrigins);

app.use(cors({
  origin: function (origin, callback) {
    // 允許沒有 origin 的請求（例如 Postman、curl）
    if (!origin) return callback(null, true);
    
    // 允許所有 Vercel deployment URLs
    if (origin.includes('.vercel.app')) {
      return callback(null, true);
    }
    
    // 檢查是否在白名單中
    if (validOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.log('❌ Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

// ===== 健康檢查 =====
const healthCheck = (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development',
        frontendUrl: process.env.FRONTEND_URL || 'Not set',
        allowedOrigins: validOrigins,
        services: {
            supabase: !!process.env.SUPABASE_URL,
            finnhub: !!process.env.FINNHUB_API_KEY,
            ai: !!process.env.HUGGINGFACE_TOKEN
        }
    });
};

// 兩個路徑都支援
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// ===== Routes =====
const portfoliosRouter = require('./routes/portfolios');
const holdingsRouter = require('./routes/holdings');
const analysisRouter = require('./routes/analysis');
const stocksRouter = require('./routes/stocks');

app.use('/api/portfolios', portfoliosRouter);
app.use('/api/holdings', holdingsRouter);
app.use('/api/analysis', analysisRouter);
app.use('/api/stocks', stocksRouter);

// ===== 404 處理 =====
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Route not found',
        path: req.path
    });
});

// ===== 錯誤處理 =====
app.use((err, req, res, next) => {
    console.error('❌ Server error:', err);
    res.status(500).json({
        success: false,
        error: err.message || 'Internal server error'
    });
});

// ===== 啟動服務器 =====
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════╗
║  🚀 Stock Analysis Backend Server     ║
╠════════════════════════════════════════╣
║  Port: ${PORT.toString().padEnd(30)}║
║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(23)}║
║  Frontend URL: ${(process.env.FRONTEND_URL || 'Not set').substring(0, 20).padEnd(20)}║
║  Supabase: ${process.env.SUPABASE_URL ? '✅' : '❌'}                    ║
║  Finnhub: ${process.env.FINNHUB_API_KEY ? '✅' : '❌'}                     ║
║  AI Service: ${process.env.HUGGINGFACE_TOKEN ? '✅' : '❌'}                  ║
╠════════════════════════════════════════╣
║  Allowed CORS Origins:                 ║
${validOrigins.map(o => `║  - ${o.padEnd(36)}║`).join('\n')}
╚════════════════════════════════════════╝
    `);
});

module.exports = app;