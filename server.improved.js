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

    // Initial data load
    await getTodaysGames();
    await updateGameResults();

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

// Admin endpoint to clean up old games manually
app.post('/api/admin/cleanup-old-games', async (req, res) => {
  try {
    console.log("Manual cleanup triggered...");
    
    // Find all games older than 2 days that don't have a winner
    const twoDaysAgo = new Date(Date.now() - 172800000);
    
    const oldGames = await games_collection.find({
      winner: { $exists: false },
      status: { $ne: "finished" }
    }).toArray();
    
    let cleaned = 0;
    let updated = 0;
    
    for (const game of oldGames) {
      // Parse the game date
      const gameDate = new Date(game.time);
      
      // If game is more than 2 days old and still pending, mark it as finished
      if (isNaN(gameDate.getTime()) || gameDate < twoDaysAgo) {
        // Check if there are any bets on this game
        const betsCount = await placedBets_collection.countDocuments({ gameId: game.id });
        
        if (betsCount === 0) {
          // No bets, just delete the game
          await games_collection.deleteOne({ id: game.id });
          cleaned++;
          console.log(`Deleted old game ${game.id} with no bets`);
        } else {
          // Has bets, mark as finished (canceled/void)
          await games_collection.updateOne(
            { id: game.id },
            { 
              $set: { 
                status: "finished",
                winner: null,
                finishedAt: new Date(),
                note: "Auto-canceled - old game"
              }
            }
          );
          
          // Refund all pending bets on this game
          const pendingBets = await placedBets_collection.find({
            gameId: game.id,
            status: "pending"
          }).toArray();
          
          for (const bet of pendingBets) {
            await users_collection.updateOne(
              { userId: bet.userId },
              { $inc: { amount: bet.amount } }
            );
            
            await placedBets_collection.updateOne(
              { id: bet.id },
              { $set: { status: "refunded", processedAt: new Date() } }
            );
          }
          
          updated++;
          console.log(`Canceled old game ${game.id} and refunded ${pendingBets.length} bets`);
        }
      }
    }
    
    res.json({ 
      success: true, 
      message: `Cleaned up ${cleaned} old games, canceled ${updated} games with bets` 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to cleanup old games' });
  }
});

// Games API - only return games that haven't finished
app.get('/api/games', async (req, res) => {
  try {
    // Only return games that are not finished and are from last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const games = await games_collection.find({
      winner: { $exists: false },
      status: { $ne: "finished" }
    }).toArray();
    
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

    // Check if game is already finished
    if (game.winner !== undefined || game.status === 'finished') {
      return res.status(400).json({ error: "Cannot bet on finished game" });
    }
    
    // Check if game is too old (more than 1 day in the past)
    const oneDayAgo = new Date(Date.now() - 86400000);
    const gameTime = new Date(game.time);
    if (!isNaN(gameTime.getTime()) && gameTime < oneDayAgo) {
      return res.status(400).json({ error: "Cannot bet on games that have already started or are too old" });
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

// Cron jobs - every 15 minutes and hourly
cron.schedule("0 * * * *", async () => {
  try {
    console.log("Running hourly sports data sync...")
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
          id: Number(game.GlobalGameId),
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
  
  if (!API_KEY) {
    console.error("ERROR: API_KEY is not set! Check your .env file");
    return;
  }
  
  try {
    const pendingGames = await games_collection.find({ 
      winner: { $exists: false },
      status: { $ne: "finished" }
    }).toArray();
    
    if (pendingGames.length === 0) {
      console.log("No pending games to check");
      return;
    }

    console.log(`Checking ${pendingGames.length} pending games...`);

    for (const game of pendingGames) {
      // Use ODDS endpoint instead of SCORES endpoint (free tier compatible)
      let endpoint = "";
      if (game.sport === "NBA") endpoint = "nba/odds/json/GameOddsByDate";
      else if (game.sport === "NHL") endpoint = "nhl/odds/json/GameOddsByDate";
      else if (game.sport === "MLB") endpoint = "mlb/odds/json/GameOddsByDate";
      else {
        console.log(`Unknown sport for game ${game.id}: ${game.sport}`);
        continue;
      }

      // Check today, yesterday, and 2 days ago to catch all games
      const dates = [
        new Date().toISOString().split("T")[0],
        new Date(Date.now() - 86400000).toISOString().split("T")[0], // yesterday
        new Date(Date.now() - 172800000).toISOString().split("T")[0] // 2 days ago
      ];

      let apiGame = null;
      
      for (const date of dates) {
        const url = `https://api.sportsdata.io/v3/${endpoint}/${date}?key=${API_KEY}`;
        
        try {
          const response = await fetch(url);
          if (!response.ok) {
            console.log(`API error for ${game.sport} on ${date}: ${response.status}`);
            continue;
          }
          
          const data = await response.json();
          apiGame = data.find(g => Number(g.GlobalGameId) === Number(game.id));
          
          if (apiGame) {
            console.log(`Found game ${game.id} in ${date} data - Status: ${apiGame.Status}`);
            break;
          }
        } catch (err) {
          console.error(`Error fetching ${game.sport} for ${date}:`, err.message);
        }
      }

      if (!apiGame) {
        console.log(`Game ${game.id} not found in API results`);
        continue;
      }

      // Check if game is finished - Odds API uses Status field
      const isFinished = apiGame.Status && (
        apiGame.Status.toLowerCase().includes("final") || 
        apiGame.Status.toLowerCase() === "f" ||
        apiGame.Status.toLowerCase().includes("f/ot") ||
        apiGame.Status.toLowerCase() === "closed"
      );
      
      if (isFinished) {
        let winner = null;
        const homeScore = Number(apiGame.HomeTeamScore || 0);
        const awayScore = Number(apiGame.AwayTeamScore || 0);
        
        console.log(`Game ${game.id}: ${game.awayTeam} ${awayScore} @ ${game.homeTeam} ${homeScore} - Status: ${apiGame.Status}`);
        
        if (homeScore > awayScore) {
          winner = "home";
        } else if (awayScore > homeScore) {
          winner = "away";
        } else {
          console.log(`Game ${game.id} ended in a tie`);
          winner = null;
        }

        // Update game with atomic operation to prevent race conditions
        const updateResult = await games_collection.updateOne(
          { id: Number(game.id), winner: { $exists: false } },
          { 
            $set: { 
              winner: winner, 
              status: "finished",
              finishedAt: new Date(),
              finalHomeScore: homeScore,
              finalAwayScore: awayScore
            } 
          }
        );

        if (updateResult.modifiedCount > 0) {
          console.log(`✅ Game ${game.id} marked as finished. Winner: ${winner || "tie"}`);
          // Process bets immediately after marking game as finished
          await processBetsForGame(game.id, winner);
        } else {
          console.log(`Game ${game.id} was already processed`);
        }
      } else {
        console.log(`Game ${game.id} status: ${apiGame.Status} (not finished yet)`);
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
      gameId: Number(gameId), 
      status: "pending" 
    }).toArray();

    if (bets.length === 0) {
      console.log(`No pending bets found for game ${gameId}`);
      return;
    }

    console.log(`Processing ${bets.length} bets for game ${gameId}, winner: ${winner || 'tie'}`);

    const game = await games_collection.findOne({ id: Number(gameId) });
    if (!game) {
      console.error(`Game ${gameId} not found when processing bets!`);
      return;
    }

    for (const bet of bets) {
      let newStatus = "lost";
      let payout = 0;

      // Handle tie/push - return original bet amount
      if (winner === null) {
        newStatus = "pending"; // Keep as pending for tie games
        payout = bet.amount;
        
        await users_collection.updateOne(
          { userId: bet.userId },
          { $inc: { amount: payout } }
        );
        
        console.log(`Bet ${bet.id} pushed (tie). User ${bet.userId} refunded: $${payout.toFixed(2)}`);
      } 
      // Handle win
      else if (bet.bet === winner) {
        newStatus = "won";
        
        const odds = bet.bet === "home" ? game.homeOdds : game.awayOdds;
        
        if (odds === null || odds === undefined) {
          console.error(`Missing odds for game ${gameId}, returning original bet`);
          payout = bet.amount;
        } else {
          const oddsNum = Number(odds);
          if (oddsNum > 0) {
            // Positive odds: bet $100 to win $odds
            payout = bet.amount + (bet.amount * oddsNum) / 100;
          } else {
            // Negative odds: bet $|odds| to win $100
            payout = bet.amount + (bet.amount * 100) / Math.abs(oddsNum);
          }
        }
        
        await users_collection.updateOne(
          { userId: bet.userId },
          { $inc: { amount: payout } }
        );
        
        console.log(`Bet ${bet.id} WON! User ${bet.userId} receives payout: $${payout.toFixed(2)}`);
      } 
      // Handle loss
      else {
        console.log(`Bet ${bet.id} LOST. User ${bet.userId} loses $${bet.amount}`);
      }

      // Update bet status with atomic operation
      const updateResult = await placedBets_collection.updateOne(
        { id: bet.id, status: "pending" },
        { 
          $set: { 
            status: newStatus,
            processedAt: new Date(),
            payout: payout
          } 
        }
      );

      if (updateResult.modifiedCount === 0) {
        console.log(`Bet ${bet.id} was already processed`);
      }
    }
    
    console.log(`Finished processing ${bets.length} bets for game ${gameId}`);
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