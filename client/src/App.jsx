import React from 'react'
import ReactDOM from 'react-dom/client'
import { io } from 'socket.io-client'
import './index.css'

const API = 'https://anotherworldsimulator.onrender.com/api'
const socket = io('https://anotherworldsimulator.onrender.com')

function App() {
  const [player, setPlayer] = React.useState(null)
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState('hub')

  React.useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : Promise.reject())
        .then(setPlayer)
        .catch(() => localStorage.removeItem('token'))
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (username, password) => {
    const res = await fetch(`${API}/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    localStorage.setItem('token', data.token)
    setPlayer(data.player)
  }

  const register = async (username, password) => {
    const res = await fetch(`${API}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error)
    localStorage.setItem('token', data.token)
    setPlayer(data.player)
  }

  const logout = () => {
    localStorage.removeItem('token')
    setPlayer(null)
  }

  const refreshPlayer = async () => {
    const token = localStorage.getItem('token')
    if (!token) return
    const res = await fetch(`${API}/me`, { headers: { Authorization: `Bearer ${token}` } })
    if (res.ok) setPlayer(await res.json())
  }

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

  if (loading) return <div style={styles.loading}><div style={styles.loadingText}>Loading...</div></div>

  if (!player) return <Login login={login} register={register} />

  return (
    <div style={styles.app}>
      <nav style={styles.nav}>
        <div style={styles.navContent}>
          <div style={styles.logo}>🎴 ANOTHER WORLD</div>
          <div style={styles.navLinks}>
            <NavBtn active={page === 'hub'} onClick={() => setPage('hub')}>🏠 Hub</NavBtn>
            <NavBtn active={page === 'collection'} onClick={() => setPage('collection')}>🃏 Collection</NavBtn>
            <NavBtn active={page === 'packs'} onClick={() => setPage('packs')}>📦 Packs</NavBtn>
            <NavBtn active={page === 'decks'} onClick={() => setPage('decks')}>🛡️ Decks</NavBtn>
            <NavBtn active={page === 'market'} onClick={() => setPage('market')}>🏪 Market</NavBtn>
            <NavBtn active={page === 'arena'} onClick={() => setPage('arena')}>⚔️ Arena</NavBtn>
            <NavBtn active={page === 'profile'} onClick={() => setPage('profile')}>👤 Profile</NavBtn>
          </div>
          <div style={styles.navRight}>
            <div style={styles.ac}>🪙 {player.ac_balance}</div>
            <div style={styles.user}>
              <span>{player.username}</span>
              <button onClick={logout} style={styles.logout}>Logout</button>
            </div>
          </div>
        </div>
      </nav>

      <main style={styles.main}>
        {page === 'hub' && <HubPage authHeaders={authHeaders} refreshPlayer={refreshPlayer} setPage={setPage} />}
        {page === 'collection' && <CollectionPage authHeaders={authHeaders} />}
        {page === 'packs' && <PacksPage authHeaders={authHeaders} refreshPlayer={refreshPlayer} />}
        {page === 'decks' && <DecksPage authHeaders={authHeaders} />}
        {page === 'market' && <MarketPage authHeaders={authHeaders} />}
        {page === 'arena' && <ArenaPage />}
        {page === 'profile' && <ProfilePage player={player} />}
      </main>
    </div>
  )
}

function NavBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      ...styles.navBtn,
      color: active ? '#ffd700' : '#9ca3af',
      borderBottom: active ? '2px solid #ffd700' : '2px solid transparent'
    }}>
      {children}
    </button>
  )
}

function Login({ login, register }) {
  const [isRegister, setIsRegister] = React.useState(false)
  const [error, setError] = React.useState('')

  const handle = async (e) => {
    e.preventDefault()
    setError('')
    const username = e.target.username.value
    const password = e.target.password.value
    try {
      await (isRegister ? register : login)(username, password)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div style={styles.loginPage}>
      <div style={styles.loginBox}>
        <h1 style={styles.loginTitle}>🎴 ANOTHER WORLD</h1>
        <h2 style={styles.loginSubtitle}>SIMULATOR</h2>
        <form onSubmit={handle} style={styles.loginForm}>
          <input name="username" placeholder="Username" required style={styles.loginInput} />
          <input name="password" type="password" placeholder="Password" required style={styles.loginInput} />
          {error && <p style={styles.error}>{error}</p>}
          <button type="submit" style={styles.loginBtn}>{isRegister ? 'REGISTER' : 'LOGIN'}</button>
        </form>
        <p style={styles.loginSwitch}>
          {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
          <button onClick={() => setIsRegister(!isRegister)} style={styles.loginLink}>
            {isRegister ? 'Login' : 'Register'}
          </button>
        </p>
      </div>
    </div>
  )
}

function HubPage({ authHeaders, refreshPlayer, setPage }) {
  const [missions, setMissions] = React.useState([])
  const [leaderboard, setLeaderboard] = React.useState([])
  const [messages, setMessages] = React.useState([])
  const [msg, setMsg] = React.useState('')
  const [npcDeals, setNpcDeals] = React.useState([])

  React.useEffect(() => {
    fetchData()
    fetchMessages()
    fetchNpcDeals()
    const interval = setInterval(fetchMessages, 3000)
    return () => clearInterval(interval)
  }, [])

  const fetchNpcDeals = async () => {
    try {
      const res = await fetch('/api/npc-deals', { headers: authHeaders() })
      if (res.ok) setNpcDeals(await res.json())
    } catch {}
  }

  const acceptDeal = async (dealId) => {
    const res = await fetch(`/api/npc-deals/${dealId}/accept`, { method: 'POST', headers: authHeaders() })
    if (res.ok) {
      refreshPlayer()
      fetchNpcDeals()
    }
  }

  const fetchData = async () => {
    try {
      const [mRes, lRes] = await Promise.all([
        fetch('/api/missions', { headers: authHeaders() }),
        fetch('/api/leaderboard', { headers: authHeaders() })
      ])
      if (mRes.ok) setMissions(await mRes.json())
      if (lRes.ok) setLeaderboard(await lRes.json())
    } catch (e) { console.error(e) }
  }

  const fetchMessages = async () => {
    try {
      const res = await fetch('/api/chat', { headers: authHeaders() })
      if (res.ok) setMessages(await res.json())
    } catch {}
  }

  const sendMessage = async (e) => {
    e.preventDefault()
    if (!msg.trim()) return
    try {
      await fetch('/api/chat', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg })
      })
      setMsg('')
      fetchMessages()
    } catch {}
  }

  const claimMission = async (id) => {
    const res = await fetch(`/api/missions/${id}/claim`, { method: 'POST', headers: authHeaders() })
    if (res.ok) {
      refreshPlayer()
      fetchData()
    }
  }

  const dailyMissions = missions.filter(m => m.type === 'daily')

  return (
    <div style={styles.hubGrid}>
      <div style={styles.hubLeft}>
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🎮 MAIN MENU</h2>
          <div style={styles.menuGrid}>
            <MenuBtn onClick={() => setPage('packs')}>📦<br/>Buy Packs</MenuBtn>
            <MenuBtn onClick={() => setPage('decks')}>🛡️<br/>Build Deck</MenuBtn>
            <MenuBtn onClick={() => setPage('market')}>🏪<br/>Trade</MenuBtn>
            <MenuBtn onClick={() => setPage('arena')}>⚔️<br/>Duel</MenuBtn>
          </div>
        </div>

        {npcDeals.length > 0 && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>🏪 NPC TRADE DEALS</h2>
            <div style={styles.missionsList}>
              {npcDeals.map(deal => (
                <div key={deal.id} style={styles.missionItem}>
                  <div>
                    <div style={styles.missionDesc}>Trade {deal.offered.length} cards for {deal.requested.length} cards</div>
                    <div style={styles.missionReward}>Expires: {new Date(deal.expires_at).toLocaleTimeString()}</div>
                  </div>
                  <button onClick={() => acceptDeal(deal.id)} style={styles.claimBtn}>Accept</button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>📋 DAILY MISSIONS</h2>
          {dailyMissions.length === 0 ? <p style={styles.empty}>No missions available</p> : (
            <div style={styles.missionsList}>
              {dailyMissions.map(m => (
                <div key={m.id} style={styles.missionItem}>
                  <div>
                    <div style={styles.missionDesc}>{m.description}</div>
                    <div style={styles.missionReward}>+{m.ac_reward} AC</div>
                  </div>
                  {m.completed_today ? (
                    <span style={styles.completed}>✓ Done</span>
                  ) : (
                    <button onClick={() => claimMission(m.id)} style={styles.claimBtn}>Claim</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🏆 TOP PLAYERS</h2>
          <div style={styles.leaderboard}>
            {leaderboard.slice(0, 10).map((p, i) => (
              <div key={p.id} style={styles.leaderItem}>
                <span style={styles.rank}>#{i + 1}</span>
                <span style={styles.playerName}>{p.username}</span>
                <span style={styles.playerAc}>🪙 {p.ac_balance}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={styles.chatBox}>
        <h2 style={styles.cardTitle}>💬 GLOBAL CHAT</h2>
        <div style={styles.chatMsgs}>
          {messages.map(m => (
            <div key={m.id} style={styles.chatMsg}>
              <span style={styles.chatUser}>{m.username}:</span> {m.message}
            </div>
          ))}
        </div>
        <form onSubmit={sendMessage} style={styles.chatForm}>
          <input value={msg} onChange={e => setMsg(e.target.value)} placeholder="Type a message..." style={styles.chatInput} />
          <button type="submit" style={styles.chatBtn}>Send</button>
        </form>
      </div>
    </div>
  )
}

function MenuBtn({ onClick, children }) {
  return <button onClick={onClick} style={styles.menuBtn}>{children}</button>
}

function CollectionPage({ authHeaders }) {
  const [cards, setCards] = React.useState([])
  const [filter, setFilter] = React.useState({ tcg: '', rarity: '' })
  const [loading, setLoading] = React.useState(true)
  const [selling, setSelling] = React.useState(null)

  React.useEffect(() => {
    loadCollection()
  }, [])

  const loadCollection = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/collection', { headers: authHeaders() })
      const data = await res.json()
      setCards(data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const sellCard = async (cardId, quantity) => {
    const res = await fetch('/api/sell-cards', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId, quantity })
    })
    if (res.ok) {
      loadCollection()
      setSelling(null)
    }
  }

  const getPrice = (rarity) => {
    const prices = { common: 5, uncommon: 15, rare: 50, ultra_rare: 200, legendary: 1000 }
    return prices[rarity] || 5
  }

  const filtered = cards.filter(c =>
    c.owned > 0 &&
    (!filter.tcg || c.tcg === filter.tcg) &&
    (!filter.rarity || c.rarity === filter.rarity)
  )

  const getRarityColor = (r) => {
    const colors = { common: '#6b7280', uncommon: '#c0c0c0', rare: '#ffd700', ultra_rare: '#a855f7', legendary: '#ec4899' }
    return colors[r] || '#6b7280'
  }

  const getEmoji = (tcg) => {
    return { pokemon: '⚡', magic: '✨', onepiece: '🏴‍☠️', dragonball: '🐉' }[tcg] || '🃏'
  }

  if (loading) return <div style={styles.page}><p>Loading...</p></div>

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>🃏 YOUR COLLECTION</h1>
      
      <div style={styles.filters}>
        <select onChange={e => setFilter({ ...filter, tcg: e.target.value })} style={styles.select}>
          <option value="">All TCGs</option>
          <option value="pokemon">⚡ Pokémon</option>
          <option value="magic">✨ Magic</option>
          <option value="onepiece">🏴‍☠️ One Piece</option>
          <option value="dragonball">🐉 Dragon Ball</option>
        </select>
        <select onChange={e => setFilter({ ...filter, rarity: e.target.value })} style={styles.select}>
          <option value="">All Rarities</option>
          <option value="common">Common</option>
          <option value="uncommon">Uncommon</option>
          <option value="rare">Rare</option>
          <option value="ultra_rare">Ultra Rare</option>
          <option value="legendary">Legendary</option>
        </select>
        <span style={styles.cardCount}>{filtered.length} cards</span>
      </div>

      {filtered.length === 0 ? (
        <div style={styles.emptyCard}>
          <p>No cards found!</p>
          <p>Open some packs to get cards.</p>
          <button onClick={() => window.location.hash = 'packs'} style={styles.actionBtn}>Open Packs</button>
        </div>
      ) : (
        <div style={styles.cardGrid}>
          {filtered.map(card => (
            <div key={card.id} style={{ ...styles.collectionCard, borderColor: getRarityColor(card.rarity) }}>
              <div style={{ ...styles.cardBg, background: `linear-gradient(135deg, ${getRarityColor(card.rarity)}40, transparent)` }}>
                <span style={styles.cardIcon}>{getEmoji(card.tcg)}</span>
              </div>
              <div style={styles.cardName}>{card.name}</div>
              <div style={{ ...styles.cardRarity, color: getRarityColor(card.rarity) }}>{card.rarity.replace('_', ' ')}</div>
              <div style={styles.cardOwned}>×{card.owned}</div>
              {card.owned > 0 && (
                <button onClick={() => setSelling(card)} style={styles.sellBtn}>
                  Sell ({getPrice(card.rarity)} AC)
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {selling && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Sell Card</h2>
            <button onClick={() => setSelling(null)} style={styles.closeBtn}>✕</button>
            <p>Sell {selling.name} for {getPrice(selling.rarity)} AC each?</p>
            <p>You own: {selling.owned}</p>
            <div style={styles.sellActions}>
              {[1, 2, 3, 4, 5].filter(n => n <= selling.owned).map(n => (
                <button key={n} onClick={() => sellCard(selling.id, n)} style={styles.packBtn}>
                  Sell {n} ({getPrice(selling.rarity) * n} AC)
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function PacksPage({ authHeaders, refreshPlayer }) {
  const [opening, setOpening] = React.useState(false)
  const [cards, setCards] = React.useState([])
  const [error, setError] = React.useState('')
  const [welcomeClaimed, setWelcomeClaimed] = React.useState(null)

  React.useEffect(() => {
    fetch('/api/welcome-pack/status', { headers: authHeaders() })
      .then(r => r.json())
      .then(d => setWelcomeClaimed(d.claimed))
      .catch(() => setWelcomeClaimed(true))
  }, [])

  const claimWelcome = async () => {
    const res = await fetch('/api/welcome-pack', { method: 'POST', headers: authHeaders() })
    if (res.ok) {
      const data = await res.json()
      setCards(data.cards)
      setOpening(true)
      setWelcomeClaimed(true)
      refreshPlayer()
    }
  }

  const packs = [
    { type: 'standard', cost: 100, emoji: '📦', color: '#6b7280', rates: '70% Common, 25% Uncommon, 5% Rare' },
    { type: 'premium', cost: 300, emoji: '💎', color: '#a855f7', rates: '50% Uncommon, 35% Rare, 14% Ultra Rare, 1% Legendary' },
    { type: 'legendary', cost: 1000, emoji: '👑', color: '#ffd700', rates: '20% Rare, 50% Ultra Rare, 30% Legendary' }
  ]

  const openPack = async (type) => {
    setError('')
    const res = await fetch('/api/packs/open', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ packType: type })
    })
    
    if (res.ok) {
      const data = await res.json()
      setCards(data.cards)
      setOpening(true)
      refreshPlayer()
    } else {
      const data = await res.json()
      setError(data.error || 'Failed to open pack')
    }
  }

  const getRarityColor = (r) => {
    const colors = { common: '#6b7280', uncommon: '#c0c0c0', rare: '#ffd700', ultra_rare: '#a855f7', legendary: '#ec4899' }
    return colors[r] || '#6b7280'
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>📦 PACK SHOP</h1>
      
      {welcomeClaimed === false && (
        <div style={{ ...styles.packCard, borderColor: '#ffd700', marginBottom: '2rem' }}>
          <div style={styles.packEmoji}>🎁</div>
          <h3 style={styles.packName}>WELCOME GIFT</h3>
          <p style={styles.packRates}>5 free cards for new players!</p>
          <button onClick={claimWelcome} style={{ ...styles.packBtn, backgroundColor: '#ffd700', color: '#000' }}>
            CLAIM FREE
          </button>
        </div>
      )}
      
      {error && <div style={styles.errorBox}>{error}</div>}
      
      <div style={styles.packsGrid}>
        {packs.map(pack => (
          <div key={pack.type} style={{ ...styles.packCard, borderColor: pack.color }}>
            <div style={styles.packEmoji}>{pack.emoji}</div>
            <h3 style={styles.packName}>{pack.type.toUpperCase()}</h3>
            <p style={styles.packRates}>{pack.rates}</p>
            <button onClick={() => openPack(pack.type)} style={{ ...styles.packBtn, backgroundColor: pack.color }}>
              {pack.cost} AC
            </button>
          </div>
        ))}
      </div>

      {opening && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>🎉 PACK OPENED!</h2>
            <button onClick={() => setOpening(false)} style={styles.closeBtn}>✕</button>
            
            <div style={styles.revealGrid}>
              {cards.map((card, i) => (
                <div key={i} style={{ ...styles.revealCard, borderColor: getRarityColor(card.rarity) }}>
                  <div style={styles.revealIcon}>
                    {card.tcg === 'pokemon' ? '⚡' : card.tcg === 'magic' ? '✨' : card.tcg === 'onepiece' ? '🏴‍☠️' : '🐉'}
                  </div>
                  <div style={styles.revealName}>{card.name}</div>
                  <div style={{ ...styles.revealRarity, color: getRarityColor(card.rarity) }}>{card.rarity.replace('_', ' ')}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function DecksPage({ authHeaders }) {
  const [decks, setDecks] = React.useState([])
  const [collection, setCollection] = React.useState([])
  const [selectedDeck, setSelectedDeck] = React.useState(null)
  const [newDeckName, setNewDeckName] = React.useState('')
  const [newDeckTcg, setNewDeckTcg] = React.useState('pokemon')
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [dRes, cRes] = await Promise.all([
        fetch('/api/decks', { headers: authHeaders() }),
        fetch('/api/collection', { headers: authHeaders() })
      ])
      const d = await dRes.json()
      const c = await cRes.json()
      setDecks(d)
      setCollection(c.filter(card => card.owned > 0))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const createDeck = async () => {
    if (!newDeckName.trim()) return
    const res = await fetch('/api/decks', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newDeckName, tcg: newDeckTcg, cardList: [] })
    })
    if (res.ok) {
      setNewDeckName('')
      loadData()
    }
  }

  const addCard = async (cardId) => {
    if (!selectedDeck) return
    const deck = decks.find(d => d.id === selectedDeck)
    if (!deck) return
    
    const newList = [...(deck.card_list || []), cardId]
    await fetch(`/api/decks/${selectedDeck}`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: deck.name, cardList: newList })
    })
    loadData()
  }

  const removeCard = async (cardId) => {
    if (!selectedDeck) return
    const deck = decks.find(d => d.id === selectedDeck)
    if (!deck) return
    
    const idx = deck.card_list.indexOf(cardId)
    if (idx > -1) {
      const newList = [...deck.card_list]
      newList.splice(idx, 1)
      await fetch(`/api/decks/${selectedDeck}`, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: deck.name, cardList: newList })
      })
      loadData()
    }
  }

  const deleteDeck = async () => {
    if (!selectedDeck) return
    if (!confirm('Delete this deck?')) return
    await fetch(`/api/decks/${selectedDeck}`, { method: 'DELETE', headers: authHeaders() })
    setSelectedDeck(null)
    loadData()
  }

  const selected = decks.find(d => d.id === selectedDeck)
  const tcgCollection = collection.filter(c => !selected || c.tcg === selected.tcg)

  if (loading) return <div style={styles.page}><p>Loading...</p></div>

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>🛡️ DECK BUILDER</h1>
      
      <div style={styles.deckBuilder}>
        <div style={styles.deckList}>
          <h3 style={styles.sectionTitle}>YOUR DECKS ({decks.length}/3)</h3>
          {decks.map(d => (
            <div key={d.id} onClick={() => setSelectedDeck(d.id)} style={{
              ...styles.deckItem,
              borderColor: selectedDeck === d.id ? '#e63946' : '#374151'
            }}>
              <div style={styles.deckName}>{d.name}</div>
              <div style={styles.deckInfo}>{d.tcg} • {d.card_list?.length || 0} cards</div>
            </div>
          ))}
          
          {decks.length < 3 && (
            <div style={styles.newDeck}>
              <input value={newDeckName} onChange={e => setNewDeckName(e.target.value)} placeholder="Deck name" style={styles.input} />
              <select value={newDeckTcg} onChange={e => setNewDeckTcg(e.target.value)} style={styles.select}>
                <option value="pokemon">⚡ Pokémon</option>
                <option value="magic">✨ Magic</option>
                <option value="onepiece">🏴‍☠️ One Piece</option>
                <option value="dragonball">🐉 Dragon Ball</option>
              </select>
              <button onClick={createDeck} style={styles.createBtn}>CREATE</button>
            </div>
          )}
        </div>

        <div style={styles.deckEditor}>
          {selected ? (
            <>
              <div style={styles.deckHeader}>
                <h3>{selected.name} ({selected.card_list?.length || 0} cards)</h3>
                <button onClick={deleteDeck} style={styles.deleteBtn}>Delete Deck</button>
              </div>
              
              <div style={styles.deckSection}>
                <h4 style={styles.subsectionTitle}>📋 IN DECK</h4>
                <div style={styles.cardList}>
                  {selected?.card_list?.length === 0 ? <p style={styles.empty}>No cards yet</p> : (
                    selected?.card_list?.map((cardId, i) => {
                      const card = collection.find(c => c.id === cardId)
                      return card ? (
                        <div key={i} onClick={() => removeCard(cardId)} style={styles.inDeckCard} title="Click to remove">
                          {card.name}
                        </div>
                      ) : null
                    })
                  )}
                </div>
              </div>

              <div style={styles.deckSection}>
                <h4 style={styles.subsectionTitle}>➕ ADD CARDS ({tcgCollection.length} available)</h4>
                <div style={styles.cardList}>
                  {tcgCollection.map(card => (
                    <div key={card.id} onClick={() => addCard(card.id)} style={styles.addCard} title="Click to add">
                      {card.name} ×{card.owned}
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div style={styles.noDeck}>Select a deck to edit</div>
          )}
        </div>
      </div>
    </div>
  )
}

function MarketPage({ authHeaders }) {
  const [auctions, setAuctions] = React.useState([])
  const [collection, setCollection] = React.useState([])
  const [tab, setTab] = React.useState('auctions')
  const [listing, setListing] = React.useState({ cardId: '', price: 100, duration: 1 })
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [aRes, cRes] = await Promise.all([
        fetch('/api/auctions', { headers: authHeaders() }),
        fetch('/api/collection', { headers: authHeaders() })
      ])
      setAuctions(await aRes.json())
      setCollection((await cRes.json()).filter(c => c.owned > 0))
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const createAuction = async () => {
    if (!listing.cardId || listing.price < 1) return
    await fetch('/api/auctions', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ cardId: listing.cardId, startPrice: listing.price, duration: parseInt(listing.duration) })
    })
    setListing({ cardId: '', price: 100, duration: 1 })
    loadData()
  }

  const bid = async (auctionId, amount) => {
    const bidAmount = parseInt(amount)
    if (!bidAmount || bidAmount < 1) return
    await fetch(`/api/auctions/${auctionId}/bid`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ bid: bidAmount })
    })
    loadData()
  }

  if (loading) return <div style={styles.page}><p>Loading...</p></div>

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>🏪 MARKETPLACE</h1>
      
      <div style={styles.tabs}>
        <button onClick={() => setTab('auctions')} style={{ ...styles.tab, color: tab === 'auctions' ? '#ffd700' : '#9ca3af' }}>🔨 Auctions</button>
        <button onClick={() => setTab('sell')} style={{ ...styles.tab, color: tab === 'sell' ? '#ffd700' : '#9ca3af' }}>💰 Sell Cards</button>
      </div>

      {tab === 'auctions' && (
        <div style={styles.auctionsGrid}>
          {auctions.length === 0 ? <p style={styles.empty}>No active auctions</p> : (
            auctions.map(a => (
              <div key={a.id} style={styles.auctionCard}>
                <div style={styles.auctionName}>{a.name}</div>
                <div style={styles.auctionInfo}>{a.rarity} • {a.tcg}</div>
                <div style={styles.auctionPrice}>💰 Current: {a.current_bid} AC</div>
                <div style={styles.auctionEnds}>Ends: {new Date(a.ends_at).toLocaleString()}</div>
                <input type="number" placeholder="Your bid" id={`bid-${a.id}`} style={styles.input} />
                <button onClick={() => bid(a.id, document.getElementById(`bid-${a.id}`).value)} style={styles.bidBtn}>BID</button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === 'sell' && (
        <div style={styles.sellSection}>
          <h3 style={styles.sectionTitle}>Create Auction</h3>
          <div style={styles.sellForm}>
            <select value={listing.cardId} onChange={e => setListing({ ...listing, cardId: e.target.value })} style={styles.select}>
              <option value="">Select a card...</option>
              {collection.map(c => (
                <option key={c.id} value={c.id}>{c.name} (×{c.owned})</option>
              ))}
            </select>
            <input type="number" value={listing.price} onChange={e => setListing({ ...listing, price: e.target.value })} style={styles.input} placeholder="Starting price" />
            <select value={listing.duration} onChange={e => setListing({ ...listing, duration: e.target.value })} style={styles.select}>
              <option value="1">1 hour</option>
              <option value="6">6 hours</option>
              <option value="24">24 hours</option>
            </select>
            <button onClick={createAuction} style={styles.sellBtn}>CREATE AUCTION</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ArenaPage() {
  const [tournaments, setTournaments] = React.useState([])
  const [activeTab, setActiveTab] = React.useState('duel')
  const [duelState, setDuelState] = React.useState(null)
  const [decks, setDecks] = React.useState([])
  const [selectedDeck, setSelectedDeck] = React.useState(null)
  const [duelResult, setDuelResult] = React.useState(null)
  const [onlinePlayers, setOnlinePlayers] = React.useState([])
  const [challenge, setChallenge] = React.useState(null)
  const [myDuelId, setMyDuelId] = React.useState(null)

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}` })

  React.useEffect(() => {
    fetchTournaments()
    fetchDecks()
    fetchOnlinePlayers()
    
    const token = localStorage.getItem('token')
    if (token) {
      socket.emit('auth', { token })
    }
    
    socket.on('online_players', (players) => {
      setOnlinePlayers(players)
    })
    
    socket.on('duel_challenge', (data) => {
      setChallenge(data)
    })
    
    socket.on('duel_accepted', (data) => {
      setMyDuelId(data.duel_id)
      setActiveTab('online-duel')
    })
    
    socket.on('duel_started', () => {
      setActiveTab('online-duel')
    })
    
    socket.on('duel_update', (data) => {
      setDuelState(prev => ({
        ...prev,
        opponent_hp: data.opponent_hp,
        your_turn: data.your_turn,
        last_opponent_card: data.opponent_card,
        last_opponent_damage: data.opponent_damage
      }))
    })
    
    return () => {
      socket.off('online_players')
      socket.off('duel_challenge')
      socket.off('duel_accepted')
      socket.off('duel_started')
      socket.off('duel_update')
    }
  }, [])

  const fetchTournaments = async () => {
    try {
      const res = await fetch('/api/tournaments', { headers: authHeaders() })
      if (res.ok) setTournaments(await res.json())
    } catch {}
  }

  const fetchDecks = async () => {
    try {
      const res = await fetch('/api/decks', { headers: authHeaders() })
      if (res.ok) setDecks(await res.json())
    } catch {}
  }

  const fetchOnlinePlayers = async () => {
    try {
      const res = await fetch('/api/players/online', { headers: authHeaders() })
      if (res.ok) setOnlinePlayers(await res.json())
    } catch {}
  }

  const joinTournament = async (tid) => {
    const res = await fetch(`/api/tournaments/${tid}/join`, { method: 'POST', headers: authHeaders() })
    if (res.ok) fetchTournaments()
  }

  const startDuel = async () => {
    if (!selectedDeck) return
    const res = await fetch('/api/duel/start', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ deckId: selectedDeck })
    })
    if (res.ok) {
      const data = await res.json()
      setDuelState(data)
      setActiveTab('duel')
    }
  }

  const challengePlayer = async (playerId) => {
    const res = await fetch(`/api/duel/challenge/${playerId}`, {
      method: 'POST',
      headers: authHeaders()
    })
    const data = await res.json()
    if (res.ok) {
      setMyDuelId(data.duel_id)
    }
  }

  const acceptChallenge = async () => {
    if (!challenge) return
    const res = await fetch(`/api/duel/accept/${challenge.duel_id}`, {
      method: 'POST',
      headers: authHeaders()
    })
    if (res.ok) {
      const data = await res.json()
      setMyDuelId(challenge.duel_id)
      setDuelState(data)
      setChallenge(null)
      setActiveTab('online-duel')
    }
  }

  const startOnlineDuel = async () => {
    if (!selectedDeck) return
    const res = await fetch('/api/duel/start-online', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ duelId: myDuelId, deckId: selectedDeck })
    })
    if (res.ok) {
      const data = await res.json()
      setDuelState(data)
      setActiveTab('online-duel')
    }
  }

  const playCard = async (cardIndex) => {
    const res = await fetch('/api/duel/move', {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ duelId: myDuelId, cardIndex })
    })
    if (res.ok) {
      const data = await res.json()
      setDuelState(prev => ({ ...prev, opponent_hp: data.opponent_hp, your_hp: data.your_hp, your_turn: data.your_turn }))
      if (data.game_over) {
        setDuelResult(data)
      }
    }
  }

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>⚔️ ARENA</h1>
      
      {challenge && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>⚔️ Duel Challenge!</h2>
            <p>{challenge.from_name} wants to duel you!</p>
            <div style={styles.sellActions}>
              <button onClick={acceptChallenge} style={styles.packBtn}>Accept</button>
              <button onClick={() => setChallenge(null)} style={{ ...styles.packBtn, backgroundColor: '#6b7280' }}>Decline</button>
            </div>
          </div>
        </div>
      )}
      
      <div style={styles.filters}>
        <button onClick={() => setActiveTab('duel')} style={{ ...styles.navBtn, color: activeTab === 'duel' ? '#ffd700' : '#9ca3af' }}>🤖 vs AI</button>
        <button onClick={() => setActiveTab('online')} style={{ ...styles.navBtn, color: activeTab === 'online' ? '#ffd700' : '#9ca3af' }}>🌐 vs Player</button>
        <button onClick={() => setActiveTab('tournaments')} style={{ ...styles.navBtn, color: activeTab === 'tournaments' ? '#ffd700' : '#9ca3af' }}>🏆 Tournaments</button>
      </div>

      {activeTab === 'tournaments' && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🏆 ACTIVE TOURNAMENTS</h2>
          {tournaments.length === 0 ? (
            <p style={styles.empty}>No tournaments available</p>
          ) : (
            <div style={styles.missionsList}>
              {tournaments.map(t => (
                <div key={t.id} style={styles.missionItem}>
                  <div>
                    <div style={styles.missionDesc}>{t.name}</div>
                    <div style={styles.missionReward}>Entry: {t.entry_fee} AC | Prize: {t.prize_pool} AC | Players: {t.participants}/{t.max_participants}</div>
                  </div>
                  {t.joined ? (
                    <span style={styles.completed}>Joined</span>
                  ) : (
                    <button onClick={() => joinTournament(t.id)} style={styles.claimBtn}>Join</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'duel' && !duelState && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>⚔️ DUEL vs AI</h2>
          <p style={styles.empty}>Select a deck to duel against AI</p>
          <div style={styles.filters}>
            {decks.map(d => (
              <button key={d.id} onClick={() => setSelectedDeck(d.id)} style={{ ...styles.packBtn, backgroundColor: selectedDeck === d.id ? '#ffd700' : '#374151' }}>
                {d.name}
              </button>
            ))}
          </div>
          <button onClick={startDuel} disabled={!selectedDeck} style={{ ...styles.packBtn, backgroundColor: selectedDeck ? '#22c55e' : '#374151', marginTop: '1rem' }}>
            START DUEL
          </button>
        </div>
      )}

      {activeTab === 'duel' && duelState && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>⚔️ DUEL vs AI</h2>
          <div style={styles.duelArena}>
            <div style={styles.duelPlayer}>
              <h3>You</h3>
              <div style={styles.hpBar}><div style={{ ...styles.hpFill, width: `${duelState.player_hp}%` }}></div></div>
              <p>HP: {duelState.player_hp}/100</p>
            </div>
            <div style={styles.vsText}>VS</div>
            <div style={styles.duelPlayer}>
              <h3>AI Opponent</h3>
              <div style={styles.hpBar}><div style={{ ...styles.hpFill, width: `${duelState.opponent_hp}%`, backgroundColor: '#ef4444' }}></div></div>
              <p>HP: {duelState.opponent_hp}/100</p>
            </div>
          </div>
          {duelResult ? (
            <div style={styles.duelResult}>
              <h2>{duelResult.result === 'win' ? '🎉 YOU WIN!' : duelResult.result === 'lose' ? '💀 YOU LOSE' : '🤝 DRAW'}</h2>
              <p>Reward: {duelResult.reward} AC</p>
              <button onClick={() => { setDuelState(null); setDuelResult(null); }} style={styles.packBtn}>Play Again</button>
            </div>
          ) : (
            <div style={styles.duelCards}>
              {duelState.player_hand?.map((card, i) => (
                <button key={i} onClick={() => playCard(i)} style={styles.duelCard}>
                  {card.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'online' && !myDuelId && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>🌐 ONLINE PLAYERS</h2>
          <p style={styles.empty}>Challenge other players to a duel!</p>
          <div style={styles.missionsList}>
            {onlinePlayers.filter(p => p.status === 'online').map(p => (
              <div key={p.id} style={styles.missionItem}>
                <div>
                  <div style={styles.missionDesc}>🟢 {p.username}</div>
                </div>
                <button onClick={() => challengePlayer(p.id)} style={styles.claimBtn}>Challenge</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'online' && myDuelId && !duelState && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>⏳ WAITING FOR OPPONENT</h2>
          <p style={styles.empty}>Waiting for opponent to accept...</p>
          <div style={styles.filters}>
            {decks.map(d => (
              <button key={d.id} onClick={() => setSelectedDeck(d.id)} style={{ ...styles.packBtn, backgroundColor: selectedDeck === d.id ? '#ffd700' : '#374151' }}>
                {d.name}
              </button>
            ))}
          </div>
          <button onClick={startOnlineDuel} disabled={!selectedDeck} style={{ ...styles.packBtn, backgroundColor: selectedDeck ? '#22c55e' : '#374151', marginTop: '1rem' }}>
            START DUEL
          </button>
        </div>
      )}

      {activeTab === 'online-duel' && duelState && (
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>⚔️ DUEL vs {duelState.opponent}</h2>
          <div style={styles.duelArena}>
            <div style={styles.duelPlayer}>
              <h3>You</h3>
              <div style={styles.hpBar}><div style={{ ...styles.hpFill, width: `${duelState.your_hp || 100}%` }}></div></div>
              <p>HP: {duelState.your_hp || 100}/100</p>
              {duelState.last_opponent_card && (
                <p style={{ color: '#ef4444', fontSize: '12px' }}>{duelState.last_opponent_card} dealt {duelState.last_opponent_damage} dmg</p>
              )}
            </div>
            <div style={styles.vsText}>VS</div>
            <div style={styles.duelPlayer}>
              <h3>{duelState.opponent}</h3>
              <div style={styles.hpBar}><div style={{ ...styles.hpFill, width: `${duelState.opponent_hp}%`, backgroundColor: '#ef4444' }}></div></div>
              <p>HP: {duelState.opponent_hp}/100</p>
              <p style={{ fontSize: '12px' }}>Cards: {duelState.opponent_cards_count || '?'}</p>
            </div>
          </div>
          {duelResult ? (
            <div style={styles.duelResult}>
              <h2>{duelResult.winner === localStorage.getItem('username') ? '🎉 YOU WIN!' : '💀 YOU LOSE'}</h2>
              <button onClick={() => { setDuelState(null); setDuelResult(null); setMyDuelId(null); setActiveTab('online'); }} style={styles.packBtn}>Play Again</button>
            </div>
          ) : (
            <div>
              <p style={{ textAlign: 'center', color: duelState.your_turn ? '#22c55e' : '#9ca3af' }}>
                {duelState.your_turn ? "Your turn! Play a card!" : "Opponent's turn..."}
              </p>
              <div style={styles.duelCards}>
                {duelState.cards?.map((card, i) => (
                  <button 
                    key={i} 
                    onClick={() => duelState.your_turn && playCard(i)} 
                    style={{ ...styles.duelCard, opacity: duelState.your_turn ? 1 : 0.5 }}
                  >
                    {card.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProfilePage({ player }) {
  const [achievements, setAchievements] = React.useState([])

  React.useEffect(() => {
    fetch('/api/achievements', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json())
      .then(setAchievements)
  }, [])

  return (
    <div style={styles.page}>
      <h1 style={styles.pageTitle}>👤 PROFILE</h1>
      
      <div style={styles.profileGrid}>
        <div style={styles.profileCard}>
          <div style={styles.avatar}>👤</div>
          <h2 style={styles.profileName}>{player.username}</h2>
          <div style={styles.profileStats}>
            <div>🪙 Balance: {player.ac_balance}</div>
            <div>📅 Member since: {new Date(player.created_at).toLocaleDateString()}</div>
            <div>🔥 Streak: {player.daily_streak} days</div>
          </div>
        </div>

        <div style={styles.achievementsCard}>
          <h3 style={styles.sectionTitle}>🏆 ACHIEVEMENTS</h3>
          <div style={styles.achievementsList}>
            {achievements.map(a => (
              <div key={a.id} style={{ ...styles.achievement, opacity: a.unlocked ? 1 : 0.5 }}>
                <span style={styles.achievementIcon}>{a.icon}</span>
                <div>
                  <div style={styles.achievementName}>{a.name}</div>
                  <div style={styles.achievementDesc}>{a.description}</div>
                  {a.unlocked && <div style={styles.unlocked}>✓ Unlocked</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = {
  loading: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0e1a' },
  loadingText: { color: '#ffd700', fontSize: '18px' },
  
  app: { minHeight: '100vh', backgroundColor: '#0a0e1a' },
  
  nav: { backgroundColor: '#111827', borderBottom: '1px solid #374151', padding: '0.75rem 0' },
  navContent: { maxWidth: '1400px', margin: '0 auto', padding: '0 1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' },
  logo: { color: '#ffd700', fontSize: '18px', fontWeight: 'bold' },
  navLinks: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  navBtn: { background: 'none', border: 'none', padding: '0.5rem', cursor: 'pointer', fontSize: '14px' },
  navRight: { display: 'flex', alignItems: 'center', gap: '1rem' },
  ac: { backgroundColor: '#0a0e1a', padding: '0.5rem 1rem', borderRadius: '0.25rem', color: '#ffd700', fontWeight: 'bold' },
  user: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#e5e5e5' },
  logout: { background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: '12px' },
  
  main: { maxWidth: '1400px', margin: '0 auto', padding: '1rem' },
  
  loginPage: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0a0e1a' },
  loginBox: { backgroundColor: '#111827', padding: '2rem', borderRadius: '0.5rem', border: '2px solid #e63946', maxWidth: '350px', width: '100%' },
  loginTitle: { color: '#ffd700', textAlign: 'center', fontSize: '18px', marginBottom: '0.25rem' },
  loginSubtitle: { color: '#9ca3af', textAlign: 'center', fontSize: '12px', marginBottom: '1.5rem' },
  loginForm: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  loginInput: { padding: '0.75rem', backgroundColor: '#0a0e1a', border: '1px solid #374151', borderRadius: '0.25rem', color: '#e5e5e5' },
  loginBtn: { padding: '0.75rem', backgroundColor: '#e63946', color: 'white', border: 'none', borderRadius: '0.25rem', fontWeight: 'bold', cursor: 'pointer' },
  error: { color: '#ef4444', fontSize: '14px' },
  loginSwitch: { textAlign: 'center', marginTop: '1rem', color: '#9ca3af', fontSize: '14px' },
  loginLink: { background: 'none', border: 'none', color: '#ffd700', cursor: 'pointer', textDecoration: 'underline' },
  
  hubGrid: { display: 'grid', gridTemplateColumns: '1fr 350px', gap: '1rem' },
  hubLeft: { display: 'flex', flexDirection: 'column', gap: '1rem' },
  
  card: { backgroundColor: '#111827', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' },
  cardTitle: { color: '#ffd700', fontSize: '14px', marginBottom: '1rem' },
  
  menuGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' },
  menuBtn: { backgroundColor: '#0a0e1a', border: '1px solid #374151', borderRadius: '0.5rem', padding: '1rem', color: '#e5e5e5', cursor: 'pointer', fontSize: '14px', textAlign: 'center' },
  
  missionsList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  missionItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0a0e1a', padding: '0.75rem', borderRadius: '0.25rem' },
  missionDesc: { fontSize: '14px' },
  missionReward: { color: '#ffd700', fontSize: '12px' },
  completed: { color: '#22c55e', fontSize: '14px' },
  claimBtn: { backgroundColor: '#ffd700', color: '#0a0e1a', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', fontWeight: 'bold', fontSize: '12px', cursor: 'pointer', border: 'none' },
  
  leaderboard: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  leaderItem: { display: 'flex', alignItems: 'center', gap: '0.5rem', backgroundColor: '#0a0e1a', padding: '0.5rem', borderRadius: '0.25rem', fontSize: '14px' },
  rank: { color: '#9ca3af', width: '30px' },
  playerName: { flex: 1 },
  playerAc: { color: '#ffd700' },
  
  chatBox: { backgroundColor: '#111827', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151', height: 'fit-content' },
  chatMsgs: { height: '400px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.75rem' },
  chatMsg: { backgroundColor: '#0a0e1a', padding: '0.5rem', borderRadius: '0.25rem', fontSize: '14px' },
  chatUser: { color: '#ffd700', fontWeight: 'bold' },
  chatForm: { display: 'flex', gap: '0.5rem' },
  chatInput: { flex: 1, padding: '0.5rem', backgroundColor: '#0a0e1a', border: '1px solid #374151', borderRadius: '0.25rem', color: '#e5e5e5' },
  chatBtn: { backgroundColor: '#e63946', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', cursor: 'pointer', border: 'none' },
  
  page: { padding: '1rem' },
  pageTitle: { color: '#ffd700', fontSize: '20px', marginBottom: '1rem' },
  
  filters: { display: 'flex', gap: '0.75rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' },
  select: { padding: '0.5rem', backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '0.25rem', color: '#e5e5e5' },
  cardCount: { color: '#9ca3af', fontSize: '14px' },
  
  cardGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: '0.75rem' },
  collectionCard: { backgroundColor: '#111827', padding: '0.75rem', borderRadius: '0.5rem', border: '2px solid', textAlign: 'center' },
  cardBg: { height: '60px', borderRadius: '0.25rem', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.5rem' },
  cardIcon: { fontSize: '28px' },
  cardName: { fontWeight: 'bold', fontSize: '13px', marginBottom: '0.25rem' },
  cardRarity: { fontSize: '11px', textTransform: 'uppercase' },
  cardOwned: { color: '#ffd700', fontSize: '12px', marginTop: '0.25rem' },
  emptyCard: { textAlign: 'center', padding: '3rem', color: '#9ca3af' },
  actionBtn: { marginTop: '1rem', padding: '0.75rem 1.5rem', backgroundColor: '#e63946', color: 'white', border: 'none', borderRadius: '0.25rem', cursor: 'pointer' },
  
  packsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' },
  packCard: { backgroundColor: '#111827', padding: '1.5rem', borderRadius: '0.5rem', border: '2px solid', textAlign: 'center' },
  packEmoji: { fontSize: '48px', marginBottom: '0.5rem' },
  packName: { color: 'white', fontSize: '16px', marginBottom: '0.5rem' },
  packRates: { color: '#9ca3af', fontSize: '12px', marginBottom: '1rem' },
  packBtn: { padding: '0.75rem 2rem', borderRadius: '0.25rem', cursor: 'pointer', border: 'none', fontWeight: 'bold', color: '#0a0e1a' },
  errorBox: { backgroundColor: '#7f1d1d', color: '#fca5a5', padding: '0.75rem', borderRadius: '0.25rem', marginBottom: '1rem' },
  
  modal: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 },
  modalContent: { backgroundColor: '#111827', padding: '2rem', borderRadius: '0.5rem', maxWidth: '700px', width: '100%', position: 'relative' },
  modalTitle: { color: '#ffd700', textAlign: 'center', fontSize: '18px', marginBottom: '1rem' },
  closeBtn: { position: 'absolute', top: '1rem', right: '1rem', background: 'none', border: 'none', color: '#9ca3af', fontSize: '20px', cursor: 'pointer' },
  revealGrid: { display: 'flex', justifyContent: 'center', gap: '1rem', flexWrap: 'wrap' },
  revealCard: { width: '120px', padding: '0.75rem', borderRadius: '0.5rem', border: '2px solid', backgroundColor: '#0a0e1a', textAlign: 'center' },
  revealIcon: { fontSize: '32px', marginBottom: '0.5rem' },
  revealName: { fontWeight: 'bold', fontSize: '12px', marginBottom: '0.25rem' },
  revealRarity: { fontSize: '10px', textTransform: 'uppercase' },
  
  deckBuilder: { display: 'grid', gridTemplateColumns: '280px 1fr', gap: '1rem' },
  deckList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  deckItem: { backgroundColor: '#111827', padding: '0.75rem', borderRadius: '0.5rem', border: '1px solid', cursor: 'pointer' },
  deckName: { fontWeight: 'bold' },
  deckInfo: { color: '#9ca3af', fontSize: '12px' },
  newDeck: { backgroundColor: '#111827', padding: '0.75rem', borderRadius: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  createBtn: { backgroundColor: '#ffd700', color: '#0a0e1a', padding: '0.5rem', borderRadius: '0.25rem', fontWeight: 'bold', cursor: 'pointer', border: 'none' },
  input: { padding: '0.5rem', backgroundColor: '#0a0e1a', border: '1px solid #374151', borderRadius: '0.25rem', color: '#e5e5e5' },
  
  deckEditor: { backgroundColor: '#111827', padding: '1rem', borderRadius: '0.5rem' },
  deckHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  deleteBtn: { backgroundColor: '#dc2626', color: 'white', padding: '0.25rem 0.75rem', borderRadius: '0.25rem', cursor: 'pointer', border: 'none', fontSize: '12px' },
  deckSection: { marginBottom: '1rem' },
  subsectionTitle: { color: '#9ca3af', fontSize: '14px', marginBottom: '0.5rem' },
  cardList: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem', maxHeight: '200px', overflowY: 'auto' },
  inDeckCard: { backgroundColor: '#dc2626', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '12px', cursor: 'pointer' },
  addCard: { backgroundColor: '#0a0e1a', border: '1px solid #374151', padding: '0.25rem 0.5rem', borderRadius: '0.25rem', fontSize: '12px', cursor: 'pointer' },
  noDeck: { textAlign: 'center', color: '#6b7280', padding: '2rem' },
  sectionTitle: { color: '#9ca3af', marginBottom: '0.75rem' },
  
  tabs: { display: 'flex', gap: '1rem', marginBottom: '1rem', borderBottom: '1px solid #374151', paddingBottom: '0.5rem' },
  tab: { background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px' },
  
  auctionsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' },
  auctionCard: { backgroundColor: '#111827', padding: '1rem', borderRadius: '0.5rem', border: '1px solid #374151' },
  auctionName: { fontWeight: 'bold' },
  auctionInfo: { color: '#9ca3af', fontSize: '12px' },
  auctionPrice: { color: '#ffd700', margin: '0.5rem 0' },
  auctionEnds: { color: '#9ca3af', fontSize: '11px', marginBottom: '0.5rem' },
  bidBtn: { width: '100%', backgroundColor: '#ffd700', color: '#0a0e1a', padding: '0.5rem', borderRadius: '0.25rem', fontWeight: 'bold', cursor: 'pointer', border: 'none', marginTop: '0.5rem' },
  
  sellSection: { backgroundColor: '#111827', padding: '1rem', borderRadius: '0.5rem' },
  sellForm: { display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' },
  sellBtn: { backgroundColor: '#22c55e', color: 'white', padding: '0.5rem 1rem', borderRadius: '0.25rem', cursor: 'pointer', border: 'none', fontWeight: 'bold' },
  sellActions: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center', marginTop: '1rem' },
  
  comingSoon: { textAlign: 'center', padding: '3rem', color: '#9ca3af' },
  comingSoonIcon: { fontSize: '48px', marginBottom: '1rem' },
  
  profileGrid: { display: 'grid', gridTemplateColumns: '300px 1fr', gap: '1rem' },
  profileCard: { backgroundColor: '#111827', padding: '1.5rem', borderRadius: '0.5rem', textAlign: 'center' },
  avatar: { fontSize: '64px', marginBottom: '1rem' },
  profileName: { color: '#ffd700', fontSize: '20px', marginBottom: '1rem' },
  profileStats: { textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '14px' },
  achievementsCard: { backgroundColor: '#111827', padding: '1rem', borderRadius: '0.5rem' },
  achievementsList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  achievement: { display: 'flex', gap: '0.75rem', backgroundColor: '#0a0e1a', padding: '0.75rem', borderRadius: '0.25rem' },
  achievementIcon: { fontSize: '24px' },
  achievementName: { fontWeight: 'bold', fontSize: '14px' },
  achievementDesc: { color: '#9ca3af', fontSize: '12px' },
  unlocked: { color: '#22c55e', fontSize: '11px', marginTop: '0.25rem' },
  
  duelArena: { display: 'flex', justifyContent: 'space-around', alignItems: 'center', padding: '2rem' },
  duelPlayer: { textAlign: 'center' },
  vsText: { fontSize: '32px', color: '#ffd700', fontWeight: 'bold' },
  hpBar: { width: '150px', height: '20px', backgroundColor: '#374151', borderRadius: '10px', overflow: 'hidden', margin: '0.5rem auto' },
  hpFill: { height: '100%', backgroundColor: '#22c55e', transition: 'width 0.3s' },
  duelCards: { display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap', marginTop: '2rem' },
  duelCard: { backgroundColor: '#1f2937', border: '2px solid #ffd700', borderRadius: '0.5rem', padding: '1rem', cursor: 'pointer', color: '#fff', fontSize: '14px' },
  duelResult: { textAlign: 'center', padding: '2rem' },
  
  empty: { textAlign: 'center', color: '#6b7280', padding: '2rem' }
}

export default App
