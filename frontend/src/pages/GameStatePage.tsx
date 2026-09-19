import { useEffect, useState } from 'react';
import { api } from '../api';
import { Player, Idol, Advantage, Alliance } from '../types';
import { useTribes } from '../context/TribeContext';
import { useAppContext } from '../context/AppContext';
import { getInitials } from '../components/PlayerCard';

export default function GameStatePage() {
  const { season } = useAppContext();
  const [idols, setIdols] = useState<Idol[]>([]);
  const [advantages, setAdvantages] = useState<Advantage[]>([]);
  const [alliances, setAlliances] = useState<Alliance[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const { getTribeColor } = useTribes();

  const getPlayer = (id: number) => players.find(p => p.id === id);
  const getPhoto = (id: number) => getPlayer(id)?.photo_url || null;

  useEffect(() => {
    if (!season) return;
    api.getIdols(season.id).then(setIdols).catch(console.error);
    api.getAdvantages(season.id).then(setAdvantages).catch(console.error);
    api.getAlliances(season.id).then(setAlliances).catch(console.error);
    api.getSeasonPlayers(season.id).then(setPlayers).catch(console.error);
  }, [season]);

  const activeIdols = idols.filter(i => i.is_active);
  const playedIdols = idols.filter(i => !i.is_active);
  const activeAdvantages = advantages.filter(a => a.is_active);
  const playedAdvantages = advantages.filter(a => !a.is_active);
  const activeAlliances = alliances.filter(a => a.is_active);
  const dissolvedAlliances = alliances.filter(a => !a.is_active);
  const hasContent = idols.length > 0 || advantages.length > 0 || alliances.length > 0;

  const playerAllianceMap = new Map<number, string[]>();
  activeAlliances.forEach(a => {
    (a.members || []).forEach(m => {
      const existing = playerAllianceMap.get(m.id) || [];
      existing.push(a.name);
      playerAllianceMap.set(m.id, existing);
    });
  });

  const Avatar = ({ id, name, size = 'md' }: { id: number; name: string; size?: 'sm' | 'md' }) => {
    const photo = getPhoto(id);
    return photo
      ? <img src={photo} alt={name} className={size === 'sm' ? 'gs-played-photo' : undefined} />
      : <span className={size === 'sm' ? 'gs-played-icon' : 'gs-idol-initials'}>{getInitials(name)}</span>;
  };

  return (
    <div className="gamestate-page">
      <h1 className="page-title">GAME STATE</h1>
      <p className="page-subtitle">Idols, advantages, and alliances currently in play</p>

      {!hasContent && (
        <div className="gs-empty">
          <div className="gs-empty-icon">🏝️</div>
          <p>No idols, advantages, or alliances have been tracked yet.</p>
          <p className="gs-empty-sub">Check back after the game heats up!</p>
        </div>
      )}

      {idols.length > 0 && (
        <section className="gs-section">
          <h2 className="gs-section-title">
            <span className="gs-section-icon">🗿</span>
            Hidden Immunity Idols
            {activeIdols.length > 0 && <span className="gs-count">{activeIdols.length} in play</span>}
          </h2>
          {activeIdols.length > 0 && (
            <div className="gs-idol-grid">
              {activeIdols.map(idol => (
                <div key={idol.id} className="gs-idol-card" style={{ '--tc': getTribeColor(idol.tribe) } as React.CSSProperties}>
                  <div className="gs-idol-glow" />
                  <div className="gs-idol-photo">
                    <Avatar id={idol.player_id} name={idol.player_name} />
                    <div className="gs-idol-badge">🗿</div>
                  </div>
                  <div className="gs-idol-player">{idol.player_name}</div>
                  <div className="gs-idol-tribe" style={{ color: getTribeColor(idol.tribe) }}>{idol.tribe}</div>
                  <div className="gs-idol-label">{idol.label}</div>
                  {idol.found_episode && <div className="gs-idol-ep">Found Ep. {idol.found_episode}</div>}
                  {idol.notes && <div className="gs-idol-notes">{idol.notes}</div>}
                  <div className="gs-idol-status active">In Pocket</div>
                </div>
              ))}
            </div>
          )}
          {playedIdols.length > 0 && (
            <div className="gs-played-section">
              <h3 className="gs-played-title">Played Idols</h3>
              <div className="gs-played-list">
                {playedIdols.map(idol => (
                  <div key={idol.id} className="gs-played-item">
                    <Avatar id={idol.player_id} name={idol.player_name} size="sm" />
                    <span className="gs-played-name">{idol.player_name}</span>
                    <span className="gs-played-detail">played {idol.label}{idol.played_episode ? ` in Ep. ${idol.played_episode}` : ''}</span>
                    {idol.notes && <span className="gs-played-notes">{idol.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {advantages.length > 0 && (
        <section className="gs-section">
          <h2 className="gs-section-title">
            <span className="gs-section-icon">⚡</span>
            Advantages
            {activeAdvantages.length > 0 && <span className="gs-count">{activeAdvantages.length} in play</span>}
          </h2>
          {activeAdvantages.length > 0 && (
            <div className="gs-advantage-grid">
              {activeAdvantages.map(adv => (
                <div key={adv.id} className="gs-advantage-card" style={{ '--tc': getTribeColor(adv.tribe) } as React.CSSProperties}>
                  <div className="gs-advantage-top">
                    <div className="gs-advantage-photo"><Avatar id={adv.player_id} name={adv.player_name} /></div>
                    <div className="gs-advantage-info">
                      <div className="gs-advantage-type">{adv.advantage_type}</div>
                      <div className="gs-advantage-player">{adv.player_name}</div>
                      <div className="gs-advantage-tribe" style={{ color: getTribeColor(adv.tribe) }}>{adv.tribe}</div>
                    </div>
                  </div>
                  {adv.found_episode && <div className="gs-advantage-ep">Found Ep. {adv.found_episode}</div>}
                  {adv.notes && <div className="gs-advantage-notes">{adv.notes}</div>}
                  <div className="gs-idol-status active">Held</div>
                </div>
              ))}
            </div>
          )}
          {playedAdvantages.length > 0 && (
            <div className="gs-played-section">
              <h3 className="gs-played-title">Used Advantages</h3>
              <div className="gs-played-list">
                {playedAdvantages.map(adv => (
                  <div key={adv.id} className="gs-played-item">
                    <Avatar id={adv.player_id} name={adv.player_name} size="sm" />
                    <span className="gs-played-name">{adv.player_name}</span>
                    <span className="gs-played-detail">used {adv.advantage_type}{adv.played_episode ? ` in Ep. ${adv.played_episode}` : ''}</span>
                    {adv.notes && <span className="gs-played-notes">{adv.notes}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {alliances.length > 0 && (
        <section className="gs-section">
          <h2 className="gs-section-title">
            <span className="gs-section-icon">🤝</span>
            Alliances
            {activeAlliances.length > 0 && <span className="gs-count">{activeAlliances.length} active</span>}
          </h2>
          {activeAlliances.length > 0 && (
            <div className="gs-alliance-grid">
              {activeAlliances.map(alliance => {
                const members = alliance.members || [];
                const activeMembers = members.filter(m => !m.is_eliminated);
                const eliminatedMembers = members.filter(m => m.is_eliminated);
                return (
                  <div key={alliance.id} className="gs-alliance-card">
                    <div className="gs-alliance-header">
                      <div className="gs-alliance-name">{alliance.name}</div>
                      {alliance.formed_episode && <div className="gs-alliance-ep">Est. Ep. {alliance.formed_episode}</div>}
                    </div>
                    {alliance.notes && <div className="gs-alliance-notes">{alliance.notes}</div>}
                    <div className="gs-alliance-members">
                      {[...activeMembers, ...eliminatedMembers].map(m => {
                        const color = m.is_eliminated ? '#555' : getTribeColor(m.tribe);
                        const photo = getPhoto(m.id);
                        return (
                          <div key={m.id} className={`gs-alliance-member ${m.is_eliminated ? 'eliminated' : ''}`} style={{ '--tc': color } as React.CSSProperties}>
                            <div className="gs-member-avatar" style={{ borderColor: color }}>
                              {photo ? <img src={photo} alt={m.name} /> : <span className="gs-member-initials" style={{ background: color }}>{getInitials(m.name)}</span>}
                            </div>
                            <div className="gs-member-name">{m.name}</div>
                            <div className="gs-member-tribe" style={{ color: m.is_eliminated ? undefined : color }}>{m.is_eliminated ? 'Voted Out' : m.tribe}</div>
                            {!m.is_eliminated && (playerAllianceMap.get(m.id)?.length || 0) > 1 && (
                              <div className="gs-member-multi" title={`Also in: ${playerAllianceMap.get(m.id)!.filter(n => n !== alliance.name).join(', ')}`}>
                                +{playerAllianceMap.get(m.id)!.length - 1}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="gs-alliance-strength">
                      <div className="gs-strength-bar">
                        <div className="gs-strength-fill" style={{ width: `${members.length ? (activeMembers.length / members.length) * 100 : 0}%` }} />
                      </div>
                      <span className="gs-strength-label">{activeMembers.length}/{members.length} active</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {dissolvedAlliances.length > 0 && (
            <div className="gs-played-section">
              <h3 className="gs-played-title">Dissolved Alliances</h3>
              <div className="gs-played-list">
                {dissolvedAlliances.map(a => (
                  <div key={a.id} className="gs-played-item">
                    <span className="gs-played-icon">💔</span>
                    <span className="gs-played-name">{a.name}</span>
                    <span className="gs-played-detail">{(a.members || []).map(m => m.name).join(', ')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
