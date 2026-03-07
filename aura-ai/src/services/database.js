import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

const users = new Map();
const chats = new Map();
const activeConnections = new Map();

export const db = {
  users: {
    findByEmail: async (email) => {
      for (const user of users.values()) {
        if (user.email === email) return user;
      }
      return null;
    },
    findById: async (id) => {
      return users.get(id) || null;
    },
    create: async (username, email, password) => {
      const id = uuidv4();
      const passwordHash = await bcrypt.hash(password, 10);
      const user = { id, username, email, passwordHash, createdAt: new Date().toISOString() };
      users.set(id, user);
      return user;
    },
    verifyPassword: async (user, password) => {
      return bcrypt.compare(password, user.passwordHash);
    }
  },
  
  chats: {
    findByUserId: async (userId) => {
      const userChats = [];
      for (const chat of chats.values()) {
        if (chat.userId === userId) {
          userChats.push({
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt
          });
        }
      }
      return userChats.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    },
    
    findById: async (chatId) => {
      return chats.get(chatId) || null;
    },
    
    create: async (userId, title = 'Nuova conversazione') => {
      const id = uuidv4();
      const chat = {
        id,
        userId,
        title,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      chats.set(id, chat);
      return chat;
    },
    
    addMessage: async (chatId, role, content) => {
      const chat = chats.get(chatId);
      if (!chat) return null;
      
      const message = {
        id: uuidv4(),
        role,
        content,
        timestamp: new Date().toISOString()
      };
      chat.messages.push(message);
      chat.updatedAt = new Date().toISOString();
      
      if (role === 'user' && chat.messages.filter(m => m.role === 'user').length === 1) {
        chat.title = content.slice(0, 50) + (content.length > 50 ? '...' : '');
      }
      
      return message;
    },
    
    getMessages: async (chatId) => {
      const chat = chats.get(chatId);
      return chat ? chat.messages : [];
    },
    
    delete: async (chatId) => {
      return chats.delete(chatId);
    }
  },
  
  connections: {
    set: (userId, ws) => activeConnections.set(userId, ws),
    get: (userId) => activeConnections.get(userId),
    delete: (userId) => activeConnections.delete(userId)
  }
};
