import React, { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

type Game = {
    id: number
    sport: string
    homeTeam: string
    awayTeam: string
    time: string
    homeOdds: number | null
    awayOdds: number | null
    winner?: 'home' | 'away' | null
    status?: string
}

type PlacedBet = {
    id: number
    game: Game
    bet: 'home' | 'away'
    amount: number
    status: 'pending' | 'won' | 'lost'
    placedAt: string
}

type Balance = {
    _id?: string
    userId: string
    amount: number
}

type BetTeam = 'home' | 'away'

export default function App() {
    const { loginWithRedirect, logout, user, isAuthenticated, isLoading } = useAuth0()
    
    const [balance, setBalance] = useState<Balance | null>(null)
    const [placedBets, setPlacedBets] = useState<PlacedBet[]>([])
    const [games, setGames] = useState<Game[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const getHeaders = () => {
        return {
            'Content-Type': 'application/json',
            'x-user-id': user?.email || user?.sub || 'anonymous'
        }
    }

    useEffect(() => {
        if (isAuthenticated && user) {
            const load = async () => {
                try {
                    const headers = getHeaders()
                    
                    const [balanceRes, gamesRes, betsRes] = await Promise.all([
                        fetch("/api/balance", { headers }),
                        fetch("/api/games"),
                        fetch("/api/placed-bets", { headers }),
                    ])

                    if (!balanceRes.ok || !gamesRes.ok || !betsRes.ok) {
                        throw new Error('Failed to load data')
                    }

                    const [balanceJson, gamesJson, betsJson] = await Promise.all([
                        balanceRes.json(),
                        gamesRes.json(),
                        betsRes.json(),
                    ])

                    setBalance(balanceJson)
                    setGames(gamesJson)
                    setPlacedBets(betsJson)
                    setError(null)
                } catch (err) {
                    console.error('Failed to load data', err)
                    setError('Failed to load data. Please refresh the page.')
                } finally {
                    setLoading(false)
                }
            }
            load()
        }
    }, [isAuthenticated, user])

    const handleAddMoney = async () => {
        try {
            const amount = 1000
            const res = await fetch("/api/balance/add", {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ amount }),
            })
            
            if (!res.ok) throw new Error('Failed to add money')
            
            const updated = await res.json()
            setBalance(updated)
        } catch (err) {
            console.error('Failed to add money:', err)
            window.alert('Failed to add money. Please try again.')
        }
    }

    const handleBet = async (gameId: number, team: BetTeam, odds: number | null) => {
        if (odds === null || odds === undefined) {
            window.alert('Odds are not available for this game yet')
            return
        }

        const amountStr = window.prompt('Enter wager amount in USD', '100')
        if (!amountStr) return

        const amount = Math.trunc(Number(amountStr))
        
        if (isNaN(amount) || amount <= 0) {
            window.alert('Please enter a valid positive number')
            return
        }
        
        if (!balance || amount > balance.amount) {
            window.alert('Insufficient balance')
            return
        }
        
        const game = games.find((g) => g.id === gameId)
        if (!game) {
            window.alert('Game not found')
            return
        }

        if (game.winner !== undefined || game.status === 'finished') {
            window.alert('Cannot bet on a finished game')
            return
        }
        
        try {
            const res = await fetch('/api/place-bet', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ gameId, bet: team, amount })
            })
            
            if (!res.ok) {
                const errorData = await res.json()
                throw new Error(errorData.error || 'Failed to place bet')
            }
            
            const placed = await res.json()
            setPlacedBets((s) => [placed, ...s])

            const balanceRes = await fetch("/api/balance", { headers: getHeaders() })
            const updatedBalance = await balanceRes.json()
            setBalance(updatedBalance)

            window.alert(`Bet placed on ${team === 'home' ? game.homeTeam : game.awayTeam} for $${amount}`)
        } catch (err: any) {
            console.error(err)
            window.alert(err.message || 'Failed to place bet')
        }
    }

    const calculatePayout = (odds: number | null, amount: number) => {
        if (odds === null || odds === undefined) return amount
        
        const o = Math.trunc(odds)
        if (o > 0) return amount + (amount * o) / 100
        return amount + (amount * 100) / Math.abs(o)
    }

    const formatOdds = (o: number | null) => {
        if (o === null || o === undefined) return 'N/A'
        return o > 0 ? `+${o}` : `${o}`
    }

    if (isLoading) {
        return (
            <div className="container py-5 text-center">
                <h2>Loading...</h2>
            </div>
        )
    }

    if (!isAuthenticated) {
        return (
            <div className="container py-5">
                <div className="row justify-content-center">
                    <div className="col-md-6 text-center">
                        <h1 className="display-4 mb-4">Webware Betting</h1>
                        <p className="lead mb-4">Welcome to the sports betting platform</p>
                        <p className="text-muted mb-4">Sign in to place bets on NBA, NHL, and MLB games</p>
                        <button 
                            className="btn btn-primary btn-lg"
                            onClick={() => loginWithRedirect()}
                        >
                            Sign In / Sign Up
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    const availableGames = games.filter(g => !g.winner && g.status !== 'finished')

    return (
        <div className="container py-5">
            {error && (
                <div className="alert alert-danger alert-dismissible fade show" role="alert">
                    {error}
                    <button type="button" className="btn-close" onClick={() => setError(null)}></button>
                </div>
            )}

            <div className="d-flex justify-content-between align-items-center mb-4">
                <h2 className="h3">Webware Betting</h2>
                <div className="d-flex align-items-center gap-3">
                    <div className="text-end">
                        <div className="small text-muted">Welcome, {user?.name || user?.email}</div>
                        <button 
                            className="btn btn-sm btn-link p-0"
                            onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
                        >
                            Logout
                        </button>
                    </div>
                    <div className="text-end border rounded p-3">
                        <div className="small text-muted">Balance</div>
                        <div className="h4 mb-0">
                            {loading ? "Loading..." : `$${balance?.amount?.toLocaleString()}`}
                        </div>
                    </div>
                    <button className="btn btn-primary btn-lg rounded-circle" onClick={handleAddMoney} title="Add money">+</button>
                </div>
            </div>

            {placedBets.length > 0 && (
                <section className="mb-5">
                    <h3 className="mb-3">Active bets</h3>
                    <div className="row g-3">
                        {placedBets.map((bet) => {
                            const odds = bet.bet === 'home' ? bet.game.homeOdds : bet.game.awayOdds
                            return (
                                <div key={bet.id} className="col-12">
                                    <div className="card shadow-sm">
                                        <div className="card-body d-flex justify-content-between align-items-center">
                                            <div>
                                                <div className="small text-muted mb-1">
                                                    {bet.game.sport} • {bet.placedAt}{' '}
                                                    {bet.status === 'pending' && <span className="badge bg-warning text-dark ms-2">Pending</span>}
                                                    {bet.status === 'won' && <span className="badge bg-success ms-2">Won</span>}
                                                    {bet.status === 'lost' && <span className="badge bg-danger ms-2">Lost</span>}
                                                </div>
                                                <h5 className="card-title mb-1">{bet.game.awayTeam} vs {bet.game.homeTeam}</h5>
                                                <div className="text-muted">{bet.bet === 'home' ? bet.game.homeTeam : bet.game.awayTeam} {formatOdds(odds)}</div>
                                            </div>
                                            <div className="text-end">
                                                <div className="small text-muted">Wagered</div>
                                                <div className="h4 mb-1">${bet.amount.toLocaleString()}</div>
                                                {bet.status === 'pending' && odds && <div className="small text-muted">To win: ${calculatePayout(odds, bet.amount).toFixed(0)}</div>}
                                                {bet.status === 'won' && odds && <div className="text-success small">Won ${calculatePayout(odds, bet.amount).toFixed(0)}</div>}
                                                {bet.status === 'lost' && <div className="text-danger small">Lost ${bet.amount}</div>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </section>
            )}

            <header className="text-center mb-5">
                <h1 className="display-5">Place your bets</h1>
                <p className="lead text-muted">Select a team to place your wager</p>
            </header>

            <div className="mb-5">
                {loading ? (
                    <div className="text-center py-5">
                        <div className="spinner-border" role="status">
                            <span className="visually-hidden">Loading...</span>
                        </div>
                    </div>
                ) : availableGames.length === 0 ? (
                    <div className="text-center py-5">
                        <p className="text-muted">No games available at the moment. Check back later!</p>
                    </div>
                ) : (
                    availableGames.map((game) => (
                        <div key={game.id} className="border-bottom pb-4 mb-4">
                            <div className="d-flex justify-content-between align-items-start mb-3">
                                <div>
                                    <div className="small text-muted">{game.sport} • {game.time}</div>
                                    <h4 className="mb-0">{game.awayTeam} vs {game.homeTeam}</h4>
                                </div>
                            </div>

                            <div className="row g-3">
                                <div className="col-md-6">
                                    <button
                                        className="btn w-100 text-start p-3 btn-outline-primary"
                                        onClick={() => handleBet(game.id, 'away', game.awayOdds)}
                                        disabled={game.awayOdds === null || game.awayOdds === undefined}
                                    >
                                        <div className="fw-bold">{game.awayTeam}</div>
                                        <div className="h4 mb-0">{formatOdds(game.awayOdds)}</div>
                                    </button>
                                </div>
                                <div className="col-md-6">
                                    <button
                                        className="btn w-100 text-start p-3 btn-outline-primary"
                                        onClick={() => handleBet(game.id, 'home', game.homeOdds)}
                                        disabled={game.homeOdds === null || game.homeOdds === undefined}
                                    >
                                        <div className="fw-bold">{game.homeTeam}</div>
                                        <div className="h4 mb-0">{formatOdds(game.homeOdds)}</div>
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    )
}