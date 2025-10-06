import express from "express"
import path from "path"
import mime from "mime"
import { fileURLToPath } from "url"
import ViteExpress from "vite-express"
import fetch from "node-fetch";
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

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const collection = client.db("a3-database").collection("a3-collection");

    if(collection !== null){
      console.log("Collection exists");
    }

    // Send a ping to confirm a successful connection
    await client.db("a3-database").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);

app.use((req, res, next) => {
  if (collection !== null){
    next();
  } else {
    res.status(503).send("Collection does not exists");
  }
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


// Serve the production build in production
// Let ViteExpress handle serving the client in dev (Vite) and prod (dist)
ViteExpress.listen(app, process.env.PORT || port, () => {
  console.log(`Server listening on port ${process.env.PORT || port}`)
})
