# Final Project

Current Progress:
- Initialized the directories for the project and setup the React + ViteExpress configurations
- Modifed server.improved.js to call the Sports API and get the current NBA, NFL, and MLB teams playing today
- Modified App.jsx to display the current teams playing
- Integrated MongoDB (doesn't do anything with it yet)
- Added UI enabling all required functionality
- MongoDB database that keeps track of the user's current money, active bets, and previous history of bets such as: what teams competed, how much money you won or lost
- 2 tables in mongodb `Games` and `Placed Bets` that match the format of the JSON files.


Things still needed:
- Auth0 integration and login page

- Cronjob in the backend to periodically get data from api and update the database.
    - Get new games
    - Update win/loss status
    - Add money to balance if win
    - Delete old games (if current time > time of game. However, if the user bet on the game, keep the game)


