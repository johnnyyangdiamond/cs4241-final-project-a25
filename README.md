# Final Project

Current Progress:
- Initialized the directories for the project and setup the React + ViteExpress configurations
- Modifed server.improved.js to call the Sports API and get the current NBA, NFL, and MLB teams playing today
- Modified App.jsx to display the current teams playing
- Integrated MongoDB (doesn't do anything with it yet)
- Added UI enabling all required functionality


Things still needed:
- Auth0 integration and login page
- MongoDB database that keeps track of the user's current money, active bets, and previous history of bets such as: what teams competed, how much money you won or lost
- 2 tables in mongodb `Games` and `Placed Bets` that match the format of the JSON files.
- Cronjob in the backend to periodically get data from api and update the database.
    - Get new games
    - Update win/loss status
    - Delete old games
- API endpoints that return the data from mongodb

Temporary JSON-backed API 

- GET /api/games — returns games from data/games.json
- GET /api/placed-bets — returns placed bets from data/placedBets.json (each bet includes its `game` object) -> Need to add userId to this
- POST /api/place-bet { gameId, bet, amount } — appends a new bet to data/placedBets.json and returns the placed bet

