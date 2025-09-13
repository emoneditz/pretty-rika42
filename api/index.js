const express = require('express');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');
const cors = require('cors');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Middleware
app.use(cors());
app.use(express.json());

const TOKEN = process.env.TELEGRAM_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const API_BASE = `https://api.telegram.org/bot${TOKEN}`;

if (!TOKEN || !CHAT_ID) {
    console.error("CRITICAL: TELEGRAM_TOKEN or TELEGRAM_CHAT_ID environment variables are not set.");
}

// Generic function to forward requests to Telegram
const forwardToTelegram = async (endpoint, data, headers = {}) => {
    try {
        const response = await axios.post(`${API_BASE}/${endpoint}`, data, { headers });
        return { success: true, data: response.data };
    } catch (error) {
        console.error(`Error forwarding to Telegram endpoint: ${endpoint}`, error.response ? error.response.data : error.message);
        return { success: false, error: error.response ? error.response.data : { description: error.message } };
    }
};

// Route to get updates
app.get('/api/getUpdates', async (req, res) => {
    const { offset, timeout = 25 } = req.query;
    const url = `getUpdates?offset=${offset}&timeout=${timeout}&allowed_updates=["message","message_reaction"]`;
     try {
        const response = await axios.get(`${API_BASE}/${url}`);
        res.status(200).json(response.data);
    } catch (error) {
        res.status(500).json({ ok: false, description: 'Failed to fetch updates' });
    }
});

// Route to send a text message
app.post('/api/sendMessage', async (req, res) => {
    const response = await forwardToTelegram('sendMessage', { chat_id: CHAT_ID, ...req.body });
    if (response.success) res.status(200).json(response.data);
    else res.status(500).json(response.error);
});

// Route to send a file
app.post('/api/sendFile', upload.single('file'), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ ok: false, description: 'No file uploaded.' });
    }

    const { caption, reply_parameters } = req.body;
    const { buffer, originalname, mimetype } = req.file;

    let endpoint = 'sendDocument';
    let fileField = 'document';
    if (mimetype.startsWith('image/')) {
        endpoint = 'sendPhoto';
        fileField = 'photo';
    } else if (mimetype.startsWith('video/')) {
        endpoint = 'sendVideo';
        fileField = 'video';
    }

    const formData = new FormData();
    formData.append('chat_id', CHAT_ID);
    formData.append(fileField, buffer, originalname);
    if (caption) formData.append('caption', caption);
    if (reply_parameters) formData.append('reply_parameters', reply_parameters);
    
    const response = await forwardToTelegram(endpoint, formData, formData.getHeaders());
    if (response.success) res.status(200).json(response.data);
    else res.status(500).json(response.error);
});

// Route for file info (getFile)
app.post('/api/getFile', async (req, res) => {
    const response = await forwardToTelegram('getFile', req.body);
    if (response.success) {
        response.data.result.file_path = `https://api.telegram.org/file/bot${TOKEN}/${response.data.result.file_path}`;
        res.status(200).json(response.data);
    } else {
        res.status(500).json(response.error);
    }
});

// Route for delete notification
app.post('/api/deleteNotification', async (req, res) => {
    const response = await forwardToTelegram('sendMessage', { chat_id: CHAT_ID, text: req.body.notificationText });
    if (response.success) res.status(200).json(response.data);
    else res.status(500).json(response.error);
});

// Route to set a reaction
app.post('/api/setReaction', async (req, res) => {
    const response = await forwardToTelegram('setMessageReaction', { chat_id: CHAT_ID, ...req.body });
    if (response.success) res.status(200).json(response.data);
    else res.status(500).json(response.error);
});

// Export the app
module.exports = app;
