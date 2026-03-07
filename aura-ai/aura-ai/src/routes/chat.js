import express from 'express';
import { db } from '../services/database.js';
import { authenticate } from '../middleware/auth.js';
import { generateResponse } from '../services/llm.js';

const router = express.Router();

router.use(authenticate);

router.get('/chats', async (req, res) => {
  try {
    const chats = await db.chats.findByUserId(req.user.id);
    res.json(chats);
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero delle chat' });
  }
});

router.post('/chats', async (req, res) => {
  try {
    const chat = await db.chats.create(req.user.id);
    res.json(chat);
  } catch (error) {
    res.status(500).json({ error: 'Errore nella creazione della chat' });
  }
});

router.get('/chats/:id', async (req, res) => {
  try {
    const chat = await db.chats.findById(req.params.id);
    
    if (!chat || chat.userId !== req.user.id) {
      return res.status(404).json({ error: 'Chat non trovata' });
    }
    
    const messages = await db.chats.getMessages(req.params.id);
    res.json({ ...chat, messages });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel recupero della chat' });
  }
});

router.delete('/chats/:id', async (req, res) => {
  try {
    const chat = await db.chats.findById(req.params.id);
    
    if (!chat || chat.userId !== req.user.id) {
      return res.status(404).json({ error: 'Chat non trovata' });
    }
    
    await db.chats.delete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Errore nell\'eliminazione della chat' });
  }
});

router.post('/chats/:id/message', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Messaggio richiesto' });
    }
    
    const chat = await db.chats.findById(req.params.id);
    
    if (!chat || chat.userId !== req.user.id) {
      return res.status(404).json({ error: 'Chat non trovata' });
    }
    
    const userMessage = await db.chats.addMessage(chat.id, 'user', message);
    
    const previousMessages = await db.chats.getMessages(chat.id);
    
    const aiResponse = await generateResponse(previousMessages);
    
    const assistantMessage = await db.chats.addMessage(chat.id, 'assistant', aiResponse);
    
    res.json({
      userMessage,
      assistantMessage
    });
  } catch (error) {
    console.error('Error in chat:', error);
    res.status(500).json({ error: 'Errore nella generazione della risposta' });
  }
});

router.post('/chats/:id/stream', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Messaggio richiesto' });
    }
    
    const chat = await db.chats.findById(req.params.id);
    
    if (!chat || chat.userId !== req.user.id) {
      return res.status(404).json({ error: 'Chat non trovata' });
    }
    
    const userMessage = await db.chats.addMessage(chat.id, 'user', message);
    
    const previousMessages = await db.chats.getMessages(chat.id);
    
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    await generateResponse(previousMessages, (chunk) => {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }, async () => {
      const messages = await db.chats.getMessages(chat.id);
      const lastMessage = messages[messages.length - 1];
      res.write(`data: ${JSON.stringify({ done: true, message: lastMessage })}\n\n`);
      res.end();
    });
    
  } catch (error) {
    console.error('Error in streaming:', error);
    res.status(500).json({ error: 'Errore nella generazione della risposta' });
  }
});

export default router;
