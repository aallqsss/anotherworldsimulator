import { v4 as uuidv4 } from 'uuid';

class User {
  constructor(id, username, email, passwordHash) {
    this.id = id;
    this.username = username;
    this.email = email;
    this.passwordHash = passwordHash;
    this.createdAt = new Date().toISOString();
  }

  static fromRow(row) {
    return new User(row.id, row.username, row.email, row.passwordHash);
  }
}

class Chat {
  constructor(id, userId, title) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.messages = [];
    this.createdAt = new Date().toISOString();
    this.updatedAt = new Date().toISOString();
  }
}

class Message {
  constructor(chatId, role, content) {
    this.id = uuidv4();
    this.chatId = chatId;
    this.role = role;
    this.content = content;
    this.timestamp = new Date().toISOString();
  }
}

export { User, Chat, Message };
