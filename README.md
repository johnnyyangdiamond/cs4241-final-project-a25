# Sports Betting Platform

## Project Description

We built a sports betting web application that allows users to place virtual bets on real NBA, NHL, and MLB games. Users start with $10,000 in virtual currency and can wager on the game outcomes. The platform tracks active bets, calculates payouts based on odds, and automatically updates balances when games conclude. We integrated Auth0 for user authentication, MongoDB for data persistence, and the SportsData.io API for live game data and odds.

**Live Application:** https://sports-betting-app-bip3.onrender.com

## Instructions for Use

Simply visit the live application link and click "Sign In / Sign Up" to authenticate via Auth0. You can use any email/password combination to create an account or sign in with Github. Browse available games, click on a team to place a bet, and enter your wager amount. You can add more funds anytime using the "+" button next to your balance.

## Technologies Used

**Frontend:** React + Vite + Bootstrap
**Backend:** Node.js + Express
**Database:** MongoDB stores users, games, placedBets.

**External API and Automation:** Hourly updates from SportsData.io API provides real-time game schedules, odds, and final scores for NBA, NHL, and MLB games.

## Challenges Faced

- All of us were working on the frontend and the backend at the same time creating confusions and inconsistensies around structuring different data in the database, API requests and the frontend. To solve this problem, we used a central json file as an example for everyone to work off of.
- Implementing cron jobs was challenging due to Render’s free tier pausing inactive processes. Addressed this by adding robust error handling, using MongoDB’s atomic operations to prevent race conditions, and optimizing cron schedules to balance API limits with timely game and bet updates.



## Team Responsibilities

- Aarogya: Developed the frontend completely, designed database schema.
- Aanan: Auth0 integration, cron jobs for game updates and bet processing, Render Deployment, backend API development.
- John: Integrated backend with MongoDB as well as API calls to sportsdata.io
- Theo: Auth0 integration and cron jobs


## Accessibility Features

We implemented several accessibility features to ensure the application is usable by everyone. All interactive elements (buttons, form inputs) have proper focus states. We used semantic HTML throughout with proper heading hierarchy and ARIA labels where needed. Color contrast meets WCAG AA standards, with bet status indicators using both color and text labels (won/lost/pending) so colorblind users can distinguish between states. Error messages are displayed prominently with clear text rather than relying solely on color. The responsive Bootstrap layout ensures the app works well on different screen sizes and with browser zoom levels.
