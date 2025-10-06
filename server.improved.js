import express from "express"
import path from "path"
import mime from "mime"
import { fileURLToPath } from "url"
import ViteExpress from "vite-express"
import fetch from "node-fetch";


const dir  = "src/",
      port = 3000

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

const NBA_TEAMS = new Set([
  "Atlanta Hawks","Boston Celtics","Brooklyn Nets","Charlotte Hornets","Chicago Bulls",
  "Cleveland Cavaliers","Dallas Mavericks","Denver Nuggets","Detroit Pistons","Golden State Warriors",
  "Houston Rockets","Indiana Pacers","LA Clippers","Los Angeles Lakers","Memphis Grizzlies",
  "Miami Heat","Milwaukee Bucks","Minnesota Timberwolves","New Orleans Pelicans","New York Knicks",
  "Oklahoma City Thunder","Orlando Magic","Philadelphia 76ers","Phoenix Suns","Portland Trail Blazers",
  "Sacramento Kings","San Antonio Spurs","Toronto Raptors","Utah Jazz","Washington Wizards"
]);


app.use(express.json()) 

const API_KEY = "";

app.get("/api/nba-today", async (req, res) => {
  const today = new Date().toISOString().split("T")[0];
  const url = `https://v1.basketball.api-sports.io/games?date=${today}`;

  const response = await fetch(url, {
    headers: { "x-apisports-key": API_KEY },
  });

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
