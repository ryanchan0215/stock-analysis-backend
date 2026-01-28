const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    throw new Error('❌ Missing Supabase credentials in .env');
}

const supabase = createClient(supabaseUrl, supabaseKey);

// 測試連線
async function testConnection() {
    try {
        const { data, error } = await supabase
            .from('portfolios')
            .select('count')
            .limit(1);
        
        if (error && error.code !== 'PGRST116') {
            console.log('⚠️ Supabase connected (tables not created yet)');
        } else {
            console.log('✅ Supabase connected');
        }
    } catch (err) {
        console.error('❌ Supabase connection failed:', err.message);
    }
}

testConnection();

module.exports = supabase;