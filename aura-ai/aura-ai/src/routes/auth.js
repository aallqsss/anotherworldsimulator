import express from 'express';
import jwt from 'jsonwebtoken';
import { db } from '../services/database.js';

const router = express.Router();

router.post('/register', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Tutti i campi sono obbligatori' });
    }
    
    const existingUser = await db.users.findByEmail(email);
    if (existingUser) {
      return res.status(400).json({ error: 'Email già registrata' });
    }
    
    const user = await db.users.create(username, email, password);
    
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nella registrazione' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email e password richiesti' });
    }
    
    const user = await db.users.findByEmail(email);
    if (!user) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const validPassword = await db.users.verifyPassword(user, password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Credenziali non valide' });
    }
    
    const token = jwt.sign(
      { userId: user.id },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Errore nel login' });
  }
});

router.get('/me', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token richiesto' });
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await db.users.findById(decoded.userId);
    
    if (!user) {
      return res.status(401).json({ error: 'Utente non trovato' });
    }
    
    res.json({
      id: user.id,
      username: user.username,
      email: user.email
    });
  } catch (error) {
    res.status(401).json({ error: 'Token non valido' });
  }
});

export default router;
