import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { TribeProvider } from './context/TribeContext';
import App from './App';
import './App.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <TribeProvider>
          <App />
        </TribeProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);
