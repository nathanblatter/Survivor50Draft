import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
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
          <Route path="/" element={<HomePage />} />
          <Route path="/cast" element={<CastPage />} />
          <Route path="/draft" element={<DraftPage />} />
          <Route path="/scoreboard" element={<ScoreboardPage />} />
          <Route path="/gamestate" element={<GameStatePage />} />
          <Route path="/team/:id" element={<TeamDetailPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/admin" element={<AdminPage />} />
        </Routes>
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <p>Survivor 50: In the Hands of the Fans &mdash; Fantasy Draft League</p>
        </div>
      </footer>
    </div>
  );
}
