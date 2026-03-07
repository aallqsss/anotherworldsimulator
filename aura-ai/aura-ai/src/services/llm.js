const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `Sei Aura AI, un assistente AI avanzato e amichevole. 
Rispondi in modo chiaro, conciso e utile. 
Se non sai qualcosa, sii onesto e ammetterlo.`;

export async function generateResponse(messages, onChunk, onComplete) {
  const conversation = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...messages.map(m => ({ role: m.role, content: m.content }))
  ];
  
  if (OPENAI_API_KEY && !OPENAI_API_KEY.includes('your-')) {
    return generateOpenAIResponse(conversation, onChunk, onComplete);
  }
  
  return generateMockResponse(messages, onChunk, onComplete);
}

async function generateOpenAIResponse(conversation, onChunk, onComplete) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: conversation,
        stream: true
      })
    });
    
    if (!response.ok) {
      throw new Error('OpenAI API error');
    }
    
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullResponse = '';
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.trim() !== '');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;
          
          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullResponse += content;
              if (onChunk) onChunk(content);
            }
          } catch (e) {}
        }
      }
    }
    
    if (onComplete) onComplete();
    return fullResponse;
  } catch (error) {
    console.error('OpenAI error:', error);
    return generateMockResponse([], onChunk, onComplete);
  }
}

function generateMockResponse(messages, onChunk, onComplete) {
  return new Promise((resolve) => {
    const lastMessage = messages[messages.length - 1]?.content || '';
    const responses = [
      `Ho ricevuto il tuo messaggio: "${lastMessage.slice(0, 50)}...". Come posso aiutarti?`,
      `Interessante! Mi hai chiesto qualcosa riguardo a "${lastMessage.slice(0, 30)}". Puoi darmi più dettagli?`,
      `Grazie per il messaggio! Sono Aura AI, qui per assisterti. Cosa vorresti sapere?`,
      `Ho capito! Parlami di più su ciò che ti interessa.`,
      `Perfetto! Sono qui per aiutarti. Qual è la tua domanda?`
    ];
    
    const response = responses[Math.floor(Math.random() * responses.length)];
    const chunks = response.split('');
    let index = 0;
    
    const interval = setInterval(() => {
      if (index < chunks.length) {
        if (onChunk) onChunk(chunks[index]);
        index++;
      } else {
        clearInterval(interval);
        if (onComplete) onComplete();
        resolve(response);
      }
    }, 30);
  });
}
