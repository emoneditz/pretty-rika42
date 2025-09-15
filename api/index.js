const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

app.use(cors());
app.use(express.json());

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;
const SECRET_KEY = "aaa"; 

if (!TOKEN || !CHAT_ID) {
    console.error("CRITICAL: TELEGRAM_TOKEN or TELEGRAM_CHAT_ID environment variables are not set.");
}

app.post('/api/verify', (req, res) => {
    const { secret } = req.body;
    if (secret === SECRET_KEY) {
        res.status(200).json({ authenticated: true });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

app.get('/api/getUpdates', async (req, res) => {
    const { offset } = req.query;
    const url = `${API_BASE}/getUpdates?offset=${offset}&allowed_updates=["message","message_reaction"]`;
    try {
        const response = await axios.get(url);
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json({ ok: false, description: 'Failed to fetch updates' });
    }
});

app.get('/api/media', async (req, res) => {
    const { file_id } = req.query;
    if (!file_id) {
        return res.status(400).send('Missing file_id');
    }

    try {
        const fileInfoResponse = await axios.get(`${API_BASE}/getFile?file_id=${file_id}`);
        const filePath = fileInfoResponse.data.result.file_path;

        if (!filePath) {
             throw new Error('File path not found');
        }

        const fileUrl = `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;

        const mediaResponse = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
        });
        
        const extension = filePath.split('.').pop().toLowerCase();
        if (['jpg', 'jpeg', 'png', 'gif'].includes(extension)) {
            res.setHeader('Content-Type', `image/${extension}`);
        } else if (['mp4', 'mov', 'webm'].includes(extension)) {
             res.setHeader('Content-Type', `video/${extension}`);
        }
        
        mediaResponse.data.pipe(res);

    } catch (error) {
        console.error('Error proxying media:', error.message);
        res.status(500).send('Error fetching media');
    }
});

const forwardPostToTelegram = async (endpoint, body, res) => {
     try {
        const response = await axios.post(`${API_BASE}/${endpoint}`, body);
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json(error.response ? error.response.data : { ok: false });
    }
};

app.post('/api/sendMessage', (req, res) => {
    forwardPostToTelegram('sendMessage', { chat_id: CHAT_ID, ...req.body }, res);
});

app.post('/api/deleteNotification', (req, res) => {
    forwardPostToTelegram('sendMessage', { chat_id: CHAT_ID, text: req.body.notificationText }, res);
});

app.post('/api/setReaction', (req, res) => {
    forwardPostToTelegram('setMessageReaction', { chat_id: CHAT_ID, ...req.body }, res);
});

app.post('/api/sendFile', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, description: 'No file uploaded.' });
    }
    const { caption, reply_parameters } = req.body;
    const { buffer, originalname, mimetype } = req.file;

    let endpoint = 'sendDocument';
    let fileField = 'document';
    if (mimetype.startsWith('image/')) { endpoint = 'sendPhoto'; fileField = 'photo'; }
    else if (mimetype.startsWith('video/')) { endpoint = 'sendVideo'; fileField = 'video'; }

    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append(fileField, buffer, originalname);
    if (caption) formData.append('caption', caption);
    if (reply_parameters) formData.append('reply_parameters', reply_parameters);
    
    try {
        const response = await axios.post(`${API_BASE}/${endpoint}`, formData, { headers: formData.getHeaders() });
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json(error.response ? error.response.data : { ok: false });
    }
});

module.exports = app;
