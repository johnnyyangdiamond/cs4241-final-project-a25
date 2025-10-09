import React from 'react'
import { createRoot } from 'react-dom/client'
import { Auth0Provider } from '@auth0/auth0-react'
import App from './App.tsx'

const root = createRoot(document.getElementById('root'))

root.render(
  <Auth0Provider
    domain="dev-3wlx4av6k6qmpd7i.us.auth0.com"
    clientId="V9b3YAynpSrlZvuF7AIhfaSAQ6pgrX6A"
    authorizationParams={{
      redirect_uri: window.location.origin
    }}
  >
    <App />
  </Auth0Provider>
)