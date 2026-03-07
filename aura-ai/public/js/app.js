const API_URL = '/api';

class AuraAI {
  constructor() {
    this.token = localStorage.getItem('aura_token');
    this.currentChat = null;
    this.chats = [];
    this.isStreaming = false;
    this.abortController = null;
    
    this.init();
  }
  
  init() {
    if (this.token) {
      this.showChatScreen();
      this.loadChats();
    } else {
      this.showAuthScreen();
    }
    
    this.setupEventListeners();
  }
  
  setupEventListeners() {
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchAuthTab(tab.dataset.tab));
    });
    
    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.login();
    });
    
    document.getElementById('register-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.register();
    });
    
    document.getElementById('new-chat-btn').addEventListener('click', () => this.createNewChat());
    
    document.getElementById('message-input').addEventListener('input', (e) => {
      this.autoResize(e.target);
      this.updateSendButton();
    });
    
    document.getElementById('message-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.sendMessage();
      }
    });
    
    document.getElementById('send-btn').addEventListener('click', () => this.sendMessage());
    
    document.getElementById('stop-btn').addEventListener('click', () => this.stopStreaming());
    
    document.getElementById('logout-btn').addEventListener('click', () => this.logout());
    
    document.getElementById('settings-btn').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.remove('hidden');
    });
    
    document.getElementById('close-settings').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('hidden');
    });
    
    document.querySelector('.modal-backdrop').addEventListener('click', () => {
      document.getElementById('settings-modal').classList.add('hidden');
    });
    
    document.getElementById('save-settings').addEventListener('click', () => this.saveSettings());
  }
  
  switchAuthTab(tab) {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
    
    if (tab === 'login') {
      document.getElementById('login-form').classList.remove('hidden');
      document.getElementById('register-form').classList.add('hidden');
    } else {
      document.getElementById('login-form').classList.add('hidden');
      document.getElementById('register-form').classList.remove('hidden');
    }
    
    this.hideError();
  }
  
  showAuthScreen() {
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('chat-screen').classList.add('hidden');
  }
  
  showChatScreen() {
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('chat-screen').classList.remove('hidden');
  }
  
  showError(message) {
    const errorEl = document.getElementById('auth-error');
    errorEl.textContent = message;
    errorEl.classList.remove('hidden');
  }
  
  hideError() {
    document.getElementById('auth-error').classList.add('hidden');
  }
  
  async login() {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Errore nel login');
      }
      
      this.token = data.token;
      localStorage.setItem('aura_token', data.token);
      this.showChatScreen();
      this.loadChats();
    } catch (error) {
      this.showError(error.message);
    }
  }
  
  async register() {
    const username = document.getElementById('register-username').value;
    const email = document.getElementById('register-email').value;
    const password = document.getElementById('register-password').value;
    
    try {
      const res = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Errore nella registrazione');
      }
      
      this.token = data.token;
      localStorage.setItem('aura_token', data.token);
      this.showChatScreen();
      this.loadChats();
    } catch (error) {
      this.showError(error.message);
    }
  }
  
  logout() {
    this.token = null;
    localStorage.removeItem('aura_token');
    this.currentChat = null;
    this.chats = [];
    this.showAuthScreen();
  }
  
  async loadChats() {
    try {
      const res = await fetch(`${API_URL}/chat/chats`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      this.chats = await res.json();
      this.renderChatList();
      
      if (this.chats.length > 0) {
        this.selectChat(this.chats[0].id);
      }
    } catch (error) {
      console.error('Error loading chats:', error);
    }
  }
  
  renderChatList() {
    const list = document.getElementById('chat-list');
    
    if (this.chats.length === 0) {
      list.innerHTML = `
        <p style="text-align: center; color: var(--text-muted); padding: 20px;">
          Nessuna conversazione
        </p>
      `;
      return;
    }
    
    list.innerHTML = this.chats.map(chat => `
      <button class="chat-item ${this.currentChat?.id === chat.id ? 'active' : ''}" data-id="${chat.id}">
        <svg class="chat-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span class="chat-item-title">${this.escapeHtml(chat.title)}</span>
        <button class="chat-item-delete" data-id="${chat.id}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
          </svg>
        </button>
      </button>
    `).join('');
    
    list.querySelectorAll('.chat-item:not(.chat-item-delete)').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.chat-item-delete')) {
          this.selectChat(item.dataset.id);
        }
      });
    });
    
    list.querySelectorAll('.chat-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteChat(btn.dataset.id);
      });
    });
  }
  
  async createNewChat() {
    try {
      const res = await fetch(`${API_URL}/chat/chats`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const chat = await res.json();
      this.chats.unshift(chat);
      this.renderChatList();
      this.selectChat(chat.id);
    } catch (error) {
      console.error('Error creating chat:', error);
    }
  }
  
  async selectChat(chatId) {
    try {
      const res = await fetch(`${API_URL}/chat/chats/${chatId}`, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      this.currentChat = await res.json();
      
      document.getElementById('current-chat-title').textContent = this.currentChat.title;
      document.getElementById('welcome-message').classList.add('hidden');
      
      this.renderMessages();
      this.renderChatList();
    } catch (error) {
      console.error('Error loading chat:', error);
    }
  }
  
  async deleteChat(chatId) {
    if (!confirm('Eliminare questa conversazione?')) return;
    
    try {
      await fetch(`${API_URL}/chat/chats/${chatId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      this.chats = this.chats.filter(c => c.id !== chatId);
      
      if (this.currentChat?.id === chatId) {
        this.currentChat = null;
        document.getElementById('messages').innerHTML = '';
        document.getElementById('welcome-message').classList.remove('hidden');
        document.getElementById('current-chat-title').textContent = 'Nuova conversazione';
      }
      
      this.renderChatList();
    } catch (error) {
      console.error('Error deleting chat:', error);
    }
  }
  
  renderMessages() {
    const container = document.getElementById('messages');
    
    if (!this.currentChat.messages || this.currentChat.messages.length === 0) {
      container.innerHTML = '';
      return;
    }
    
    container.innerHTML = this.currentChat.messages.map(msg => this.createMessageHTML(msg)).join('');
    this.scrollToBottom();
  }
  
  createMessageHTML(message) {
    const isUser = message.role === 'user';
    
    return `
      <div class="message ${message.role}">
        <div class="message-avatar">
          ${isUser ? 
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' :
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/><path d="M12 6v6l4 2"/></svg>'
          }
        </div>
        <div class="message-content">
          ${this.formatMessage(message.content)}
        </div>
      </div>
    `;
  }
  
  formatMessage(content) {
    return content
      .replace(/\n/g, '<br>')
      .replace(/`([^`]+)`/g, '<code style="background: var(--bg-tertiary); padding: 2px 6px; border-radius: 4px; font-family: monospace;">$1</code>');
  }
  
  autoResize(textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  }
  
  updateSendButton() {
    const input = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    
    sendBtn.disabled = !input.value.trim() || this.isStreaming;
    
    if (this.isStreaming) {
      sendBtn.classList.add('hidden');
      stopBtn.classList.remove('hidden');
    } else {
      sendBtn.classList.remove('hidden');
      stopBtn.classList.add('hidden');
    }
  }
  
  stopStreaming() {
    if (this.abortController) {
      this.abortController.abort();
    }
    
    this.isStreaming = false;
    this.removeTypingIndicator();
    this.updateSendButton();
  }
  
  async sendMessage() {
    if (this.isStreaming) return;
    
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    if (!this.currentChat) {
      await this.createNewChat();
    }
    
    input.value = '';
    this.autoResize(input);
    this.updateSendButton();
    
    const userMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString()
    };
    
    this.currentChat.messages.push(userMessage);
    this.renderMessages();
    
    this.isStreaming = true;
    this.abortController = new AbortController();
    this.updateSendButton();
    
    this.addTypingIndicator();
    
    try {
      const res = await fetch(`${API_URL}/chat/chats/${this.currentChat.id}/stream`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ message }),
        signal: this.abortController.signal
      });
      
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      
      this.removeTypingIndicator();
      
      const assistantMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString()
      };
      
      this.currentChat.messages.push(assistantMessage);
      this.appendMessage(assistantMessage);
      
      while (true) {
        try {
          const { done, value } = await reader.read();
          if (done || this.abortController === null) break;
          
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              try {
                const parsed = JSON.parse(data);
                if (parsed.chunk) {
                  fullResponse += parsed.chunk;
                  this.updateLastMessage(fullResponse);
                } else if (parsed.done) {
                  this.currentChat.title = this.currentChat.messages
                    .filter(m => m.role === 'user')[0]?.content.slice(0, 50) || 'Nuova conversazione';
                  document.getElementById('current-chat-title').textContent = this.currentChat.title;
                  this.renderChatList();
                }
              } catch (e) {}
            }
          }
        } catch (e) {
          if (e.name === 'AbortError') {
            break;
          }
          throw e;
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      this.removeTypingIndicator();
      this.addMessage({
        role: 'assistant',
        content: 'Mi dispiace, si è verificato un errore. Riprova.',
        timestamp: new Date().toISOString()
      });
    }
    
    this.isStreaming = false;
    this.abortController = null;
    this.updateSendButton();
  }
  
  addTypingIndicator() {
    const container = document.getElementById('messages');
    const indicator = document.createElement('div');
    indicator.id = 'typing-indicator';
    indicator.className = 'message assistant';
    indicator.innerHTML = `
      <div class="message-avatar">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
          <path d="M12 6v6l4 2"/>
        </svg>
      </div>
      <div class="message-content">
        <div class="typing-indicator">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    `;
    container.appendChild(indicator);
    this.scrollToBottom();
  }
  
  removeTypingIndicator() {
    const indicator = document.getElementById('typing-indicator');
    if (indicator) indicator.remove();
  }
  
  appendMessage(message) {
    const container = document.getElementById('messages');
    const html = this.createMessageHTML(message);
    container.insertAdjacentHTML('beforeend', html);
    this.scrollToBottom();
  }
  
  updateLastMessage(content) {
    const messages = document.querySelectorAll('.message.assistant');
    const lastMessage = messages[messages.length - 1];
    
    if (lastMessage) {
      lastMessage.querySelector('.message-content').innerHTML = this.formatMessage(content);
      this.scrollToBottom();
    }
  }
  
  addMessage(message) {
    this.currentChat.messages.push(message);
    this.appendMessage(message);
  }
  
  scrollToBottom() {
    const container = document.getElementById('messages-container');
    container.scrollTop = container.scrollHeight;
  }
  
  saveSettings() {
    const openaiKey = document.getElementById('openai-key').value;
    const theme = document.getElementById('theme-select').value;
    
    if (openaiKey) {
      localStorage.setItem('aura_openai_key', openaiKey);
    }
    
    localStorage.setItem('aura_theme', theme);
    document.getElementById('settings-modal').classList.add('hidden');
  }
  
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new AuraAI();
});
