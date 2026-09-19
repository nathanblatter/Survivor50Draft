import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { HallOfFameEntry } from '../types';

export default function HallOfFamePage() {
  const [entries, setEntries] = useState<HallOfFameEntry[] | null>(null);

  useEffect(() => {
    api.getHallOfFame().then(setEntries).catch(() => setEntries([]));
  }, []);

  if (!entries) return <div className="loading">Loading...</div>;

  return (
    <div className="hof-page">
      <h1 className="page-title">HALL OF FAME</h1>
      <p className="page-subtitle">Every league champion, immortalized.</p>

      {entries.length === 0 ? (
        <div className="empty-state">No completed seasons yet.</div>
      ) : (
        <div className="hof-list">
          {entries.map(h => (
            <Link key={h.league_id} to={`/${h.show_slug}/${h.season_number}/leagues/${h.invite_code}/recap`} className="hof-row">
              <div className="hof-row-season">
                <div className="hof-row-show">{h.show_name} {h.season_number}</div>
                {h.season_name && <div className="hof-row-subtitle">{h.season_name}</div>}
                <div className="hof-row-league">{h.league_name} · {h.team_count} teams</div>
              </div>
              <div className="hof-row-champ">
                <div className="hof-row-crown">👑</div>
                <div>
                  <div className="hof-row-team">{h.champion.name}</div>
                  <div className="hof-row-owner">{h.champion.owner_name}</div>
                </div>
              </div>
              <div className="hof-row-score">
                <div className="hof-row-points">{h.champion.total_score.toFixed(1)}</div>
                {h.runner_up && <div className="hof-row-margin">+{(h.champion.total_score - h.runner_up.total_score).toFixed(1)} over {h.runner_up.owner_name}</div>}
              </div>
              {h.sole_survivor && (
                <div className="hof-row-survivor" title={`Sole Survivor: ${h.sole_survivor.name}`}>
                  {h.sole_survivor.photo_url && <img src={h.sole_survivor.photo_url} alt={h.sole_survivor.name} />}
                  <span>Sole Survivor<br /><strong>{h.sole_survivor.name}</strong></span>
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
