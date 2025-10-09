import express from "express"
import path from "path"
import mime from "mime"
import { fileURLToPath } from "url"
import ViteExpress from "vite-express"
import fetch from "node-fetch";
import cron from "node-cron";
import { MongoClient, ServerApiVersion } from "mongodb";
import dotenv from "dotenv";

dotenv.config();

const app = express()
app.use(express.json()) 

const dir  = "src/",
      port = 3000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_KEY = process.env.API_KEY;

// Mongo DB setup
const uri = `mongodb+srv://${process.env.USERNM}:${process.env.PASS}@${process.env.HOST}/?retryWrites=true&w=majority&appName=sportsCluster`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let users_collection = null;
let games_collection = null;
let placedBets_collection = null;

async function run() {
  try {
    await client.connect();
    
    users_collection = client.db("final_project").collection("users");
    games_collection = client.db("final_project").collection("games");
    placedBets_collection = client.db("final_project").collection("placedBets");

    try {
      await users_collection.createIndex({ userId: 1 }, { unique: true });
      await games_collection.createIndex({ id: 1 }, { unique: true });
      await placedBets_collection.createIndex({ userId: 1 });
      await placedBets_collection.createIndex({ gameId: 1 });
      await placedBets_collection.createIndex({ status: 1 });
    } catch (e) {
      // Indexes might already exist
    }

    if (users_collection !== null && games_collection !== null && placedBets_collection !== null) {
      console.log("Collections exist");
    }

    await client.db("final_project").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    getTodaysGames();
    updateGameResults();

    // Production vs Development server setup
    const PORT = process.env.PORT || 3000;
    
    if (process.env.NODE_ENV === 'production') {
      // Serve static files in production
      app.use(express.static(path.join(__dirname, 'dist')));
      
      // Catch-all route for SPA (must be after API routes)
      app.get('*', (req, res) => {
        res.sendFile(path.join(__dirname, 'dist', 'index.html'));
      });
      
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Production server listening on port ${PORT}`);
      });
    } else {
      // Development with Vite
      ViteExpress.listen(app, PORT, () => {
        console.log(`Development server listening on port ${PORT}`);
      });
    }
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

process.on('SIGINT', async () => {
  console.log('Shutting down gracefully...');
  try {
    await client.close();
    process.exit(0);
  } catch (err) {
    console.error('Error during shutdown:', err);
    process.exit(1);
  }
});

app.use((req, res, next) => {
  if (users_collection !== null && games_collection !== null && placedBets_collection !== null){
    next();
  } else {
    res.status(503).send("Not all collections exist");
  }
});

function getUserId(req) {
  const userId = req.headers['x-user-id'];
  if (!userId || userId === 'anonymous') {
    throw new Error('User not authenticated');
  }
  return userId;
}

// Games API
app.get('/api/games', async (req, res) => {
  try {
    const games = await games_collection.find({}).toArray();
    res.json(games);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch games" });
  }
})

// Bets API
app.get("/api/placed-bets", async (req, res) => {
  try {
    const userId = getUserId(req);
    
    const bets = await placedBets_collection.aggregate([
      { $match: { userId: userId } },
      {
        $lookup: {
          from: "games",
          localField: "gameId",
          foreignField: "id",
          as: "game"
        }
      },
      { $unwind: "$game" },
      { $sort: { id: -1 }}
    ]).toArray();

    res.json(bets);
  } catch (err) {
    console.error(err);
    if (err.message === 'User not authenticated') {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    res.status(500).json({ error: "Failed to fetch placed bets" });
  }
});

app.post('/api/place-bet', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { gameId, bet, amount } = req.body
    
    if (!gameId || !bet || !amount) {
      return res.status(400).json({ error: 'Missing fields' });
    }
    
    if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid bet amount' });
    }

    if (bet !== 'home' && bet !== 'away') {
      return res.status(400).json({ error: 'Invalid bet side' });
    }

    const game = await games_collection.findOne({ id: gameId });
    if (!game) {
      return res.status(404).json({ error: "Game not found" });
    }

    if (game.winner !== undefined || game.status === 'finished') {
      return res.status(400).json({ error: "Cannot bet on finished game" });
    }

    const odds = bet === 'home' ? game.homeOdds : game.awayOdds;
    if (odds === null || odds === undefined) {
      return res.status(400).json({ error: "Odds not available" });
    }

    const balanceUpdate = await users_collection.updateOne(
      { userId: userId, amount: { $gte: amount } },
      { $inc: { amount: -amount } }
    );

    if (balanceUpdate.modifiedCount === 0) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    const last = await placedBets_collection.findOne({}, { sort: { id: -1 } });
    const newId = last ? last.id + 1 : 1;

    const newBet = {
      id: newId,
      userId: userId,
      gameId,
      bet,
      amount,
      status: "pending",
      placedAt: new Date().toLocaleString([], { hour: 'numeric', minute: '2-digit' }),
    };

    await placedBets_collection.insertOne(newBet);

    res.json({ ...newBet, game });
  } catch (err) {
    console.error(err)
    if (err.message === 'User not authenticated') {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    res.status(500).json({ error: 'Failed to place bet' })
  }
})

// Balance API
app.get("/api/balance", async (req, res) => {
  try {
    const userId = getUserId(req);
    
    let user = await users_collection.findOne({ userId: userId });
    
    if (!user) {
      user = {
        userId: userId,
        amount: 10000,
        createdAt: new Date()
      };
      await users_collection.insertOne(user);
    }
    
    res.json(user);
  } catch (err) {
    console.error(err);
    if (err.message === 'User not authenticated') {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    res.status(500).json({ error: "Failed to get balance" });
  }
});

app.post("/api/balance/add", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { amount } = req.body;
    
    if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    await users_collection.updateOne(
      { userId: userId },
      { $inc: { amount } }
    );
    
    const updated = await users_collection.findOne({ userId: userId });
    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.message === 'User not authenticated') {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    res.status(500).json({ error: "Failed to add balance" });
  }
});

app.post("/api/balance/deduct", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { amount } = req.body;
    
    if (typeof amount !== 'number' || amount <= 0 || isNaN(amount)) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    await users_collection.updateOne(
      { userId: userId },
      { $inc: { amount: -amount } }
    );
    
    const updated = await users_collection.findOne({ userId: userId });
    res.json(updated);
  } catch (err) {
    console.error(err);
    if (err.message === 'User not authenticated') {
      return res.status(401).json({ error: 'User not authenticated' });
    }
    res.status(500).json({ error: "Failed to deduct balance" });
  }
});

// Cron jobs
cron.schedule("0 * * * *", async () => {
  try {
    console.log("Running sports data sync...")
    await getTodaysGames();
    await updateGameResults();
  } catch (err) {
    console.error("Error in hourly sync:", err);
  }
});

cron.schedule("*/15 * * * *", async () => {
  try {
    console.log("Checking for finished games...")
    await updateGameResults();
  } catch (err) {
    console.error("Error checking game results:", err);
  }
});

// Helper functions
function parseOdds(value) {
  return value === undefined || value === null ? null : Number(value);
}

function formatGameTime(dateString) {
  if (!dateString) return "TBD";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return "TBD";
    const now = new Date();
    const sameDay =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    const label = sameDay ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
    const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
    return `${label}, ${time}`;
  } catch (err) {
    return "TBD";
  }
}

export async function getTodaysGames() {
  const sports = [
    { sport: "NBA", endpoint: "nba/odds/json/GameOddsByDate" },
    { sport: "NHL", endpoint: "nhl/odds/json/GameOddsByDate" },
    { sport: "MLB", endpoint: "mlb/odds/json/GameOddsByDate" },
  ];

  const today = new Date().toISOString().split("T")[0];

  for (const { sport, endpoint } of sports) {
    const url = `https://api.sportsdata.io/v3/${endpoint}/${today}?key=${API_KEY}`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed ${sport} request: ${response.status}`);
      const data = await response.json();

      for (const game of data) {
        const firstOdds = game.PregameOdds?.[0] || {};

        const formatted = {
          id: game.GlobalGameId,
          sport,
          homeTeam: game.HomeTeamName || game.HomeTeam || "Unknown",
          awayTeam: game.AwayTeamName || game.AwayTeam || "Unknown",
          time: formatGameTime(game.DateTime),
          homeOdds: parseOdds(firstOdds.HomeMoneyLine),
          awayOdds: parseOdds(firstOdds.AwayMoneyLine),
        };

        await games_collection.updateOne(
          { id: Number(game.GlobalGameId), winner: { $exists: false } },
          { $set: formatted },
          { upsert: true }
        );
      }
    } catch (err) {
      console.error(`Error fetching ${sport} games:`, err.message);
    }
  }
}

async function updateGameResults() {
  console.log("Checking game results and updating bets...");
  
  try {
    const pendingGames = await games_collection.find({ winner: { $exists: false } }).toArray();
    
    if (pendingGames.length === 0) {
      console.log("No pending games to check");
      return;
    }

    for (const game of pendingGames) {
      let endpoint = "";
      if (game.sport === "NBA") endpoint = "nba/scores/json/GamesByDate";
      else if (game.sport === "NHL") endpoint = "nhl/scores/json/GamesByDate";
      else if (game.sport === "MLB") endpoint = "mlb/scores/json/GamesByDate";
      else continue;

      const today = new Date().toISOString().split("T")[0];
      const url = `https://api.sportsdata.io/v3/${endpoint}/${today}?key=${API_KEY}`;
      
      try {
        const response = await fetch(url);
        if (!response.ok) continue;
        
        const data = await response.json();
        const apiGame = data.find(g => g.GlobalGameId === game.id);
        if (!apiGame) continue;

        const isFinished = apiGame.Status === "Final" || apiGame.Status === "F";
        
        if (isFinished) {
          let winner = null;
          if (apiGame.HomeScore > apiGame.AwayScore) {
            winner = "home";
          } else if (apiGame.AwayScore > apiGame.HomeScore) {
            winner = "away";
          }

          await games_collection.updateOne(
            { id: game.id },
            { 
              $set: { 
                winner: winner, 
                status: "finished",
                finishedAt: new Date()
              } 
            }
          );

          console.log(`Game ${game.id} finished. Winner: ${winner || "tie"}`);
          await processBetsForGame(game.id, winner);
        }
      } catch (err) {
        console.error(`Error checking game ${game.id}:`, err.message);
      }
    }

    await cleanupOldGames();

  } catch (err) {
    console.error("Error in updateGameResults:", err);
  }
}

async function processBetsForGame(gameId, winner) {
  try {
    const bets = await placedBets_collection.find({ 
      gameId: gameId, 
      status: "pending" 
    }).toArray();

    if (bets.length === 0) return;

    console.log(`Processing ${bets.length} bets for game ${gameId}`);

    for (const bet of bets) {
      let newStatus = "lost";
      let payout = 0;

      if (bet.bet === winner) {
        newStatus = "won";
        
        const game = await games_collection.findOne({ id: gameId });
        if (game) {
          const odds = bet.bet === "home" ? game.homeOdds : game.awayOdds;
          
          if (odds === null || odds === undefined) {
            console.error(`Missing odds for game ${gameId}, returning original bet`);
            payout = bet.amount;
          } else if (odds > 0) {
            payout = bet.amount + (bet.amount * odds) / 100;
          } else {
            payout = bet.amount + (bet.amount * 100) / Math.abs(odds);
          }
          
          await users_collection.updateOne(
            { userId: bet.userId },
            { $inc: { amount: payout } }
          );
          
          console.log(`Bet ${bet.id} won! User ${bet.userId} receives payout: $${payout.toFixed(2)}`);
        }
      } else {
        console.log(`Bet ${bet.id} lost.`);
      }

      await placedBets_collection.updateOne(
        { id: bet.id },
        { $set: { status: newStatus } }
      );
    }
  } catch (err) {
    console.error(`Error processing bets for game ${gameId}:`, err);
  }
}

async function cleanupOldGames() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldGames = await games_collection.find({
      status: "finished",
      finishedAt: { $lt: sevenDaysAgo }
    }).toArray();

    for (const game of oldGames) {
      const hasBets = await placedBets_collection.findOne({ gameId: game.id });
      
      if (!hasBets) {
        await games_collection.deleteOne({ id: game.id });
        console.log(`Deleted old game ${game.id}`);
      }
    }
  } catch (err) {
    console.error("Error cleaning up old games:", err);
  }
}