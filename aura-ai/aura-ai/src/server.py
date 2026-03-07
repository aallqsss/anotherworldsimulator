from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import uuid
import json
import os
from datetime import datetime
import hashlib
import requests

app = Flask(__name__, static_folder='../public')
CORS(app)

USERS_FILE = 'users.json'
CHATS_FILE = 'chats.json'

GROQ_API_KEY = "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"
DEEPSEEK_API_KEY = ""
OPENROUTER_API_KEY = ""

def load_json(filepath, default_type=dict):
    if os.path.exists(filepath):
        with open(filepath, 'r') as f:
            return json.load(f)
    return default_type()

def save_json(filepath, data):
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2)

users_db = load_json(USERS_FILE, list)
chats_db = load_json(CHATS_FILE, dict)

def hash_password(password):
    return hashlib.sha256(password.encode()).hexdigest()

def find_user_by_email(email):
    for user in users_db:
        if user['email'] == email:
            return user
    return None

def find_user_by_id(user_id):
    for user in users_db:
        if user['id'] == user_id:
            return user
    return None

def get_user_chats(user_id):
    user_chats = []
    for chat_id, chat in chats_db.items():
        if chat.get('userId') == user_id:
            user_chats.append({
                'id': chat_id,
                'title': chat.get('title', 'Nuova conversazione'),
                'createdAt': chat.get('createdAt'),
                'updatedAt': chat.get('updatedAt')
            })
    return sorted(user_chats, key=lambda x: x.get('updatedAt', ''), reverse=True)

@app.route('/api/health')
def health():
    return jsonify({'status': 'ok', 'message': 'Aura AI is running'})

@app.route('/api/auth/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({'error': 'Tutti i campi sono obbligatori'}), 400
    
    if find_user_by_email(email):
        return jsonify({'error': 'Email già registrata'}), 400
    
    user = {
        'id': str(uuid.uuid4()),
        'username': username,
        'email': email,
        'passwordHash': hash_password(password),
        'createdAt': datetime.now().isoformat()
    }
    
    users_db.append(user)
    save_json(USERS_FILE, users_db)
    
    token = f"aura_token_{user['id']}_{uuid.uuid4().hex[:16]}"
    
    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email']
        }
    })

@app.route('/api/auth/login', methods=['POST'])
def login():
    data = request.json
    email = data.get('email')
    password = data.get('password')
    
    if not email or not password:
        return jsonify({'error': 'Email e password richiesti'}), 400
    
    user = find_user_by_email(email)
    if not user or user['passwordHash'] != hash_password(password):
        return jsonify({'error': 'Credenziali non valide'}), 401
    
    token = f"aura_token_{user['id']}_{uuid.uuid4().hex[:16]}"
    
    return jsonify({
        'token': token,
        'user': {
            'id': user['id'],
            'username': user['username'],
            'email': user['email']
        }
    })

@app.route('/api/auth/me', methods=['GET'])
def get_me():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return jsonify({'error': 'Token richiesto'}), 401
    
    token = auth_header.split(' ')[1]
    
    try:
        parts = token.split('_')
        if len(parts) >= 3 and parts[0] == 'aura' and parts[1] == 'token':
            user_id = parts[2]
            user = find_user_by_id(user_id)
            if user:
                return jsonify({
                    'id': user['id'],
                    'username': user['username'],
                    'email': user['email']
                })
    except:
        pass
    
    return jsonify({'error': 'Token non valido'}), 401

def authenticate():
    auth_header = request.headers.get('Authorization')
    if not auth_header or not auth_header.startswith('Bearer '):
        return None
    
    token = auth_header.split(' ')[1]
    
    try:
        parts = token.split('_')
        if len(parts) >= 3 and parts[0] == 'aura' and parts[1] == 'token':
            user_id = parts[2]
            return find_user_by_id(user_id)
    except:
        pass
    
    return None

@app.route('/api/chat/chats', methods=['GET'])
def get_chats():
    user = authenticate()
    if not user:
        return jsonify({'error': 'Non autorizzato'}), 401
    
    chats = get_user_chats(user['id'])
    return jsonify(chats)

@app.route('/api/chat/chats', methods=['POST'])
def create_chat():
    user = authenticate()
    if not user:
        return jsonify({'error': 'Non autorizzato'}), 401
    
    chat_id = str(uuid.uuid4())
    chat = {
        'id': chat_id,
        'userId': user['id'],
        'title': 'Nuova conversazione',
        'messages': [],
        'createdAt': datetime.now().isoformat(),
        'updatedAt': datetime.now().isoformat()
    }
    
    chats_db[chat_id] = chat
    save_json(CHATS_FILE, chats_db)
    
    return jsonify(chat)

@app.route('/api/chat/chats/<chat_id>', methods=['GET'])
def get_chat(chat_id):
    user = authenticate()
    if not user:
        return jsonify({'error': 'Non autorizzato'}), 401
    
    chat = chats_db.get(chat_id)
    if not chat or chat.get('userId') != user['id']:
        return jsonify({'error': 'Chat non trovata'}), 404
    
    return jsonify(chat)

@app.route('/api/chat/chats/<chat_id>', methods=['DELETE'])
def delete_chat(chat_id):
    user = authenticate()
    if not user:
        return jsonify({'error': 'Non autorizzato'}), 401
    
    chat = chats_db.get(chat_id)
    if not chat or chat.get('userId') != user['id']:
        return jsonify({'error': 'Chat non trovata'}), 404
    
    del chats_db[chat_id]
    save_json(CHATS_FILE, chats_db)
    
    return jsonify({'success': True})

@app.route('/api/chat/chats/<chat_id>/message', methods=['POST'])
def send_message(chat_id):
    user = authenticate()
    if not user:
        return jsonify({'error': 'Non autorizzato'}), 401
    
    data = request.json
    message = data.get('message')
    
    if not message:
        return jsonify({'error': 'Messaggio richiesto'}), 400
    
    chat = chats_db.get(chat_id)
    if not chat or chat.get('userId') != user['id']:
        return jsonify({'error': 'Chat non trovata'}), 404
    
    user_message = {
        'id': str(uuid.uuid4()),
        'role': 'user',
        'content': message,
        'timestamp': datetime.now().isoformat()
    }
    
    chat['messages'].append(user_message)
    
    if len([m for m in chat['messages'] if m['role'] == 'user']) == 1:
        chat['title'] = message[:50] + ('...' if len(message) > 50 else '')
    
    response = generate_ai_response(chat['messages'])
    
    assistant_message = {
        'id': str(uuid.uuid4()),
        'role': 'assistant',
        'content': response,
        'timestamp': datetime.now().isoformat()
    }
    
    chat['messages'].append(assistant_message)
    chat['updatedAt'] = datetime.now().isoformat()
    
    chats_db[chat_id] = chat
    save_json(CHATS_FILE, chats_db)
    
    return jsonify({
        'userMessage': user_message,
        'assistantMessage': assistant_message
    })

@app.route('/api/chat/chats/<chat_id>/stream', methods=['POST'])
def stream_message(chat_id):
    user = authenticate()
    if not user:
        return jsonify({'error': 'Non autorizzato'}), 401
    
    data = request.json
    message = data.get('message')
    
    if not message:
        return jsonify({'error': 'Messaggio richiesto'}), 400
    
    chat = chats_db.get(chat_id)
    if not chat or chat.get('userId') != user['id']:
        return jsonify({'error': 'Chat non trovata'}), 404
    
    user_message = {
        'id': str(uuid.uuid4()),
        'role': 'user',
        'content': message,
        'timestamp': datetime.now().isoformat()
    }
    
    chat['messages'].append(user_message)
    
    if len([m for m in chat['messages'] if m['role'] == 'user']) == 1:
        chat['title'] = message[:50] + ('...' if len(message) > 50 else '')
    
    response = generate_ai_response(chat['messages'])
    
    def generate():
        for char in response:
            yield f"data: {json.dumps({'chunk': char})}\n\n"
            import time
            time.sleep(0.02)
        
        assistant_message = {
            'id': str(uuid.uuid4()),
            'role': 'assistant',
            'content': response,
            'timestamp': datetime.now().isoformat()
        }
        
        chat['messages'].append(assistant_message)
        chat['updatedAt'] = datetime.now().isoformat()
        chats_db[chat_id] = chat
        save_json(CHATS_FILE, chats_db)
        
        yield f"data: {json.dumps({'done': True, 'message': assistant_message})}\n\n"
    
    return app.response_class(generate(), mimetype='text/event-stream')

def generate_ai_response(messages):
    if GROQ_API_KEY:
        return generate_groq_response(messages)
    return generate_mock_response(messages)

def generate_groq_response(messages):
    url = "https://api.groq.com/openai/v1/chat/completions"
    
    conversation = [
        {"role": "system", "content": "Sei Aura AI, un assistente AI italiano utile, amichevole e preciso. L'Aura rappresenta l'energia vitale e l'essenza spirituale che circonda ogni essere. In ogni tua risposta, cita o collega il concetto dell'Aura in modo naturale e coerente con la domanda dell'utente. Rispondi sempre in italiano con risposte complete e naturali."}
    ]
    
    for msg in messages:
        role = "assistant" if msg["role"] == "assistant" else msg["role"]
        conversation.append({"role": role, "content": msg["content"]})
    
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "llama-3.3-70b-versatile",
        "messages": conversation,
        "temperature": 0.9,
        "max_tokens": 2048
    }
    
    try:
        response = requests.post(url, headers=headers, json=data, timeout=30)
        result = response.json()
        
        if "choices" in result and len(result["choices"]) > 0:
            return result["choices"][0]["message"]["content"]
        else:
            return generate_mock_response(messages)
    except Exception as e:
        print(f"Groq API error: {e}")
        return generate_mock_response(messages)

def generate_mock_response(messages):
    responses = [
        f"Ho ricevuto il tuo messaggio. Come posso aiutarti?",
        f"Interessante! Mi hai mandato un messaggio. Vuoi dirmi di più?",
        f"Grazie per la tua domanda! Sono qui per assisterti.",
        f"Capisco. Posso aiutarti con questo argomento.",
        f"Ottima domanda! Fammi pensare alla migliore risposta."
    ]
    import random
    return random.choice(responses)

@app.route('/')
def index():
    return send_from_directory('../public', 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('../public', path)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
