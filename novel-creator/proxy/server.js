const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const HttpsProxyAgent = require('https-proxy-agent');

const app = express();
app.use(cors());
app.use(express.json());

const API_KEY = "AI-******"; // 您的真实 Google API 密钥
const proxyAgent = new HttpsProxyAgent('http://127.0.0.1:9910'); // 科学上网代理

// 获取模型列表（真实转发）
app.get('/v1beta/models', async (req, res) => {
    console.log('收到获取模型列表请求');
    try {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            agent: proxyAgent
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google API 错误:', response.status, errorText);
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        console.log('成功获取模型列表');
        res.json(data);
    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 获取单个模型详情（真实转发，可选）
app.get('/v1beta/models/:model', async (req, res) => {
    const model = req.params.model;
    console.log(`收到获取模型详情请求，模型: ${model}`);
    try {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}?key=${API_KEY}`;
        const response = await fetch(targetUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
            agent: proxyAgent
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Google API 错误:', response.status, errorText);
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();
        console.log('成功获取模型详情');
        res.json(data);
    } catch (error) {
        console.error('服务器错误:', error);
        res.status(500).json({ error: error.message });
    }
});

// 生成内容（真实转发）
app.post('/v1beta/models/:model:generateContent', async (req, res) => {
    const model = req.params.model;
    console.log(`收到生成请求，模型: ${model}`);

    try {
        const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req.body),
            agent: proxyAgent
        });

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