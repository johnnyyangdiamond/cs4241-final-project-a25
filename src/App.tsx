import React, { useEffect, useState } from 'react'
import { useAuth0 } from '@auth0/auth0-react'

type Game = {
    id: number
    sport: string
    homeTeam: string
    awayTeam: string
    time: string
    homeOdds: number
    awayOdds: number
    winner?: 'home' | 'away'
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

    // Helper function to get headers with user ID
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
                    
                    // Fetch balance, games and bets
                    const [balanceRes, gamesRes, betsRes] = await Promise.all([
                        fetch("/api/balance", { headers }),
                        fetch("/api/games"),
                        fetch("/api/placed-bets", { headers }),
                    ])

                    const [balanceJson, gamesJson, betsJson] = await Promise.all([
                        balanceRes.json(),
                        gamesRes.json(),
                        betsRes.json(),
                    ])

                    setBalance(balanceJson)
                    setGames(gamesJson)
                    setPlacedBets(betsJson)
                } catch (err) {
                    console.error('Failed to load data', err)
                } finally {
                    setLoading(false)
                }
            }
            load()
        }
    }, [isAuthenticated, user])

    // Show loading screen while Auth0 is checking authentication
    if (isLoading) {
        return (
            <div className="container py-5 text-center">
                <h2>Loading...</h2>
            </div>
        )
    }

    // Show login screen if not authenticated
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

    // Button to handle money
    const handleAddMoney = async () => {
        const amount = 1000
        const res = await fetch("/api/balance/add", {
          method: "POST",
          headers: getHeaders(),
          body: JSON.stringify({ amount }),
        })
        const updated = await res.json()
        setBalance(updated)
    }

    const handleBet = async (gameId: number, team: BetTeam, odds: number) => {
        const amountStr = window.prompt('Enter wager amount in USD', '100')
        if (!amountStr) return

        const amount = Math.trunc(Number(amountStr))
        if (!amount || amount <= 0) {
            window.alert('Please enter a valid amount')
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
        try {
            const res = await fetch('/api/place-bet', {
                method: 'POST',
                headers: getHeaders(),
                body: JSON.stringify({ gameId, bet: team, amount })
            })
            if (!res.ok) throw new Error('Failed to place bet')
            const placed = await res.json()
            setPlacedBets((s) => [placed, ...s])

            const res2 = await fetch("/api/balance/deduct", {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ amount }),
            })
            const updated = await res2.json()
            setBalance(updated)

            window.alert(`Bet placed on ${team === 'home' ? game.homeTeam : game.awayTeam} for $${amount}`)
        } catch (err) {
            console.error(err)
            window.alert('Failed to place bet')
        }
    }

    const calculatePayout = (odds: number, amount: number) => {
        const o = Math.trunc(odds)
        if (o > 0) return amount + (amount * o) / 100
        return amount + (amount * 100) / Math.abs(o)
    }

    const formatOdds = (o: number) => (o > 0 ? `+${o}` : `${o}`)

    return (
        <div className="container py-5">
            {/* Nav / header */}
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

            {/* Active bets */}
            {placedBets.length > 0 && (
                <section className="mb-5">
                    <h3 className="mb-3">Active bets</h3>
                    <div className="row g-3">
                        {placedBets.map((bet) => (
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
                                            <div className="text-muted">{bet.bet === 'home' ? bet.game.homeTeam : bet.game.awayTeam} {formatOdds(bet.bet === 'home' ? bet.game.homeOdds : bet.game.awayOdds)}</div>
                                        </div>
                                        <div className="text-end">
                                            <div className="small text-muted">Wagered</div>
                                            <div className="h4 mb-1">${bet.amount.toLocaleString()}</div>
                                            {bet.status === 'pending' && <div className="small text-muted">To win: ${calculatePayout(bet.bet === 'home' ? bet.game.homeOdds : bet.game.awayOdds, bet.amount).toFixed(0)}</div>}
                                            {bet.status === 'won' && <div className="text-success small">Won ${calculatePayout(bet.bet === 'home' ? bet.game.homeOdds : bet.game.awayOdds, bet.amount).toFixed(0)}</div>}
                                            {bet.status === 'lost' && <div className="text-danger small">Lost ${bet.amount}</div>}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Header */}
            <header className="text-center mb-5">
                <h1 className="display-5">Place your bets</h1>
                <p className="lead text-muted">Select a team to place your wager</p>
            </header>

            {/* Games list */}
            <div className="mb-5">
                {games.map((game) => (
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
                                    className={`btn w-100 text-start p-3 btn-outline-primary`}
                                    onClick={() => handleBet(game.id, 'away', game.awayOdds)}
                                >
                                    <div className="fw-bold">{game.awayTeam}</div>
                                    <div className="h4 mb-0">{formatOdds(game.awayOdds)}</div>
                                </button>
                            </div>
                            <div className="col-md-6">
                                <button
                                    className={`btn w-100 text-start p-3 btn-outline-primary`}
                                    onClick={() => handleBet(game.id, 'home', game.homeOdds)}
                                >
                                    <div className="fw-bold">{game.homeTeam}</div>
                                    <div className="h4 mb-0">{formatOdds(game.homeOdds)}</div>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}