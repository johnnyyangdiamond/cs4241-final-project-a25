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
let balance_collection = null;
let games_collection = null;
let placedBets_collection = null;

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Assign to the module-scoped variable so middleware/routes can use it
    balance_collection = client.db("final_project").collection("balance");
    games_collection = client.db("final_project").collection("games");
    placedBets_collection = client.db("final_project").collection("placedBets");

    if (balance_collection !== null && games_collection !== null && placedBets_collection !== null) {
      console.log("Collections exists");
    }

    // Send a ping to confirm a successful connection
    await client.db("final_project").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

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
  if (balance_collection !== null && games_collection !== null && placedBets_collection !== null){
    next();
  } else {
    res.status(503).send("Not all collections exist");
  }
});



// All of these currently use JSON files in ./data for simplicity
// They should be replaced with db queries
// Also need to add user id to each bet placed after auth is added

// Serve games and placed bets from local JSON files for now
import fs from 'fs/promises'
const DATA_DIR = path.join(__dirname, 'data')

// Cron job to update games every hour
cron.schedule("0 * * * *", async () => {
  console.log("Running sports data sync...")
  await updateGamesFromAPI();
});


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
    // Get bets and map them to existing games
    const bets = await placedBets_collection.aggregate([
      {
        $lookup: {
          from: "games",         // the other collection name
          localField: "gameId",  // field in placedBets
          foreignField: "id",    // matching field in games
          as: "game"
        }
      },
      { $unwind: "$game" },     // flatten the joined array
      { $sort: { id: -1 }}      // sort by id
    ]).toArray();

    res.json(bets);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch placed bets" });
  }
});



app.post('/api/place-bet', async (req, res) => {
  try {
    const { gameId, bet, amount } = req.body
    if (!gameId || !bet || !amount) return res.status(400).json({ error: 'Missing fields' })

    // Validate that the game exists
    const game = await games_collection.findOne({ id: gameId });
    if (!game)
      return res.status(404).json({ error: "Game not found" });

    // Compute next id
    const last = await placedBets_collection.findOne({}, { sort: { id: -1 } });
    const newId = last ? last.id + 1 : 1;

    // Create new bet
    const newBet = {
      id: newId,
      gameId,
      bet,
      amount,
      status: "pending",
      placedAt: new Date().toLocaleString(),
    };

    await placedBets_collection.insertOne(newBet);

    res.json({ ...newBet, game });
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Failed to place bet' })
  }
})


// Balance API --------------------------

app.get("/api/balance", async (req, res) => {
  try {
    const balance = await balance_collection.findOne();
    res.json(balance);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to get balance" });
  }
});

app.post("/api/balance/add", async (req, res) => {
  const { amount } = req.body;
  await balance_collection.updateOne({}, { $inc: { amount } });
  const updated = await balance_collection.findOne();
  res.json(updated);
});

app.post("/api/balance/deduct", async (req, res) => {
  const { amount } = req.body;
  await balance_collection.updateOne({}, { $inc: { amount: -amount } });
  const updated = await balance_collection.findOne();
  res.json(updated);
});








app.get("/api/nba-today", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://v1.basketball.api-sports.io/games?date=${today}`;

  const response = await fetch(url, {
    headers: { "x-apisports-key": API_KEY },
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: `API request failed with status ${response.status}: ${response.statusText}`,
    });
  }

  const data = await response.json();

  // Keep NBA teams only
  const nbaOnly = (data.response || []).filter(
    (g) => NBA_TEAMS.has(g?.teams?.home?.name) && NBA_TEAMS.has(g?.teams?.away?.name)
  );

  res.json(
    nbaOnly.map((game) => ({
      home: game.teams.home.name,
      away: game.teams.away.name,
      status: game.status.short,
      date: game.date,
    }))
  );
});


app.get("/api/nfl-today", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://v1.american-football.api-sports.io/games?date=${today}`;

  const response = await fetch(url, {
    headers: { "x-apisports-key": API_KEY },
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: `API request failed with status ${response.status}: ${response.statusText}`,
    });
  }

  const data = await response.json();
  res.json(
    (data.response || []).map((game) => ({
      home: game.teams?.home?.name,
      away: game.teams?.away?.name,
      status: game.status?.short,
      date: game.date,
    }))
  );
});


app.get("/api/mlb-today", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://v1.baseball.api-sports.io/games?date=${today}`;

  const response = await fetch(url, {
    headers: { "x-apisports-key": API_KEY },
  });

  if (!response.ok) {
    return res.status(response.status).json({
      error: `API request failed with status ${response.status}: ${response.statusText}`,
    });
  }

  const data = await response.json();
  res.json(
    (data.response || []).map((game) => ({
      home: game.teams?.home?.name,
      away: game.teams?.away?.name,
      status: game.status?.short,
      date: game.date,
    }))
  );
});


// Note: server is started after successful DB connection inside run()
