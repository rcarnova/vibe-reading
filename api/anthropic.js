// Server-side proxy for the Anthropic Messages API.
// Keeps ANTHROPIC_API_KEY out of the client bundle — the browser calls this
// endpoint instead of api.anthropic.com directly.

const ALLOWED_MODELS = new Set(['claude-haiku-4-5-20251001', 'claude-sonnet-4-5'])
const MAX_TOKENS_CAP = 3000

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: { message: 'Method not allowed' } })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: { message: 'ANTHROPIC_API_KEY not configured' } })
    return
  }

  const { model, max_tokens, system, messages } = req.body ?? {}

  if (!ALLOWED_MODELS.has(model)) {
    res.status(400).json({ error: { message: 'Unsupported model' } })
    return
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: { message: 'messages is required' } })
    return
  }

  try {
    const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(max_tokens ?? 1000, MAX_TOKENS_CAP),
        system,
        messages,
      }),
    })

    const data = await anthropicRes.json()
    res.status(anthropicRes.status).json(data)
  } catch (err) {
    res.status(502).json({ error: { message: err.message || 'Upstream request failed' } })
  }
}
