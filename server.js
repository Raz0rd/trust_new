const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = 'https://hero-sms.com/stubs/handler_api.php';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '.')));

// Proxy endpoint for HeroSMS API
app.get('/api/proxy', async (req, res) => {
    console.log('Requisição recebida:', req.query);
    try {
        const { api_key, action, ...params } = req.query;
        
        if (!api_key || !action) {
            return res.status(400).json({ error: 'Missing api_key or action' });
        }
        
        const url = new URL(API_BASE);
        url.searchParams.set('api_key', api_key);
        url.searchParams.set('action', action);
        
        Object.entries(params).forEach(([key, value]) => {
            url.searchParams.set(key, value);
        });
        
        const response = await fetch(url.toString());
        const text = await response.text();
        
        console.log('=== RESPOSTA API ===');
        console.log('Action:', action);
        console.log('Response:', text);
        console.log('====================');
        
        // Try to parse as JSON
        try {
            const json = JSON.parse(text);
            res.json(json);
        } catch {
            res.send(text);
        }
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({ error: 'Proxy request failed' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
