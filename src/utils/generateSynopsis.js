async function generateSynopsis(title, author, genre) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': import.meta.env.VITE_ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 200,
      system: 'Rispondi sempre e solo in italiano.',
      messages: [{
        role: 'user',
        content: `Scrivi una sinossi concisa di 2-3 frasi in italiano per il libro '${title}' di ${author}. Genere: ${genre}. IMPORTANTE: Rispondi ESCLUSIVAMENTE in italiano, indipendentemente dalla lingua del titolo o dell'autore. Sii informativo e coinvolgente. Niente spoiler. Non iniziare con il titolo o il nome dell'autore.`,
      }],
    }),
  })
  const data = await response.json()
  return data.content[0].text
}

export default generateSynopsis
