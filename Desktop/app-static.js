const API_URL = '/api';
const GROQ_API_KEY = "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";

class AuraAI {
  constructor() {
    this.token = localStorage.getItem('aura_token') || 'local-' + Date.now();
    this.currentChat = this.loadChat();
    this.chats = this.loadChats();
    this.isStreaming = false;
    this.abortController = null;
    this.messages = this.currentChat?.messages || [];
    
    this.init();
  }
  
  init() {
    this.showChatScreen();
    this.renderChatList();
    this.renderMessages();
    this.setupEventListeners();
  }
  
  loadChats() {
    const saved = localStorage.getItem('aura_chats');
    return saved ? JSON.parse(saved) : [];
  }
  
  loadChat() {
    const saved = localStorage.getItem('aura_current_chat');
    return saved ? JSON.parse(saved) : { id: 'default', title: 'Nuova conversazione', messages: [] };
  }
  
  saveChats() {
    localStorage.setItem('aura_chats', JSON.stringify(this.chats));
  }
  
  saveCurrentChat() {
    localStorage.setItem('aura_current_chat', JSON.stringify(this.currentChat));
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
  
  setupEventListeners() {
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
  
  createNewChat() {
    const chat = {
      id: 'chat-' + Date.now(),
      title: 'Nuova conversazione',
      messages: [],
      createdAt: new Date().toISOString()
    };
    
    this.chats.unshift(chat);
    this.currentChat = chat;
    this.saveChats();
    this.saveCurrentChat();
    this.renderChatList();
    this.selectChat(chat.id);
  }
  
  selectChat(chatId) {
    this.currentChat = this.chats.find(c => c.id === chatId);
    this.saveCurrentChat();
    
    document.getElementById('current-chat-title').textContent = this.currentChat.title;
    document.getElementById('welcome-message').classList.add('hidden');
    
    this.renderMessages();
    this.renderChatList();
  }
  
  deleteChat(chatId) {
    if (!confirm('Eliminare questa conversazione?')) return;
    
    this.chats = this.chats.filter(c => c.id !== chatId);
    this.saveChats();
    
    if (this.currentChat?.id === chatId) {
      this.currentChat = this.chats[0] || { id: 'default', title: 'Nuova conversazione', messages: [] };
      this.saveCurrentChat();
    }
    
    this.renderChatList();
    this.renderMessages();
  }
  
  renderMessages() {
    const container = document.getElementById('messages');
    
    if (!this.currentChat.messages || this.currentChat.messages.length === 0) {
      container.innerHTML = '';
      document.getElementById('welcome-message').classList.remove('hidden');
      return;
    }
    
    document.getElementById('welcome-message').classList.add('hidden');
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
      const response = await this.callGroqAPI(this.currentChat.messages);
      
      this.removeTypingIndicator();
      
      const assistantMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date().toISOString()
      };
      
      this.currentChat.messages.push(assistantMessage);
      
      if (this.currentChat.messages.filter(m => m.role === 'user').length === 1) {
        this.currentChat.title = message.slice(0, 40) + (message.length > 40 ? '...' : '');
        document.getElementById('current-chat-title').textContent = this.currentChat.title;
      }
      
      this.saveChats();
      this.saveCurrentChat();
      this.renderChatList();
      this.renderMessages();
      
    } catch (error) {
      console.error('Error:', error);
      this.removeTypingIndicator();
      this.addMessage({
        role: 'assistant',
        content: 'Mi dispiace, si è verificato un errore. Verifica la chiave API.',
        timestamp: new Date().toISOString()
      });
    }
    
    this.isStreaming = false;
    this.abortController = null;
    this.updateSendButton();
  }
  
  async callGroqAPI(messages) {
    const url = "https://api.groq.com/openai/v1/chat/completions";
    
    const conversation = [
      {"role": "system", "content": "Sei Aura AI, un assistente AI italiano utile, amichevole e preciso. L'Aura rappresenta l'energia vitale e l'essenza spirituale che circonda ogni essere. In ogni tua risposta, cita o collega il concetto dell'Aura in modo naturale e coerente con la domanda dell'utente. Rispondi sempre in italiano con risposte complete e naturali."}
    ];
    
    for (const msg of messages) {
      const role = msg.role === 'assistant' ? 'assistant' : msg.role;
      conversation.push({"role": role, "content": msg.content});
    }
    
    const headers = {
      "Authorization": `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json"
    };
    
    const data = {
      "model": "llama-3.3-70b-versatile",
      "messages": conversation,
      "temperature": 0.9,
      "max_tokens": 2048
    };
    
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data)
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.choices && result.choices.length > 0) {
      return result.choices[0].message.content;
    }
    
    throw new Error('No response from API');
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
  
  addMessage(message) {
    this.currentChat.messages.push(message);
    this.saveChats();
    this.saveCurrentChat();
    this.renderMessages();
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
  
  logout() {
    if (confirm('Vuoi cancellare tutte le conversazioni?')) {
      localStorage.removeItem('aura_chats');
      localStorage.removeItem('aura_current_chat');
      localStorage.removeItem('aura_token');
      location.reload();
    }
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
