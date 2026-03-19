const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = "AI-******"; //API密钥
const proxyAgent = new HttpsProxyAgent('http://127.0.0.1:9910'); //科学上网的代理地址

app.post('/api/gemini', async (req, res) => {
    try {
        console.log('收到请求:', req.body);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${API_KEY}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(req.body),
                agent: proxyAgent
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google API 错误:', response.status, errorText);
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        console.log('成功响应');
        res.json(data);

    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('代理服务器运行在 http://localhost:3000');
    console.log('使用代理: http://127.0.0.1:9910');
});