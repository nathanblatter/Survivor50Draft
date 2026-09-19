import { Routes, Route, Link } from 'react-router-dom';
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
import AdminPage from './pages/admin/AdminPage';
import GameStatePage from './pages/GameStatePage';
import RecapPage from './pages/RecapPage';
import HallOfFamePage from './pages/HallOfFamePage';
import BugReport from './components/BugReport';

export default function App() {
  return (
    <div className="app">
      <Navbar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/hall-of-fame" element={<HallOfFamePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />

          <Route path="/:showSlug" element={<ShowPage />} />
          <Route path="/:showSlug/:seasonNum" element={<SeasonPage />} />

          <Route path="/:showSlug/:seasonNum/leagues/:inviteCode" element={<LeagueLayout />}>
            <Route index element={<HomePage />} />
            <Route path="cast" element={<CastPage />} />
            <Route path="draft" element={<DraftPage />} />
            <Route path="scoreboard" element={<ScoreboardPage />} />
            <Route path="gamestate" element={<GameStatePage />} />
            <Route path="recap" element={<RecapPage />} />
            <Route path="team/:id" element={<TeamDetailPage />} />
          </Route>
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <p className="footer-brand">🔥 Survivor Fantasy Draft</p>
          <p className="footer-links">
            <Link to="/survivor" className="footer-link">Seasons</Link>
            <span className="footer-sep">·</span>
            <Link to="/hall-of-fame" className="footer-link">Hall of Fame</Link>
            <span className="footer-sep">·</span>
            <Link to="/login" className="footer-link">Admin</Link>
          </p>
        </div>
      </footer>
      <BugReport />
    </div>
  );
}
