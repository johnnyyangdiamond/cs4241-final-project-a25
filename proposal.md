
# Proposal

Team members: John Diamond, Aanan Goyal, Aarogya Rijal, Theo Sawyers


We propose to design and implement a simplified sports betting application similar to DraftKings, but in a scaled-down and educational form. The primary goal of this project is to allow users to experience the mechanics of sports betting without the risks of real money. Instead of wagering actual currency, users will be provided with a set amount of virtual funds that they can use to place bets on real sporting events.

The application will include user authentication and persistence so that players can log in, manage their accounts, and track their virtual balance across multiple sessions. Users will have the ability to browse NBA, NFL, and potentially other leagues, select teams, and place wagers on the outcomes of matches (win/loss). Once a game concludes, bets will be evaluated, and the user’s balance will be adjusted accordingly: doubling their wager amount for a win or losing the full amount on a loss.

The app will source live sports data from [API Sports](https://api-sports.io/), a reliable provider of team statistics, match schedules, and results.


# Tech Stack

### Frontend + Backend: ViteExpress

We will use ViteExpress
, which combines the Vite development server (for React) and an Express backend into a single runtime.

This allows us to:



- Create seamless integration between API routes and frontend React components.

- Express routes will handle user actions such as placing bets, retrieving balances, and resolving outcomes.
- Vite provides a fast build tool and development environment

### Frontend Framework: React 
- The UI will be built with React, providing a responsive and dynamic user experience.
- Vite will power hot reloading and optimized builds for fast iteration.

### Database: MongoDB
- We will use MongoDB as our database for persistence.
It will store user accounts and virtual balances so that data persists across multiple sessions.

