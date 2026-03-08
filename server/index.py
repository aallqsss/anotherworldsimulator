#!/usr/bin/env python3
import sqlite3
import json
import uuid
import bcrypt
import jwt
from datetime import datetime, timedelta
from functools import wraps
from flask_cors import CORS
from flask import Flask, request, jsonify
import random

app = Flask(__name__)
CORS(app, origins=['*'])
app.config['SECRET_KEY'] = 'another_world_secret_key_2024'

DB_NAME = 'another_world.db'
JWT_SECRET = 'another_world_secret_key_2024'

active_duels = {}

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()
    
    c.execute('''CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        avatar TEXT DEFAULT 'default',
        ac_balance INTEGER DEFAULT 500,
        daily_streak INTEGER DEFAULT 0,
        last_login TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS cards (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        tcg TEXT NOT NULL,
        rarity TEXT NOT NULL,
        image_url TEXT,
        hp INTEGER DEFAULT 100,
        attack TEXT,
        attack_damage INTEGER DEFAULT 0,
        energy_cost TEXT,
        description TEXT,
        market_value INTEGER DEFAULT 10
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS player_cards (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        quantity INTEGER DEFAULT 1,
        FOREIGN KEY (player_id) REFERENCES players(id),
        FOREIGN KEY (card_id) REFERENCES cards(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS decks (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        name TEXT NOT NULL,
        tcg TEXT NOT NULL,
        card_list TEXT DEFAULT '[]',
        FOREIGN KEY (player_id) REFERENCES players(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS packs_opened (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        pack_type TEXT NOT NULL,
        cards_received TEXT NOT NULL,
        opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS pity_tracker (
        player_id TEXT NOT NULL,
        pack_type TEXT NOT NULL,
        count_since_last_rare INTEGER DEFAULT 0,
        PRIMARY KEY (player_id, pack_type)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS auctions (
        id TEXT PRIMARY KEY,
        seller_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        start_price INTEGER NOT NULL,
        current_bid INTEGER,
        bidder_id TEXT,
        ends_at TEXT NOT NULL,
        FOREIGN KEY (seller_id) REFERENCES players(id),
        FOREIGN KEY (card_id) REFERENCES cards(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        proposer_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        offered_cards TEXT DEFAULT '[]',
        requested_cards TEXT DEFAULT '[]',
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (proposer_id) REFERENCES players(id),
        FOREIGN KEY (receiver_id) REFERENCES players(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS friendships (
        player_id_a TEXT NOT NULL,
        player_id_b TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id_a, player_id_b)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS missions (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        ac_reward INTEGER NOT NULL,
        condition TEXT NOT NULL
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS player_missions (
        player_id TEXT NOT NULL,
        mission_id TEXT NOT NULL,
        completed_at TEXT,
        PRIMARY KEY (player_id, mission_id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS achievements (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        ac_reward INTEGER NOT NULL,
        icon TEXT
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS player_achievements (
        player_id TEXT NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at TEXT DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, achievement_id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        sent_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (player_id) REFERENCES players(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS fragments (
        player_id TEXT NOT NULL,
        card_id TEXT NOT NULL,
        quantity INTEGER DEFAULT 0,
        PRIMARY KEY (player_id, card_id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS player_stats (
        player_id TEXT PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        tournaments_won INTEGER DEFAULT 0,
        total_cards_earned INTEGER DEFAULT 0,
        total_ac_earned INTEGER DEFAULT 0,
        FOREIGN KEY (player_id) REFERENCES players(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        status TEXT DEFAULT 'open',
        max_players INTEGER DEFAULT 8,
        current_players INTEGER DEFAULT 0,
        prize_ac INTEGER DEFAULT 100,
        scheduled_at TEXT,
        started_at TEXT,
        ended_at TEXT,
        winner_id TEXT
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS tournament_players (
        tournament_id TEXT NOT NULL,
        player_id TEXT NOT NULL,
        placement INTEGER,
        PRIMARY KEY (tournament_id, player_id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS npc_deals (
        id TEXT PRIMARY KEY,
        player_id TEXT NOT NULL,
        offer_type TEXT NOT NULL,
        offered_cards TEXT NOT NULL,
        requested_cards TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        FOREIGN KEY (player_id) REFERENCES players(id)
    )''')
    
    c.execute('''CREATE TABLE IF NOT EXISTS welcome_packs (
        player_id TEXT PRIMARY KEY,
        claimed INTEGER DEFAULT 0,
        claimed_at TEXT
    )''')
    
    conn.commit()
    seed_data(c)
    conn.close()

def seed_data(c):
    c.execute('SELECT COUNT(*) FROM cards')
    if c.fetchone()[0] > 0:
        return
    
    card_templates = {
        'pokemon': [
            {'name': 'Pikachu', 'rarity': 'rare', 'hp': 60, 'attack': 'Thunderbolt', 'damage': 50, 'energy': '⚡⚡', 'desc': 'An electric Pokémon'},
            {'name': 'Charizard', 'rarity': 'legendary', 'hp': 150, 'attack': 'Flame Burst', 'damage': 120, 'energy': '🔥🔥🔥', 'desc': 'A fiery dragon'},
            {'name': 'Blastoise', 'rarity': 'ultra_rare', 'hp': 140, 'attack': 'Hydro Cannon', 'damage': 100, 'energy': '💧💧💧', 'desc': 'A turtle Pokémon'},
            {'name': 'Venusaur', 'rarity': 'ultra_rare', 'hp': 130, 'attack': 'Vine Whip', 'damage': 80, 'energy': '🌿🌿🌿', 'desc': 'A grass Pokémon'},
            {'name': 'Gengar', 'rarity': 'rare', 'hp': 80, 'attack': 'Shadow Ball', 'damage': 60, 'energy': '👻👻', 'desc': 'A ghostly Pokémon'},
            {'name': 'Alakazam', 'rarity': 'rare', 'hp': 80, 'attack': 'Psychic', 'damage': 70, 'energy': '🔮🔮', 'desc': 'A psychic Pokémon'},
            {'name': 'Dragonite', 'rarity': 'legendary', 'hp': 160, 'attack': 'Dragon Claw', 'damage': 130, 'energy': '🐉🐉🔥', 'desc': 'A dragon master'},
            {'name': 'Mewtwo', 'rarity': 'legendary', 'hp': 170, 'attack': 'Psycho Boost', 'damage': 140, 'energy': '🔮🔮🔮', 'desc': 'The strongest psychic'},
            {'name': 'Mew', 'rarity': 'legendary', 'hp': 130, 'attack': 'Transform', 'damage': 100, 'energy': '🔮', 'desc': 'A mythical Pokémon'},
            {'name': 'Snorlax', 'rarity': 'rare', 'hp': 160, 'attack': 'Rest', 'damage': 90, 'energy': '🍖🍖', 'desc': 'A sleepy giant'},
            {'name': 'Gyarados', 'rarity': 'ultra_rare', 'hp': 140, 'attack': 'Hydro Pump', 'damage': 100, 'energy': '💧💧🐉', 'desc': 'A sea dragon'},
            {'name': 'Tyranitar', 'rarity': 'ultra_rare', 'hp': 150, 'attack': 'Crunch', 'damage': 110, 'energy': '🌑🌑🪨', 'desc': 'A rock monster'},
            {'name': 'Eevee', 'rarity': 'common', 'hp': 50, 'attack': 'Tackle', 'damage': 30, 'energy': '⚡', 'desc': 'An evolution Pokémon'},
            {'name': 'Bulbasaur', 'rarity': 'common', 'hp': 40, 'attack': 'Vine Attack', 'damage': 20, 'energy': '🌿', 'desc': 'A starter Pokémon'},
            {'name': 'Charmander', 'rarity': 'common', 'hp': 40, 'attack': 'Scratch', 'damage': 20, 'energy': '🔥', 'desc': 'A fire lizard'},
            {'name': 'Squirtle', 'rarity': 'common', 'hp': 40, 'attack': 'Bubble', 'damage': 20, 'energy': '💧', 'desc': 'A water turtle'},
            {'name': 'Jigglypuff', 'rarity': 'uncommon', 'hp': 60, 'attack': 'Sing', 'damage': 40, 'energy': '🔮', 'desc': 'A singing Pokémon'},
            {'name': 'Meowth', 'rarity': 'common', 'hp': 45, 'attack': 'Scratch', 'damage': 25, 'energy': '⚡', 'desc': 'A cat Pokémon'},
            {'name': 'Psyduck', 'rarity': 'common', 'hp': 50, 'attack': 'Water Gun', 'damage': 20, 'energy': '💧', 'desc': 'A confused Pokémon'},
            {'name': 'Machamp', 'rarity': 'rare', 'hp': 120, 'attack': 'Submission', 'damage': 80, 'energy': '👊👊👊', 'desc': 'A fighting champion'}
        ],
        'magic': [
            {'name': 'Black Lotus', 'rarity': 'legendary', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'The most powerful artifact'},
            {'name': 'Time Walk', 'rarity': 'legendary', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Take an extra turn'},
            {'name': 'Ancestral Recall', 'rarity': 'legendary', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Draw three cards'},
            {'name': 'Mox Sapphire', 'rarity': 'ultra_rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Free blue mana'},
            {'name': 'Mox Ruby', 'rarity': 'ultra_rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Free red mana'},
            {'name': 'Counterspell', 'rarity': 'rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Cancel a spell'},
            {'name': 'Lightning Bolt', 'rarity': 'uncommon', 'hp': 0, 'attack': '', 'damage': 3, 'energy': '', 'desc': 'Deal 3 damage'},
            {'name': 'Brainstorm', 'rarity': 'rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Draw and arrange'},
            {'name': 'Dark Ritual', 'rarity': 'rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Gain black mana'},
            {'name': 'Sol Ring', 'rarity': 'uncommon', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Two mana artifact'},
            {'name': 'Giant Growth', 'rarity': 'uncommon', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Pump your creature'},
            {'name': 'Swords to Plowshares', 'rarity': 'rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Exile creature'},
            {'name': 'Wrath of God', 'rarity': 'ultra_rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Kill all creatures'},
            {'name': 'Tarmogoyf', 'rarity': 'ultra_rare', 'hp': 4, 'attack': '', 'damage': 5, 'energy': '', 'desc': 'The green fatty'},
            {'name': 'Snapcaster Mage', 'rarity': 'ultra_rare', 'hp': 2, 'attack': '', 'damage': 3, 'energy': '', 'desc': 'Flashback spells'},
            {'name': 'Thoughtseize', 'rarity': 'rare', 'hp': 0, 'attack': '', 'damage': 0, 'energy': '', 'desc': 'Hand disruption'},
            {'name': 'Birds of Paradise', 'rarity': 'uncommon', 'hp': 1, 'attack': '', 'damage': 1, 'energy': '', 'desc': 'Green mana bird'},
            {'name': 'Llanowar Elves', 'rarity': 'common', 'hp': 1, 'attack': '', 'damage': 1, 'energy': '', 'desc': 'Green mana elf'},
            {'name': 'Hill Giant', 'rarity': 'common', 'hp': 3, 'attack': '', 'damage': 3, 'energy': '', 'desc': 'A big red creature'},
            {'name': 'Grizzly Bears', 'rarity': 'common', 'hp': 2, 'attack': '', 'damage': 2, 'energy': '', 'desc': 'A green bear'}
        ],
        'onepiece': [
            {'name': 'Monkey D. Luffy', 'rarity': 'legendary', 'hp': 500, 'attack': 'Gum-Gum Pistol', 'damage': 100, 'energy': '🏴‍☠️', 'desc': 'The future Pirate King'},
            {'name': 'Roronoa Zoro', 'rarity': 'ultra_rare', 'hp': 400, 'attack': 'Oni Giri', 'damage': 80, 'energy': '⚔️', 'desc': 'The greatest swordsman'},
            {'name': 'Nami', 'rarity': 'rare', 'hp': 250, 'attack': 'Climate Tact', 'damage': 40, 'energy': '🗺️', 'desc': 'The navigator'},
            {'name': 'Usopp', 'rarity': 'uncommon', 'hp': 200, 'attack': 'Pop Green', 'damage': 30, 'energy': '🎯', 'desc': 'The sniper'},
            {'name': 'Sanji', 'rarity': 'ultra_rare', 'hp': 380, 'attack': 'Diable Jambe', 'damage': 85, 'energy': '🔥', 'desc': 'The cook'},
            {'name': 'Tony Tony Chopper', 'rarity': 'rare', 'hp': 280, 'attack': 'Horn Point', 'damage': 45, 'energy': '🦌', 'desc': 'The doctor'},
            {'name': 'Nico Robin', 'rarity': 'rare', 'hp': 300, 'attack': 'Hana Hana no Mi', 'damage': 50, 'energy': '🌸', 'desc': 'The archaeologist'},
            {'name': 'Franky', 'rarity': 'rare', 'hp': 320, 'attack': 'Franky Rocket Hammer', 'damage': 55, 'energy': '🔧', 'desc': 'The shipwright'},
            {'name': 'Brook', 'rarity': 'uncommon', 'hp': 220, 'attack': 'Soul Solid', 'damage': 35, 'energy': '🎵', 'desc': 'The musician'},
            {'name': 'Jimbei', 'rarity': 'rare', 'hp': 350, 'attack': 'Fishman Karate', 'damage': 60, 'energy': '💧', 'desc': 'The helmsman'},
            {'name': 'Portgas D. Ace', 'rarity': 'legendary', 'hp': 450, 'attack': 'Flame Fist', 'damage': 110, 'energy': '🔥', 'desc': 'Fire Fist Ace'},
            {'name': 'Shanks', 'rarity': 'legendary', 'hp': 480, 'attack': 'Haki Strike', 'damage': 120, 'energy': '🗡️', 'desc': 'The Red-Haired'},
            {'name': 'Whitebeard', 'rarity': 'legendary', 'hp': 550, 'attack': 'Quake Quake', 'damage': 130, 'energy': '🌊', 'desc': 'The Strongest Man'},
            {'name': 'Kaido', 'rarity': 'ultra_rare', 'hp': 420, 'attack': 'Thunder Bagua', 'damage': 95, 'energy': '⚡', 'desc': 'The Beast'},
            {'name': 'Big Mom', 'rarity': 'ultra_rare', 'hp': 400, 'attack': 'Soul Manipulation', 'damage': 90, 'energy': '👻', 'desc': 'The Mother'},
            {'name': 'Blackbeard', 'rarity': 'legendary', 'hp': 470, 'attack': 'Dark Dark Fruit', 'damage': 115, 'energy': '🌑', 'desc': 'The Dark King'},
            {'name': 'Crocodile', 'rarity': 'rare', 'hp': 330, 'attack': 'Sandslash', 'damage': 65, 'energy': '🏜️', 'desc': 'Mr.0'},
            {'name': 'Enel', 'rarity': 'rare', 'hp': 340, 'attack': '60,000,000 Volt', 'damage': 70, 'energy': '⚡', 'desc': 'The God'},
            {'name': 'Buggy', 'rarity': 'uncommon', 'hp': 180, 'attack': 'Balloon Bomb', 'damage': 25, 'energy': '🎈', 'desc': 'The Star Clown'},
            {'name': 'Kuro', 'rarity': 'common', 'hp': 150, 'attack': 'Cat Claw', 'damage': 20, 'energy': '🐱', 'desc': 'The Black Cat'}
        ],
        'dragonball': [
            {'name': 'Goku', 'rarity': 'legendary', 'hp': 500, 'attack': 'Kamehameha', 'damage': 120, 'energy': '⚡', 'desc': 'The Saiyan hero'},
            {'name': 'Vegeta', 'rarity': 'legendary', 'hp': 450, 'attack': 'Final Flash', 'damage': 110, 'energy': '💥', 'desc': 'The Prince'},
            {'name': 'Gohan', 'rarity': 'ultra_rare', 'hp': 400, 'attack': 'Masenko', 'damage': 90, 'energy': '🔮', 'desc': 'The Ultimate'},
            {'name': 'Piccolo', 'rarity': 'rare', 'hp': 350, 'attack': 'Special Beam Cannon', 'damage': 70, 'energy': '👹', 'desc': 'The Namekian'},
            {'name': 'Frieza', 'rarity': 'legendary', 'hp': 420, 'attack': 'Death Beam', 'damage': 115, 'energy': '❄️', 'desc': 'The Emperor'},
            {'name': 'Cell', 'rarity': 'ultra_rare', 'hp': 410, 'attack': 'Solar Kamehameha', 'damage': 95, 'energy': '🧬', 'desc': 'The Perfect'},
            {'name': 'Buu', 'rarity': 'ultra_rare', 'hp': 430, 'attack': 'Candy Beam', 'damage': 100, 'energy': '🍬', 'desc': 'The Majin'},
            {'name': 'Trunks', 'rarity': 'rare', 'hp': 360, 'attack': 'Sword Slash', 'damage': 75, 'energy': '🗡️', 'desc': 'The Future'},
            {'name': 'Krillin', 'rarity': 'uncommon', 'hp': 250, 'attack': 'Destructo Disc', 'damage': 40, 'energy': '💿', 'desc': 'The loyal friend'},
            {'name': 'Yamcha', 'rarity': 'uncommon', 'hp': 220, 'attack': 'Wolf Fang Fist', 'damage': 35, 'energy': '🐺', 'desc': 'The Wolf'},
            {'name': 'Tien', 'rarity': 'uncommon', 'hp': 240, 'attack': 'Triclops Attack', 'damage': 45, 'energy': '👁️', 'desc': 'The Triclops'},
            {'name': 'Android 18', 'rarity': 'rare', 'hp': 320, 'attack': 'Energy Blast', 'damage': 65, 'energy': '🤖', 'desc': 'The Android'},
            {'name': 'Bardock', 'rarity': 'rare', 'hp': 380, 'attack': 'Final Spirit Bomb', 'damage': 80, 'energy': '🔥', 'desc': 'The Father'},
            {'name': 'Broly', 'rarity': 'legendary', 'hp': 480, 'attack': 'Omega Blaster', 'damage': 125, 'energy': '💢', 'desc': 'The Legendary'},
            {'name': 'Jiren', 'rarity': 'ultra_rare', 'hp': 440, 'attack': 'Power Impact', 'damage': 100, 'energy': '💪', 'desc': 'The Strongest'},
            {'name': 'Beerus', 'rarity': 'legendary', 'hp': 460, 'attack': 'God of Destruction Beam', 'damage': 130, 'energy': '🟣', 'desc': 'The God of Destruction'},
            {'name': 'Whis', 'rarity': 'legendary', 'hp': 490, 'attack': 'Angel Palm', 'damage': 135, 'energy': '👼', 'desc': 'The Angel'},
            {'name': 'Goku Black', 'rarity': 'ultra_rare', 'hp': 390, 'attack': 'Divine Kamehameha', 'damage': 85, 'energy': '🌸', 'desc': 'The Rogue'},
            {'name': 'Zamasu', 'rarity': 'rare', 'hp': 370, 'attack': 'God Split Cut', 'damage': 75, 'energy': '⚔️', 'desc': 'The Immortal'},
            {'name': 'Raditz', 'rarity': 'common', 'hp': 180, 'attack': 'Double Sunday', 'damage': 25, 'energy': '👾', 'desc': 'The Low-Class'}
        ]
    }
    
    rarity_values = {'common': 5, 'uncommon': 15, 'rare': 50, 'ultra_rare': 150, 'legendary': 500}
    tcgs = ['pokemon', 'magic', 'onepiece', 'dragonball']
    
    for tcg_idx, tcg in enumerate(tcgs):
        for idx, card in enumerate(card_templates[tcg]):
            card_id = f'{tcg}_{idx + 1}'
            c.execute('''INSERT INTO cards (id, name, tcg, rarity, hp, attack, attack_damage, energy_cost, description, market_value)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                (card_id, card['name'], tcg, card['rarity'], card['hp'], card['attack'], card['damage'], card['energy'], card['desc'], rarity_values[card['rarity']]))
    
    npc_accounts = [
        ('npc_gestore', 'Il Gestore', 10000),
        ('npc_trader', 'Luca il Trader', 10000),
        ('npc_legenda', 'La Leggenda', 10000)
    ]
    for pid, name, bal in npc_accounts:
        pw_hash = bcrypt.hashpw('npc123'.encode(), bcrypt.gensalt()).decode()
        c.execute('INSERT INTO players (id, username, password_hash, ac_balance) VALUES (?, ?, ?, ?)', (pid, name, pw_hash, bal))
    
    missions = [
        ('daily_1', 'daily', 'Open 2 packs today', 40, '{"packs":2}'),
        ('daily_2', 'daily', 'Win 1 duel', 60, '{"wins":1}'),
        ('daily_3', 'daily', 'List a card on the market', 20, '{"list_card":1}'),
        ('daily_4', 'daily', 'Send a trade request', 15, '{"trade":1}'),
        ('daily_5', 'daily', 'Complete a tournament match', 50, '{"tournament_match":1}'),
        ('weekly_1', 'weekly', 'Win 3 tournaments', 300, '{"tournament_wins":3}'),
        ('weekly_2', 'weekly', 'Collect all common Pokémon', 200, '{"complete_pokemon_common":true}'),
        ('weekly_3', 'weekly', 'Earn 1000 AC from sales', 150, '{"earn_ac":1000}'),
        ('weekly_4', 'weekly', 'Trade 5 cards', 100, '{"trades":5}'),
        ('weekly_5', 'weekly', 'Win 10 duels', 250, '{"wins":10}')
    ]
    for m in missions:
        c.execute('INSERT INTO missions (id, type, description, ac_reward, condition) VALUES (?, ?, ?, ?, ?)', m)
    
    achievements = [
        ('first_pack', 'First Steps', 'Open your first pack', 10, '📦'),
        ('first_win', 'Victor', 'Win your first duel', 25, '🏆'),
        ('collector_10', 'Collector', 'Own 10 cards', 50, '🃏'),
        ('collector_50', 'Master Collector', 'Own 50 cards', 150, '💎'),
        ('collector_100', 'Legendary Collector', 'Own 100 cards', 500, '👑'),
        ('first_legendary', 'Lucky Star', 'Pull a legendary card', 100, '⭐'),
        ('champion', 'Champion', 'Reach Champion rank', 1000, '🏅'),
        ('trader', 'Trader', 'Complete 10 trades', 100, '💱'),
        ('tournament_winner', 'Tournament King', 'Win a tournament', 200, '👑'),
        ('streak_7', 'Week Warrior', '7 day login streak', 75, '🔥')
    ]
    for a in achievements:
        c.execute('INSERT INTO achievements (id, name, description, ac_reward, icon) VALUES (?, ?, ?, ?, ?)', a)

def auth_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get('Authorization', '')
        token = auth.split(' ')[1] if ' ' in auth else auth
        if not token:
            return jsonify({'error': 'Unauthorized'}), 401
        try:
            data = jwt.decode(token, JWT_SECRET, algorithms=['HS256'])
            request.player_id = data['id']
            request.username = data['username']
        except:
            return jsonify({'error': 'Invalid token'}), 401
        return f(*args, **kwargs)
    return decorated

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    if not username or not password:
        return jsonify({'error': 'Missing fields'}), 400
    
    conn = get_db()
    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    pid = str(uuid.uuid4())
    try:
        conn.execute('INSERT INTO players (id, username, password_hash, ac_balance) VALUES (?, ?, ?, ?)',
            (pid, username, pw_hash, 500))
        conn.commit()
        token = jwt.encode({'id': pid, 'username': username}, JWT_SECRET, algorithm='HS256')
        return jsonify({'token': token, 'player': {'id': pid, 'username': username, 'ac_balance': 500}})
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400
    finally:
        conn.close()

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    username = data.get('username')
    password = data.get('password')
    
    conn = get_db()
    player = conn.execute('SELECT * FROM players WHERE username = ?', (username,)).fetchone()
    conn.close()
    
    if not player or not bcrypt.checkpw(password.encode(), player['password_hash'].encode()):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    today = datetime.now().date().isoformat()
    streak_bonus = 0
    
    if player['last_login']:
        last_login = str(player['last_login'])[:10]
        yesterday = (datetime.now() - timedelta(days=1)).date().isoformat()
        if last_login == yesterday:
            new_streak = player['daily_streak'] + 1
            streak_bonus = min(new_streak * 5, 100)
            conn = get_db()
            conn.execute('UPDATE players SET daily_streak = ?, last_login = ?, ac_balance = ac_balance + ? WHERE id = ?',
                (new_streak, today, streak_bonus, player['id']))
            conn.commit()
            conn.close()
        elif last_login != today:
            conn = get_db()
            conn.execute('UPDATE players SET daily_streak = 1, last_login = ?, ac_balance = ac_balance + 5 WHERE id = ?',
                (today, player['id']))
            conn.commit()
            conn.close()
            streak_bonus = 5
    else:
        conn = get_db()
        conn.execute('UPDATE players SET daily_streak = 1, last_login = ? WHERE id = ?', (today, player['id']))
        conn.commit()
        conn.close()
        streak_bonus = 5
    
    conn = get_db()
    updated = conn.execute('SELECT * FROM players WHERE id = ?', (player['id'],)).fetchone()
    conn.close()
    
    token = jwt.encode({'id': updated['id'], 'username': updated['username']}, JWT_SECRET, algorithm='HS256')
    return jsonify({'token': token, 'player': {
        'id': updated['id'],
        'username': updated['username'],
        'ac_balance': updated['ac_balance'],
        'avatar': updated['avatar'],
        'daily_streak': updated['daily_streak']
    }})

@app.route('/api/me', methods=['GET'])
@auth_required
def get_me():
    conn = get_db()
    player = conn.execute('SELECT id, username, avatar, ac_balance, daily_streak, created_at FROM players WHERE id = ?', (request.player_id,)).fetchone()
    card_count = conn.execute('SELECT SUM(quantity) as count FROM player_cards WHERE player_id = ?', (request.player_id,)).fetchone()
    conn.close()
    return jsonify({**dict(player), 'cards_owned': card_count['count'] or 0})

@app.route('/api/profile', methods=['PUT'])
@auth_required
def update_profile():
    data = request.json
    conn = get_db()
    conn.execute('UPDATE players SET avatar = ? WHERE id = ?', (data.get('avatar', 'default'), request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/cards', methods=['GET'])
@auth_required
def get_cards():
    conn = get_db()
    cards = conn.execute('SELECT * FROM cards ORDER BY tcg, rarity DESC, name').fetchall()
    conn.close()
    return jsonify([dict(c) for c in cards])

@app.route('/api/collection', methods=['GET'])
@auth_required
def get_collection():
    conn = get_db()
    collection = conn.execute('''
        SELECT c.*, COALESCE(pc.quantity, 0) as owned, COALESCE(f.quantity, 0) as fragments
        FROM cards c
        LEFT JOIN player_cards pc ON c.id = pc.card_id AND pc.player_id = ?
        LEFT JOIN fragments f ON c.id = f.card_id AND f.player_id = ?
        ORDER BY c.tcg, c.rarity DESC, c.name
    ''', (request.player_id, request.player_id)).fetchall()
    conn.close()
    return jsonify([dict(c) for c in collection])

pack_rates = {
    'standard': {'common': 0.70, 'uncommon': 0.25, 'rare': 0.05},
    'premium': {'uncommon': 0.50, 'rare': 0.35, 'ultra_rare': 0.14, 'legendary': 0.01},
    'legendary': {'rare': 0.20, 'ultra_rare': 0.50, 'legendary': 0.30}
}
pack_costs = {'standard': 100, 'premium': 300, 'legendary': 1000}

@app.route('/api/packs/open', methods=['POST'])
@auth_required
def open_pack():
    data = request.json
    pack_type = data.get('packType')
    if pack_type not in pack_costs:
        return jsonify({'error': 'Invalid pack type'}), 400
    
    conn = get_db()
    player = conn.execute('SELECT ac_balance FROM players WHERE id = ?', (request.player_id,)).fetchone()
    if player['ac_balance'] < pack_costs[pack_type]:
        conn.close()
        return jsonify({'error': 'Insufficient AC'}), 400
    
    pity = conn.execute('SELECT * FROM pity_tracker WHERE player_id = ? AND pack_type = ?', (request.player_id, pack_type)).fetchone()
    pity_count = pity['count_since_last_rare'] if pity else 0
    
    rates = pack_rates[pack_type].copy()
    cards = []
    rarities = list(rates.keys())
    
    for i in range(5):
        if pity_count >= 10:
            rarity = 'legendary' if pack_type == 'legendary' else ('ultra_rare' if pack_type == 'premium' else 'rare')
        else:
            roll = random.random()
            cumulative = 0
            for r in rarities:
                cumulative += rates[r]
                if roll < cumulative:
                    rarity = r
                    break
        
        tcg = ['pokemon', 'magic', 'onepiece', 'dragonball'][random.randint(0, 3)]
        available = conn.execute('SELECT * FROM cards WHERE tcg = ? AND rarity = ? ORDER BY RANDOM()', (tcg, rarity)).fetchall()
        
        if available:
            card = dict(available[0])
            cards.append(card)
            
            existing = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card['id'])).fetchone()
            if existing:
                conn.execute('UPDATE player_cards SET quantity = quantity + 1 WHERE id = ?', (existing['id'],))
            else:
                conn.execute('INSERT INTO player_cards (id, player_id, card_id, quantity) VALUES (?, ?, ?, 1)',
                    (str(uuid.uuid4()), request.player_id, card['id']))
    
    got_rare = any(c['rarity'] in ['rare', 'ultra_rare', 'legendary'] for c in cards)
    new_pity_count = 0 if got_rare else pity_count + 1
    
    conn.execute('INSERT OR REPLACE INTO pity_tracker (player_id, pack_type, count_since_last_rare) VALUES (?, ?, ?)',
        (request.player_id, pack_type, new_pity_count))
    conn.execute('UPDATE players SET ac_balance = ac_balance - ? WHERE id = ?', (pack_costs[pack_type], request.player_id))
    conn.execute('INSERT INTO packs_opened (id, player_id, pack_type, cards_received) VALUES (?, ?, ?, ?)',
        (str(uuid.uuid4()), request.player_id, pack_type, json.dumps([{'id': c['id'], 'name': c['name'], 'rarity': c['rarity'], 'tcg': c['tcg']} for c in cards])))
    conn.commit()
    
    updated = conn.execute('SELECT ac_balance FROM players WHERE id = ?', (request.player_id,)).fetchone()
    conn.close()
    
    return jsonify({'cards': cards, 'ac_balance': updated['ac_balance']})

@app.route('/api/decks', methods=['GET'])
@auth_required
def get_decks():
    conn = get_db()
    decks = conn.execute('SELECT * FROM decks WHERE player_id = ?', (request.player_id,)).fetchall()
    conn.close()
    return jsonify([{**dict(d), 'card_list': json.loads(d['card_list'])} for d in decks])

@app.route('/api/decks', methods=['POST'])
@auth_required
def create_deck():
    data = request.json
    conn = get_db()
    count = conn.execute('SELECT COUNT(*) as count FROM decks WHERE player_id = ?', (request.player_id,)).fetchone()
    
    if count['count'] >= 3:
        conn.close()
        return jsonify({'error': 'Max 3 decks. Buy more for 1500 AC'}), 400
    
    did = str(uuid.uuid4())
    conn.execute('INSERT INTO decks (id, player_id, name, tcg, card_list) VALUES (?, ?, ?, ?, ?)',
        (did, request.player_id, data.get('name', 'New Deck'), data.get('tcg', 'pokemon'), json.dumps(data.get('cardList', []))))
    conn.commit()
    conn.close()
    return jsonify({'id': did, 'name': data.get('name'), 'tcg': data.get('tcg'), 'card_list': data.get('cardList', [])})

@app.route('/api/decks/<deck_id>', methods=['PUT'])
@auth_required
def update_deck(deck_id):
    data = request.json
    conn = get_db()
    conn.execute('UPDATE decks SET name = ?, card_list = ? WHERE id = ? AND player_id = ?',
        (data.get('name'), json.dumps(data.get('cardList', [])), deck_id, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/decks/<deck_id>', methods=['DELETE'])
@auth_required
def delete_deck(deck_id):
    conn = get_db()
    conn.execute('DELETE FROM decks WHERE id = ? AND player_id = ?', (deck_id, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/auctions', methods=['GET'])
@auth_required
def get_auctions():
    conn = get_db()
    auctions = conn.execute('''
        SELECT a.*, c.name, c.rarity, c.tcg, p.username as seller_name
        FROM auctions a
        JOIN cards c ON a.card_id = c.id
        JOIN players p ON a.seller_id = p.id
        WHERE a.ends_at > datetime('now')
        ORDER BY a.ends_at ASC
    ''').fetchall()
    conn.close()
    return jsonify([dict(a) for a in auctions])

@app.route('/api/auctions', methods=['POST'])
@auth_required
def create_auction():
    data = request.json
    ends_at = (datetime.now() + timedelta(hours=data.get('duration', 1))).isoformat()
    conn = get_db()
    conn.execute('INSERT INTO auctions (id, seller_id, card_id, start_price, current_bid, ends_at) VALUES (?, ?, ?, ?, ?, ?)',
        (str(uuid.uuid4()), request.player_id, data.get('cardId'), data.get('startPrice'), data.get('startPrice'), ends_at))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/auctions/<auction_id>/bid', methods=['POST'])
@auth_required
def bid_auction(auction_id):
    data = request.json
    conn = get_db()
    auction = conn.execute('SELECT * FROM auctions WHERE id = ?', (auction_id,)).fetchone()
    
    if not auction or auction['ends_at'] < datetime.now().isoformat():
        conn.close()
        return jsonify({'error': 'Auction not found or ended'}), 400
    
    player = conn.execute('SELECT ac_balance FROM players WHERE id = ?', (request.player_id,)).fetchone()
    if player['ac_balance'] < data.get('bid') or data.get('bid') <= auction['current_bid']:
        conn.close()
        return jsonify({'error': 'Invalid bid'}), 400
    
    conn.execute('UPDATE auctions SET current_bid = ?, bidder_id = ? WHERE id = ?',
        (data.get('bid'), request.player_id, auction_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/trades', methods=['GET'])
@auth_required
def get_trades():
    conn = get_db()
    trades = conn.execute('''
        SELECT t.*, p1.username as proposer_name, p2.username as receiver_name
        FROM trades t
        JOIN players p1 ON t.proposer_id = p1.id
        JOIN players p2 ON t.receiver_id = p2.id
        WHERE t.proposer_id = ? OR t.receiver_id = ?
        ORDER BY t.created_at DESC
    ''', (request.player_id, request.player_id)).fetchall()
    conn.close()
    return jsonify([{**dict(t), 'offered_cards': json.loads(t['offered_cards']), 'requested_cards': json.loads(t['requested_cards'])} for t in trades])

@app.route('/api/trades', methods=['POST'])
@auth_required
def create_trade():
    data = request.json
    tid = str(uuid.uuid4())
    conn = get_db()
    conn.execute('INSERT INTO trades (id, proposer_id, receiver_id, offered_cards, requested_cards) VALUES (?, ?, ?, ?, ?)',
        (tid, request.player_id, data.get('receiverId'), json.dumps(data.get('offeredCards', [])), json.dumps(data.get('requestedCards', []))))
    conn.commit()
    conn.close()
    return jsonify({'id': tid})

@app.route('/api/trades/<trade_id>/accept', methods=['POST'])
@auth_required
def accept_trade(trade_id):
    conn = get_db()
    trade = conn.execute('SELECT * FROM trades WHERE id = ? AND receiver_id = ? AND status = "pending"', (trade_id, request.player_id)).fetchone()
    if not trade:
        conn.close()
        return jsonify({'error': 'Trade not found'}), 400
    
    offered = json.loads(trade['offered_cards'])
    requested = json.loads(trade['requested_cards'])
    
    for card_id in offered:
        pc = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (trade['proposer_id'], card_id)).fetchone()
        if pc and pc['quantity'] > 1:
            conn.execute('UPDATE player_cards SET quantity = quantity - 1 WHERE id = ?', (pc['id'],))
            existing = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card_id)).fetchone()
            if existing:
                conn.execute('UPDATE player_cards SET quantity = quantity + 1 WHERE id = ?', (existing['id'],))
            else:
                conn.execute('INSERT INTO player_cards (id, player_id, card_id, quantity) VALUES (?, ?, ?, 1)',
                    (str(uuid.uuid4()), request.player_id, card_id))
    
    for card_id in requested:
        pc = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card_id)).fetchone()
        if pc and pc['quantity'] > 1:
            conn.execute('UPDATE player_cards SET quantity = quantity - 1 WHERE id = ?', (pc['id'],))
            existing = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (trade['proposer_id'], card_id)).fetchone()
            if existing:
                conn.execute('UPDATE player_cards SET quantity = quantity + 1 WHERE id = ?', (existing['id'],))
            else:
                conn.execute('INSERT INTO player_cards (id, player_id, card_id, quantity) VALUES (?, ?, ?, 1)',
                    (str(uuid.uuid4()), trade['proposer_id'], card_id))
    
    conn.execute('UPDATE trades SET status = "accepted" WHERE id = ?', (trade_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/trades/<trade_id>/decline', methods=['POST'])
@auth_required
def decline_trade(trade_id):
    conn = get_db()
    conn.execute('UPDATE trades SET status = "declined" WHERE id = ? AND receiver_id = ?', (trade_id, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/missions', methods=['GET'])
@auth_required
def get_missions():
    conn = get_db()
    all_missions = conn.execute('SELECT * FROM missions').fetchall()
    completed = conn.execute('SELECT * FROM player_missions WHERE player_id = ?', (request.player_id,)).fetchall()
    conn.close()
    completed_ids = {c['mission_id'] for c in completed}
    today = datetime.now().date().isoformat()
    completed_today = {c['mission_id'] for c in completed if c['completed_at'] and str(c['completed_at'])[:10] == today}
    return jsonify([{**dict(m), 'condition': json.loads(m['condition']), 'completed': m['id'] in completed_ids, 'completed_today': m['id'] in completed_today} for m in all_missions])

@app.route('/api/missions/<mission_id>/claim', methods=['POST'])
@auth_required
def claim_mission(mission_id):
    conn = get_db()
    mission = conn.execute('SELECT * FROM missions WHERE id = ?', (mission_id,)).fetchone()
    if not mission:
        conn.close()
        return jsonify({'error': 'Mission not found'}), 400
    
    existing = conn.execute('SELECT * FROM player_missions WHERE player_id = ? AND mission_id = ?', (request.player_id, mission_id)).fetchone()
    if existing and existing['completed_at']:
        conn.close()
        return jsonify({'error': 'Already completed'}), 400
    
    conn.execute('INSERT OR REPLACE INTO player_missions (player_id, mission_id, completed_at) VALUES (?, ?, datetime("now"))', (request.player_id, mission_id))
    conn.execute('UPDATE players SET ac_balance = ac_balance + ? WHERE id = ?', (mission['ac_reward'], request.player_id))
    conn.commit()
    
    player = conn.execute('SELECT ac_balance FROM players WHERE id = ?', (request.player_id,)).fetchone()
    conn.close()
    return jsonify({'ac_balance': player['ac_balance']})

@app.route('/api/achievements', methods=['GET'])
@auth_required
def get_achievements():
    conn = get_db()
    all_achievements = conn.execute('SELECT * FROM achievements').fetchall()
    unlocked = conn.execute('SELECT * FROM player_achievements WHERE player_id = ?', (request.player_id,)).fetchall()
    conn.close()
    unlocked_ids = {u['achievement_id'] for u in unlocked}
    return jsonify([{**dict(a), 'unlocked': a['id'] in unlocked_ids} for a in all_achievements])

@app.route('/api/leaderboard', methods=['GET'])
@auth_required
def get_leaderboard():
    conn = get_db()
    players = conn.execute('SELECT id, username, ac_balance FROM players ORDER BY ac_balance DESC LIMIT 50').fetchall()
    conn.close()
    return jsonify([dict(p) for p in players])

@app.route('/api/chat', methods=['GET'])
@auth_required
def get_chat():
    conn = get_db()
    messages = conn.execute('SELECT * FROM chat_messages ORDER BY sent_at DESC LIMIT 100').fetchall()
    conn.close()
    return jsonify([dict(m) for m in reversed(messages)])

@app.route('/api/chat', methods=['POST'])
@auth_required
def send_chat():
    data = request.json
    msg_id = str(uuid.uuid4())
    conn = get_db()
    conn.execute('INSERT INTO chat_messages (id, player_id, username, message, sent_at) VALUES (?, ?, ?, ?, ?)',
        (msg_id, request.player_id, request.username, data.get('message', ''), datetime.now().isoformat()))
    conn.commit()
    conn.close()
    return jsonify({'id': msg_id})

@app.route('/api/players', methods=['GET'])
@auth_required
def get_players():
    search = request.args.get('search', '')
    conn = get_db()
    if search:
        players = conn.execute('SELECT id, username, avatar, ac_balance FROM players WHERE username LIKE ? LIMIT 20', (f'%{search}%',)).fetchall()
    else:
        players = conn.execute('SELECT id, username, avatar, ac_balance FROM players LIMIT 20').fetchall()
    conn.close()
    return jsonify([dict(p) for p in players])

@app.route('/api/friends', methods=['GET'])
@auth_required
def get_friends():
    conn = get_db()
    friends = conn.execute('''
        SELECT p.id, p.username, p.avatar, p.ac_balance, f.status
        FROM friendships f
        JOIN players p ON (f.player_id_a = p.id AND f.player_id_b = ?) OR (f.player_id_b = p.id AND f.player_id_a = ?)
        WHERE f.status = 'accepted'
    ''', (request.player_id, request.player_id)).fetchall()
    conn.close()
    return jsonify([dict(f) for f in friends])

@app.route('/api/friends/<target_id>', methods=['POST'])
@auth_required
def add_friend(target_id):
    if target_id == request.player_id:
        return jsonify({'error': 'Cannot friend yourself'}), 400
    conn = get_db()
    existing = conn.execute('''SELECT * FROM friendships WHERE (player_id_a = ? AND player_id_b = ?) OR (player_id_a = ? AND player_id_b = ?)''',
        (request.player_id, target_id, target_id, request.player_id)).fetchone()
    if not existing:
        conn.execute('INSERT INTO friendships (player_id_a, player_id_b, status) VALUES (?, ?, "pending")', (request.player_id, target_id))
        conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/friends/<target_id>/accept', methods=['POST'])
@auth_required
def accept_friend(target_id):
    conn = get_db()
    conn.execute('UPDATE friendships SET status = "accepted" WHERE player_id_a = ? AND player_id_b = ?', (target_id, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/stats', methods=['GET'])
@auth_required
def get_stats():
    conn = get_db()
    stats = conn.execute('SELECT * FROM player_stats WHERE player_id = ?', (request.player_id,)).fetchone()
    if not stats:
        conn.execute('INSERT INTO player_stats (player_id) VALUES (?)', (request.player_id,))
        conn.commit()
        stats = conn.execute('SELECT * FROM player_stats WHERE player_id = ?', (request.player_id,)).fetchone()
    conn.close()
    return jsonify(dict(stats))

@app.route('/api/welcome-pack', methods=['POST'])
@auth_required
def claim_welcome_pack():
    conn = get_db()
    claimed = conn.execute('SELECT * FROM welcome_packs WHERE player_id = ?', (request.player_id,)).fetchone()
    if claimed and claimed['claimed']:
        conn.close()
        return jsonify({'error': 'Already claimed'}), 400
    
    pack_type = 'premium'
    cards = []
    for i in range(5):
        rarity = 'rare' if i < 2 else ('ultra_rare' if i < 4 else 'legendary')
        tcg = ['pokemon', 'magic', 'onepiece', 'dragonball'][random.randint(0, 3)]
        available = conn.execute('SELECT * FROM cards WHERE tcg = ? AND rarity = ? ORDER BY RANDOM()', (tcg, rarity)).fetchall()
        if available:
            card = dict(available[0])
            cards.append(card)
            existing = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card['id'])).fetchone()
            if existing:
                conn.execute('UPDATE player_cards SET quantity = quantity + 1 WHERE id = ?', (existing['id'],))
            else:
                conn.execute('INSERT INTO player_cards (id, player_id, card_id, quantity) VALUES (?, ?, ?, 1)',
                    (str(uuid.uuid4()), request.player_id, card['id']))
    
    conn.execute('INSERT OR REPLACE INTO welcome_packs (player_id, claimed, claimed_at) VALUES (?, 1, datetime("now"))', (request.player_id,))
    conn.execute('UPDATE players SET ac_balance = ac_balance + 200 WHERE id = ?', (request.player_id,))
    conn.commit()
    conn.close()
    return jsonify({'cards': cards, 'bonus_ac': 200})

@app.route('/api/welcome-pack/status', methods=['GET'])
@auth_required
def get_welcome_pack_status():
    conn = get_db()
    claimed = conn.execute('SELECT * FROM welcome_packs WHERE player_id = ?', (request.player_id,)).fetchone()
    conn.close()
    return jsonify({'claimed': claimed['claimed'] if claimed else False})

@app.route('/api/sell-cards', methods=['POST'])
@auth_required
def sell_cards():
    data = request.json
    card_id = data.get('cardId')
    quantity = data.get('quantity', 1)
    
    conn = get_db()
    card = conn.execute('SELECT * FROM cards WHERE id = ?', (card_id,)).fetchone()
    if not card:
        conn.close()
        return jsonify({'error': 'Card not found'}), 400
    
    player_card = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card_id)).fetchone()
    if not player_card or player_card['quantity'] < quantity:
        conn.close()
        return jsonify({'error': 'Not enough cards'}), 400
    
    sell_price = card['market_value'] * quantity
    
    if player_card['quantity'] == quantity:
        conn.execute('DELETE FROM player_cards WHERE id = ?', (player_card['id'],))
    else:
        conn.execute('UPDATE player_cards SET quantity = quantity - ? WHERE id = ?', (quantity, player_card['id']))
    
    conn.execute('UPDATE players SET ac_balance = ac_balance + ? WHERE id = ?', (sell_price, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'earned': sell_price})

@app.route('/api/tournaments', methods=['GET'])
@auth_required
def get_tournaments():
    conn = get_db()
    tournaments = conn.execute('SELECT * FROM tournaments WHERE status != "finished" ORDER BY scheduled_at DESC').fetchall()
    my_tournaments = conn.execute('''
        SELECT t.* FROM tournaments t
        JOIN tournament_players tp ON t.id = tp.tournament_id
        WHERE tp.player_id = ?
    ''', (request.player_id,)).fetchall()
    conn.close()
    return jsonify({
        'available': [dict(t) for t in tournaments],
        'my_tournaments': [dict(t) for t in my_tournaments]
    })

@app.route('/api/tournaments', methods=['POST'])
@auth_required
def create_tournament():
    data = request.json
    t_type = data.get('type', 'casual')
    prize = 100 if t_type == 'casual' else (500 if t_type == 'championship' else 1000)
    
    tid = str(uuid.uuid4())
    scheduled = (datetime.now() + timedelta(hours=1)).isoformat()
    
    conn = get_db()
    conn.execute('''INSERT INTO tournaments (id, name, type, status, prize_ac, scheduled_at, max_players)
        VALUES (?, ?, ?, 'open', ?, ?, 8)''',
        (tid, f"{t_type.title()} Tournament", t_type, prize, scheduled))
    conn.execute('INSERT INTO tournament_players (tournament_id, player_id) VALUES (?, ?)', (tid, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'id': tid})

@app.route('/api/tournaments/<tid>/join', methods=['POST'])
@auth_required
def join_tournament(tid):
    conn = get_db()
    t = conn.execute('SELECT * FROM tournaments WHERE id = ?', (tid,)).fetchone()
    if not t:
        conn.close()
        return jsonify({'error': 'Tournament not found'}), 400
    
    if t['current_players'] >= t['max_players']:
        conn.close()
        return jsonify({'error': 'Tournament full'}), 400
    
    existing = conn.execute('SELECT * FROM tournament_players WHERE tournament_id = ? AND player_id = ?', (tid, request.player_id)).fetchone()
    if existing:
        conn.close()
        return jsonify({'error': 'Already joined'}), 400
    
    conn.execute('UPDATE tournaments SET current_players = current_players + 1 WHERE id = ?', (tid,))
    conn.execute('INSERT INTO tournament_players (tournament_id, player_id) VALUES (?, ?)', (tid, request.player_id))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/npc-deals', methods=['GET'])
@auth_required
def get_npc_deals():
    conn = get_db()
    deals = conn.execute('SELECT * FROM npc_deals WHERE player_id = ? AND expires_at > datetime("now")', (request.player_id,)).fetchall()
    
    if not deals:
        npc_names = ['Il Gestore', 'Luca il Trader', 'La Leggenda']
        for i in range(3):
            offered_rarity = random.choice(['common', 'uncommon', 'rare'])
            requested_rarity = random.choice(['common', 'uncommon'])
            
            offered_cards = conn.execute('SELECT id FROM cards WHERE rarity = ? ORDER BY RANDOM() LIMIT ?', (offered_rarity, random.randint(1, 2))).fetchall()
            requested_cards = conn.execute('SELECT id FROM cards WHERE rarity = ? ORDER BY RANDOM() LIMIT ?', (requested_rarity, random.randint(2, 3))).fetchall()
            
            if offered_cards and requested_cards:
                did = str(uuid.uuid4())
                expires = (datetime.now() + timedelta(hours=24)).isoformat()
                conn.execute('''INSERT INTO npc_deals (id, player_id, offer_type, offered_cards, requested_cards, expires_at)
                    VALUES (?, ?, 'trade', ?, ?, ?)''',
                    (did, request.player_id, 
                     json.dumps([c['id'] for c in offered_cards]),
                     json.dumps([c['id'] for c in requested_cards]),
                     expires))
        conn.commit()
        deals = conn.execute('SELECT * FROM npc_deals WHERE player_id = ? AND expires_at > datetime("now")', (request.player_id,)).fetchall()
    
    result = []
    for deal in deals:
        offered = conn.execute('SELECT * FROM cards WHERE id IN (' + ','.join(['?'] * len(json.loads(deal['offered_cards']))) + ')', tuple(json.loads(deal['offered_cards']))).fetchall()
        requested = conn.execute('SELECT * FROM cards WHERE id IN (' + ','.join(['?'] * len(json.loads(deal['requested_cards']))) + ')', tuple(json.loads(deal['requested_cards']))).fetchall()
        result.append({
            'id': deal['id'],
            'offer_type': deal['offer_type'],
            'offered': [dict(c) for c in offered],
            'requested': [dict(c) for c in requested],
            'expires_at': deal['expires_at']
        })
    
    conn.close()
    return jsonify(result)

@app.route('/api/npc-deals/<deal_id>/accept', methods=['POST'])
@auth_required
def accept_npc_deal(deal_id):
    conn = get_db()
    deal = conn.execute('SELECT * FROM npc_deals WHERE id = ? AND player_id = ?', (deal_id, request.player_id)).fetchone()
    if not deal:
        conn.close()
        return jsonify({'error': 'Deal not found'}), 400
    
    offered = json.loads(deal['offered_cards'])
    requested = json.loads(deal['requested_cards'])
    
    for card_id in offered:
        existing = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card_id)).fetchone()
        if existing:
            conn.execute('UPDATE player_cards SET quantity = quantity + 1 WHERE id = ?', (existing['id'],))
        else:
            conn.execute('INSERT INTO player_cards (id, player_id, card_id, quantity) VALUES (?, ?, ?, 1)',
                (str(uuid.uuid4()), request.player_id, card_id))
    
    for card_id in requested:
        pc = conn.execute('SELECT * FROM player_cards WHERE player_id = ? AND card_id = ?', (request.player_id, card_id)).fetchone()
        if pc and pc['quantity'] > 0:
            if pc['quantity'] == 1:
                conn.execute('DELETE FROM player_cards WHERE id = ?', (pc['id'],))
            else:
                conn.execute('UPDATE player_cards SET quantity = quantity - 1 WHERE id = ?', (pc['id'],))
    
    conn.execute('DELETE FROM npc_deals WHERE id = ?', (deal_id,))
    conn.commit()
    conn.close()
    return jsonify({'success': True})

@app.route('/api/duel/start', methods=['POST'])
@auth_required
def start_duel():
    data = request.json
    deck_id = data.get('deckId')
    
    conn = get_db()
    deck = conn.execute('SELECT * FROM decks WHERE id = ? AND player_id = ?', (deck_id, request.player_id)).fetchone()
    if not deck:
        conn.close()
        return jsonify({'error': 'Deck not found'}), 400
    
    card_list = json.loads(deck['card_list'])
    if len(card_list) < 20:
        conn.close()
        return jsonify({'error': 'Deck must have at least 20 cards'}), 400
    
    opponent_hp = 120
    player_hp = 120
    
    player_deck = card_list.copy()
    random.shuffle(player_deck)
    
    player_hand = player_deck[:7]
    
    conn.close()
    return jsonify({
        'player_hp': player_hp,
        'opponent_hp': opponent_hp,
        'player_hand': player_hand,
        'turn': 1,
        'phase': 'draw'
    })

@app.route('/api/duel/attack', methods=['POST'])
@auth_required
def duel_attack():
    data = request.json
    card_id = data.get('cardId')
    opponent_hp = data.get('opponentHp', 120)
    player_hp = data.get('playerHp', 120)
    
    conn = get_db()
    card = conn.execute('SELECT * FROM cards WHERE id = ?', (card_id,)).fetchone()
    if not card:
        conn.close()
        return jsonify({'error': 'Card not found'}), 400
    
    damage = card['attack_damage'] if card['attack_damage'] else 20
    new_opponent_hp = max(0, opponent_hp - damage)
    
    player_cards = conn.execute('SELECT id, name, attack_damage FROM cards WHERE tcg = ? ORDER BY attack_damage DESC LIMIT 10', (deck['tcg'],)).fetchall()
    opponent_card = random.choice(player_cards) if player_cards else None
    opponent_damage = opponent_card['attack_damage'] if opponent_card and opponent_card['attack_damage'] else 15
    new_player_hp = max(0, player_hp - opponent_damage)
    
    conn.close()
    
    return jsonify({
        'damage_dealt': damage,
        'opponent_hp': new_opponent_hp,
        'player_hp': new_player_hp,
        'opponent_attack': opponent_card['name'] if opponent_card else 'Attack',
        'opponent_damage': opponent_damage,
        'game_over': new_opponent_hp <= 0 or new_player_hp <= 0,
        'winner': 'player' if new_opponent_hp <= 0 else 'opponent'
    })

online_players = {}
duel_challenges = {}

@app.route('/api/players/online', methods=['GET'])
@auth_required
def get_online_players():
    conn = get_db()
    players = []
    now = datetime.now()
    for pid in list(online_players.keys()):
        if (now - online_players[pid]['last_seen']).seconds < 60:
            p = conn.execute('SELECT id, username FROM players WHERE id = ?', (pid,)).fetchone()
            if p and p['id'] != request.player_id:
                players.append({'id': p['id'], 'username': p['username'], 'status': 'online'})
    conn.close()
    for pid in list(online_players.keys()):
        if (now - online_players[pid]['last_seen']).seconds >= 60:
            del online_players[pid]
    return jsonify(players)

@app.route('/api/players/heartbeat', methods=['POST'])
@auth_required
def player_heartbeat():
    online_players[request.player_id] = {'last_seen': datetime.now(), 'username': request.username}
    return jsonify({'ok': True})

@app.route('/api/duel/challenge/<player_id>', methods=['POST'])
@auth_required
def challenge_player(player_id):
    conn = get_db()
    target = conn.execute('SELECT id, username FROM players WHERE id = ?', (player_id,)).fetchone()
    if not target:
        conn.close()
        return jsonify({'error': 'Player not found'}), 404
    
    if player_id not in online_players:
        conn.close()
        return jsonify({'error': 'Player is not online'}), 400
    
    if player_id == request.player_id:
        conn.close()
        return jsonify({'error': 'Cannot challenge yourself'}), 400
    
    conn.close()
    
    duel_id = str(uuid.uuid4())[:8]
    active_duels[duel_id] = {
        'player1': request.player_id,
        'player2': player_id,
        'player1_username': request.username,
        'player2_username': target['username'],
        'player1_hp': 100,
        'player2_hp': 100,
        'player1_cards': [],
        'player2_cards': [],
        'turn': 'player1',
        'status': 'pending'
    }
    
    duel_challenges[player_id] = {'duel_id': duel_id, 'from_id': request.player_id, 'from_name': request.username}
    
    return jsonify({'duel_id': duel_id, 'status': 'waiting'})

@app.route('/api/duel/challenges', methods=['GET'])
@auth_required
def get_challenges():
    challenge = duel_challenges.get(request.player_id)
    if challenge:
        return jsonify(challenge)
    return jsonify(None)

@app.route('/api/duel/accept/<duel_id>', methods=['POST'])
@auth_required
def accept_duel(duel_id):
    if duel_id not in active_duels:
        return jsonify({'error': 'Duel not found'}), 404
    
    duel = active_duels[duel_id]
    if duel['player2'] != request.player_id:
        return jsonify({'error': 'Not invited to this duel'}), 403
    
    conn = get_db()
    deck = conn.execute('SELECT * FROM decks WHERE player_id = ? ORDER BY RANDOM() LIMIT 1', (request.player_id,)).fetchone()
    if not deck or json.loads(deck['card_list']) < 5:
        conn.close()
        return jsonify({'error': 'Need a deck with at least 5 cards'}), 400
    
    cards = json.loads(deck['card_list'])
    card_objs = conn.execute('SELECT * FROM cards WHERE id IN (' + ','.join(['?']*len(cards)) + ')', cards).fetchall()
    conn.close()
    
    duel['player2_cards'] = [dict(c) for c in card_objs]
    duel['status'] = 'active'
    duel['deck1_cards'] = cards
    duel['deck2_cards'] = cards
    
    return jsonify({
        'duel_id': duel_id,
        'opponent': duel['player2_username'],
        'player_hp': duel['player2_hp'],
        'opponent_hp': duel['player1_hp'],
        'cards': duel['player2_cards'][:5]
    })

@app.route('/api/duel/start-online', methods=['POST'])
@auth_required
def start_online_duel():
    data = request.json
    duel_id = data.get('duelId')
    deck_id = data.get('deckId')
    
    if duel_id not in active_duels:
        return jsonify({'error': 'Duel not found'}), 404
    
    duel = active_duels[duel_id]
    
    conn = get_db()
    deck = conn.execute('SELECT * FROM decks WHERE id = ? AND player_id = ?', (deck_id, request.player_id)).fetchone()
    if not deck or json.loads(deck['card_list']) < 5:
        conn.close()
        return jsonify({'error': 'Need a deck with at least 5 cards'}), 400
    
    cards = json.loads(deck['card_list'])
    card_objs = conn.execute('SELECT * FROM cards WHERE id IN (' + ','.join(['?']*len(cards)) + ')', cards).fetchall()
    conn.close()
    
    if request.player_id == duel['player1']:
        duel['player1_cards'] = [dict(c) for c in card_objs]
        duel['deck1_cards'] = cards
        my_cards = duel['player1_cards']
        opponent_cards = duel['player2_cards']
        opponent = duel['player2_username']
    else:
        duel['player2_cards'] = [dict(c) for c in card_objs]
        duel['deck2_cards'] = cards
        my_cards = duel['player2_cards']
        opponent_cards = duel['player1_cards']
        opponent = duel['player1_username']
    
    if duel['status'] == 'active':
        if request.player_id == duel['player1']:
            socketio.emit('duel_started', {'duel_id': duel_id}, room=online_players[duel['player2']]['sid'])
        return jsonify({
            'duel_id': duel_id,
            'opponent': opponent,
            'player_hp': 100,
            'opponent_hp': 100,
            'cards': my_cards[:5],
            'opponent_cards_count': len(opponent_cards),
            'your_turn': duel['turn'] == request.player_id
        })
    
    duel['status'] = 'active'
    
    return jsonify({
        'duel_id': duel_id,
        'opponent': opponent,
        'player_hp': 100,
        'opponent_hp': 100,
        'cards': my_cards[:5],
        'opponent_cards_count': len(opponent_cards),
        'your_turn': True
    })

@app.route('/api/duel/move', methods=['POST'])
@auth_required
def make_duel_move():
    data = request.json
    duel_id = data.get('duelId')
    card_index = data.get('cardIndex')
    
    if duel_id not in active_duels:
        return jsonify({'error': 'Duel not found'}), 404
    
    duel = active_duels[duel_id]
    
    if request.player_id not in [duel['player1'], duel['player2']]:
        return jsonify({'error': 'Not in this duel'}), 403
    
    if duel['turn'] != request.player_id:
        return jsonify({'error': 'Not your turn'}), 400
    
    if request.player_id == duel['player1']:
        cards = duel['player1_cards']
        opponent_cards = duel['player2_cards']
        opponent_hp = duel['player2_hp']
        player_hp = duel['player1_hp']
    else:
        cards = duel['player2_cards']
        opponent_cards = duel['player1_cards']
        opponent_hp = duel['player1_hp']
        player_hp = duel['player2_hp']
    
    if card_index >= len(cards):
        return jsonify({'error': 'Invalid card'}), 400
    
    card = cards[card_index]
    damage = card.get('attack_damage', 15) or 15
    new_opponent_hp = max(0, opponent_hp - damage)
    
    if request.player_id == duel['player1']:
        duel['player2_hp'] = new_opponent_hp
    else:
        duel['player1_hp'] = new_opponent_hp
    
    game_over = new_opponent_hp <= 0
    
    if game_over:
        winner = request.username
        reward = 100 if request.player_id == duel['player1'] else 100
        conn = get_db()
        conn.execute('UPDATE players SET ac_balance = ac_balance + ? WHERE id = ?', (reward, request.player_id))
        conn.commit()
        conn.close()
    else:
        next_turn = duel['player2'] if duel['turn'] == duel['player1'] else duel['player1']
        duel['turn'] = next_turn
        
        opponent_card = random.choice(opponent_cards) if opponent_cards else {'name': 'Attack', 'attack_damage': 10}
        opp_damage = opponent_card.get('attack_damage', 10) or 10
        new_player_hp = max(0, player_hp - opp_damage)
        
        if request.player_id == duel['player1']:
            duel['player1_hp'] = new_player_hp
        else:
            duel['player2_hp'] = new_player_hp
        
        game_over = new_player_hp <= 0
        if game_over:
            winner = duel['player2_username'] if request.player_id == duel['player1'] else duel['player1_username']
            reward = 100
            conn = get_db()
            winner_id = duel['player2'] if request.player_id == duel['player1'] else duel['player1']
            conn.execute('UPDATE players SET ac_balance = ac_balance + ? WHERE id = ?', (reward, winner_id))
            conn.commit()
            conn.close()
        else:
            winner = None
    
    other_player = duel['player2'] if request.player_id == duel['player1'] else duel['player1']
    if other_player in online_players:
        socketio.emit('duel_update', {
            'duel_id': duel_id,
            'opponent_hp': new_opponent_hp if request.player_id == duel['player1'] else new_player_hp,
            'your_turn': True,
            'opponent_card': card['name'],
            'opponent_damage': damage
        }, room=online_players[other_player]['sid'])
    
    return jsonify({
        'opponent_hp': new_opponent_hp,
        'your_hp': new_player_hp if not game_over else player_hp,
        'game_over': game_over,
        'winner': winner,
        'your_turn': not game_over and other_player
    })

if __name__ == '__main__':
    init_db()
    app.run(host='0.0.0.0', port=3001, debug=True)
