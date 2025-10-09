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

const NBA_TEAMS = new Set([
  "Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls",
  "Cleveland Cavaliers","Dallas Mavericks","Denver Nuggets","Detroit Pistons","Golden State Warriors",
  "Houston Rockets","Indiana Pacers","LA Clippers","Los Angeles Lakers","Memphis Grizzlies",
  "Miami Heat","Milwaukee Bucks","Minnesota Timberwolves","New Orleans Pelicans","New York Knicks",
  "Oklahoma City Thunder","Orlando Magic","Philadelphia 76ers","Phoenix Suns","Portland Trail Blazers",
  "Sacramento Kings","San Antonio Spurs","Toronto Raptors","Utah Jazz","Washington Wizards"
]);

const API_KEY = process.env.API_KEY;


// Mongo DB setup -------------------------

const uri = `mongodb+srv://${process.env.USERNM}:${process.env.PASS}@${process.env.HOST}/?retryWrites=true&w=majority&appName=sportsCluster`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Make collection accessible to middleware/routes
let users_collection = null;
let games_collection = null;
let placedBets_collection = null;

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    
    // Updated collections - now we have users instead of balance
    users_collection = client.db("final_project").collection("users");
    games_collection = client.db("final_project").collection("games");
    placedBets_collection = client.db("final_project").collection("placedBets");

    if (users_collection !== null && games_collection !== null && placedBets_collection !== null) {
      console.log("Collections exist");
    }

    // Send a ping to confirm a successful connection
    await client.db("final_project").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    getTodaysGames();
    updateGameResults(); // Check for any finished games on startup

    // Start the server only after DB is connected
    ViteExpress.listen(app, process.env.PORT || port, () => {
      console.log(`Server listening on port ${process.env.PORT || port}`);
    });
  } catch (err) {
    console.error('Failed to connect to MongoDB', err);
    process.exit(1);
  }
}
run().catch((err) => {
  console.error(err);
  process.exit(1);
});

app.use((req, res, next) => {
  if (users_collection !== null && games_collection !== null && placedBets_collection !== null){
    next();
  } else {
    res.status(503).send("Not all collections exist");
  }
});


// Middleware to extract user ID from Auth0 token
// For now, we'll use a simple approach where the frontend sends the user email
// In a production app, you'd verify the JWT token
function getUserId(req) {
  // Get user ID from header (sent by frontend)
  return req.headers['x-user-id'] || 'anonymous';
}


// Serve games and placed bets
import fs from 'fs/promises'
const DATA_DIR = path.join(__dirname, 'data')



// Games + bets API ------------------------------------

app.get('/api/games', async (req, res) => {
  try {
    const games = await games_collection.find({}).toArray();
    res.json(games);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch games" });
  }
})


app.get("/api/placed-bets", async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Get bets for this specific user and map them to existing games
    const bets = await placedBets_collection.aggregate([
      { $match: { userId: userId } }, // Filter by user
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
    res.status(500).json({ error: "Failed to fetch placed bets" });
  }
});



app.post('/api/place-bet', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { gameId, bet, amount } = req.body
    
    if (!gameId || !bet || !amount) return res.status(400).json({ error: 'Missing fields' })

    // Validate that the game exists
    const game = await games_collection.findOne({ id: gameId });
    if (!game)
      return res.status(404).json({ error: "Game not found" });

    // Compute next id
    const last = await placedBets_collection.findOne({}, { sort: { id: -1 } });
    const newId = last ? last.id + 1 : 1;

    // Create new bet with userId
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
    res.status(500).json({ error: 'Failed to place bet' })
  }
})


// Balance API - now user-specific --------------------------

app.get("/api/balance", async (req, res) => {
  try {
    const userId = getUserId(req);
    
    // Find or create user
    let user = await users_collection.findOne({ userId: userId });
    
    if (!user) {
      // Create new user with starting balance
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
    res.status(500).json({ error: "Failed to get balance" });
  }
});

app.post("/api/balance/add", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { amount } = req.body;
    
    await users_collection.updateOne(
      { userId: userId },
      { $inc: { amount } }
    );
    
    const updated = await users_collection.findOne({ userId: userId });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to add balance" });
  }
});

app.post("/api/balance/deduct", async (req, res) => {
  try {
    const userId = getUserId(req);
    const { amount } = req.body;
    
    await users_collection.updateOne(
      { userId: userId },
      { $inc: { amount: -amount } }
    );
    
    const updated = await users_collection.findOne({ userId: userId });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to deduct balance" });
  }
});


// Sports API ---------------------------------


//Cron job to update games every hour
cron.schedule("0 * * * *", async () => {
  console.log("Running sports data sync...")
  await getTodaysGames();
  await updateGameResults();
});

// Cron job to check game results every 15 minutes
cron.schedule("*/15 * * * *", async () => {
  console.log("Checking for finished games...")
  await updateGameResults();
});


// Make sure no odds are null
function parseOdds(value) {
  return value === undefined || value === null ? null : Number(value);
}

// Format time like "Today, 7:30 PM"
function formatGameTime(dateString) {
  if (!dateString) return "TBD";
  const date = new Date(dateString);
  const now = new Date();
  const sameDay =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();
  const label = sameDay ? "Today" : date.toLocaleDateString("en-US", { weekday: "short" });
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${label}, ${time}`;
}

export async function getTodaysGames() {
  const sports = [
    { sport: "NBA", endpoint: "nba/odds/json/GameOddsByDate" },
    { sport: "NHL", endpoint: "nhl/odds/json/GameOddsByDate" },
    { sport: "MLB", endpoint: "mlb/odds/json/GameOddsByDate" },
  ];

  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD

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

        const result = await games_collection.updateOne(
          { id: Number(game.GlobalGameId) },
          { $set: formatted },
          { upsert: true }
        );

        if (result.upsertedCount > 0) console.log("Inserted new game");
        else if (result.modifiedCount > 0) console.log("Updated existing game");
      }
    } catch (err) {
      console.error(`Error fetching ${sport} games:`, err.message);
    }
  }
}


// New function to update game results and process bets
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
            { $set: { winner: winner, status: "finished" } }
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


// Process all bets for a finished game
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
          
          if (odds > 0) {
            payout = bet.amount + (bet.amount * odds) / 100;
          } else {
            payout = bet.amount + (bet.amount * 100) / Math.abs(odds);
          }
          
          // Add winnings to the user's balance
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


// Delete old finished games (older than 7 days) unless someone bet on them
async function cleanupOldGames() {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const oldGames = await games_collection.find({
      status: "finished"
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


// Note: server is started after successful DB connection inside run()