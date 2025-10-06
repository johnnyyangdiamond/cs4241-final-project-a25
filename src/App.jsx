import React, { useEffect, useState } from 'react'

function App(){

  const [nba, setNba] = useState([])
  const [nfl, setNfl] = useState([])
  const [mlb, setMlb] = useState([])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const loadAll = async () => {
      try {
        const [nbaRes, nflRes, mlbRes] = await Promise.all([
          fetch('/api/nba-today'),
          fetch('/api/nfl-today'),
          fetch('/api/mlb-today'),
        ])
        if (!nbaRes.ok || !nflRes.ok || !mlbRes.ok) {
          throw new Error(`Failed: ${[nbaRes.status, nflRes.status, mlbRes.status].join(', ')}`)
        }
        const [nbaJson, nflJson, mlbJson] = await Promise.all([
          nbaRes.json(),
          nflRes.json(),
          mlbRes.json(),
        ])
        setNba(nbaJson || [])
        setNfl(nflJson || [])
        setMlb(mlbJson || [])
      } catch (e) {
        setError(e.message || 'Failed to load games')
      } finally {
        setLoading(false)
      }
    }
    loadAll()
  }, [])

  const renderList = (title, list) => (
    <section style={{ marginTop: 24 }}>
      <h2>{title}</h2>
      {loading && <p>Loading games...</p>}
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
      {!loading && !error && (
        list.length === 0 ? (
          <p>No games today.</p>
        ) : (
          <ul>
            {list.map((g, idx) => (
              <li key={`${title}-${idx}`}>
                {g?.away || 'TBD'} at {g?.home || 'TBD'}  — {g?.status || 'Scheduled'}
              </li>
            ))}
          </ul>
        )
      )}
    </section>
  )

  return (
    <div>
      {renderList('NBA Today', nba)}
      {renderList('NFL Today', nfl)}
      {renderList('MLB Today', mlb)}
    </div>
  )
}

export default App