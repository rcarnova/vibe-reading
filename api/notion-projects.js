// Server-side proxy for the Notion "Progetti Studio/Venturo" database.
// Keeps the Notion integration token out of the client bundle.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: { message: 'Method not allowed' } })
    return
  }

  const token = process.env.NOTION_TOKEN
  const dbId = process.env.NOTION_PROJECTS_DB_ID
  if (!token || !dbId) {
    res.status(500).json({ error: { message: 'Notion integration not configured' } })
    return
  }

  try {
    const notionRes = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filter: {
          or: [
            { property: 'Status', status: { equals: 'In progress' } },
            { property: 'Status', status: { equals: 'In partenza' } },
          ],
        },
        page_size: 20,
      }),
    })

    if (!notionRes.ok) {
      const err = await notionRes.json().catch(() => ({}))
      res.status(notionRes.status).json({ error: { message: err?.message || 'Notion request failed' } })
      return
    }

    const data = await notionRes.json()
    const projects = (data.results ?? [])
      .map((page) => {
        const props = page.properties
        return {
          name: props['Nome Progetto']?.title?.[0]?.plain_text ?? '',
          tipologia: (props['Tipologia']?.multi_select ?? []).map((t) => t.name),
          fase: props['Fase']?.select?.name ?? null,
          status: props['Status']?.status?.name ?? null,
        }
      })
      .filter((p) => p.name)

    res.status(200).json({ projects })
  } catch (err) {
    res.status(502).json({ error: { message: err.message || 'Upstream request failed' } })
  }
}
