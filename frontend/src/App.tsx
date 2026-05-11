import { Routes, Route, Navigate } from 'react-router-dom';
import Navbar from './components/Navbar';
import LandingPage from './pages/LandingPage';
import ShowPage from './pages/ShowPage';
import SeasonPage from './pages/SeasonPage';
import LeagueLayout from './pages/LeagueLayout';
import HomePage from './pages/HomePage';
import CastPage from './pages/CastPage';
import ScoreboardPage from './pages/ScoreboardPage';
import TeamDetailPage from './pages/TeamDetailPage';
import LoginPage from './pages/LoginPage';
import DraftPage from './pages/DraftPage';
import AdminPage from './pages/AdminPage';
import GameStatePage from './pages/GameStatePage';

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main-content">
        <Routes>
          {/* Landing / Browse */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/:showSlug" element={<ShowPage />} />
          <Route path="/:showSlug/:seasonNum" element={<SeasonPage />} />

          {/* League-scoped pages */}
          <Route path="/:showSlug/:seasonNum/leagues/:inviteCode" element={<LeagueLayout />}>
            <Route index element={<HomePage />} />
            <Route path="cast" element={<CastPage />} />
            <Route path="draft" element={<DraftPage />} />
            <Route path="scoreboard" element={<ScoreboardPage />} />
            <Route path="gamestate" element={<GameStatePage />} />
            <Route path="team/:id" element={<TeamDetailPage />} />
          </Route>

          {/* Global */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />

          {/* Backward compat redirects */}
          <Route path="/cast" element={<Navigate to="/survivor/50/leagues/og-league/cast" replace />} />
          <Route path="/draft" element={<Navigate to="/survivor/50/leagues/og-league/draft" replace />} />
          <Route path="/scoreboard" element={<Navigate to="/survivor/50/leagues/og-league/scoreboard" replace />} />
          <Route path="/gamestate" element={<Navigate to="/survivor/50/leagues/og-league/gamestate" replace />} />
          <Route path="/team/:id" element={<Navigate to="/survivor/50/leagues/og-league" replace />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <p>Fantasy Draft League</p>
        </div>
      </footer>
    </div>
  );
}
