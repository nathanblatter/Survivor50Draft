import { useEffect, useState } from 'react';
import { api } from '../api';
import { Player } from '../types';
import { useTribes } from '../context/TribeContext';
import { useAppContext } from '../context/AppContext';

interface Idol {
  id: number;
  player_id: number;
  player_name: string;
  tribe: string;
  label: string;
  found_episode: number | null;
  played_episode: number | null;
  is_active: boolean;
  notes: string | null;
}

interface Advantage {
  id: number;
  player_id: number;
  player_name: string;
  tribe: string;
  advantage_type: string;
  found_episode: number | null;
  played_episode: number | null;
  is_active: boolean;
  notes: string | null;
}

interface AllianceMember {
  id: number;
  name: string;
  tribe: string;
  is_eliminated: boolean;
}

interface Alliance {
  id: number;
  name: string;
  formed_episode: number | null;
  is_active: boolean;
  notes: string | null;
  members: AllianceMember[] | null;
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

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
    // These still use legacy endpoints which work fine
    api.getIdols().then(setIdols).catch(console.error);
    api.getAdvantages().then(setAdvantages).catch(console.error);
    api.getAlliances().then(setAlliances).catch(console.error);
    if (season) {
      api.getSeasonPlayers(season.id).then(setPlayers).catch(console.error);
    } else {
      api.getPlayers().then(setPlayers).catch(console.error);
    }
  }, [season]);

  const activeIdols = idols.filter(i => i.is_active);
  const playedIdols = idols.filter(i => !i.is_active);
  const activeAdvantages = advantages.filter(a => a.is_active);
  const playedAdvantages = advantages.filter(a => !a.is_active);
  const activeAlliances = alliances.filter(a => a.is_active);
  const dissolvedAlliances = alliances.filter(a => !a.is_active);

  const hasContent = idols.length > 0 || advantages.length > 0 || alliances.length > 0;

  // Build a map of player -> alliances for the network viz
  const playerAllianceMap = new Map<number, string[]>();
  activeAlliances.forEach(a => {
    (a.members || []).forEach(m => {
      const existing = playerAllianceMap.get(m.id) || [];
      existing.push(a.name);
      playerAllianceMap.set(m.id, existing);
    });
  });

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

      {/* ── IDOLS ── */}
      {idols.length > 0 && (
        <section className="gs-section">
          <h2 className="gs-section-title">
            <span className="gs-section-icon">🗿</span>
            Hidden Immunity Idols
            {activeIdols.length > 0 && <span className="gs-count">{activeIdols.length} in play</span>}
          </h2>

          {activeIdols.length > 0 && (
            <div className="gs-idol-grid">
              {activeIdols.map(idol => {
                const photo = getPhoto(idol.player_id);
                return (
                  <div key={idol.id} className="gs-idol-card" style={{ '--tc': getTribeColor(idol.tribe) } as React.CSSProperties}>
                    <div className="gs-idol-glow" />
                    <div className="gs-idol-photo">
                      {photo ? (
                        <img src={photo} alt={idol.player_name} />
                      ) : (
                        <span className="gs-idol-initials">{getInitials(idol.player_name)}</span>
                      )}
                      <div className="gs-idol-badge">🗿</div>
                    </div>
                    <div className="gs-idol-player">{idol.player_name}</div>
                    <div className="gs-idol-tribe" style={{ color: getTribeColor(idol.tribe) }}>{idol.tribe}</div>
                    <div className="gs-idol-label">{idol.label}</div>
                    {idol.found_episode && <div className="gs-idol-ep">Found Ep. {idol.found_episode}</div>}
                    {idol.notes && <div className="gs-idol-notes">{idol.notes}</div>}
                    <div className="gs-idol-status active">In Pocket</div>
                  </div>
                );
              })}
            </div>
          )}

          {playedIdols.length > 0 && (
            <div className="gs-played-section">
              <h3 className="gs-played-title">Played Idols</h3>
              <div className="gs-played-list">
                {playedIdols.map(idol => {
                  const photo = getPhoto(idol.player_id);
                  return (
                    <div key={idol.id} className="gs-played-item">
                      {photo ? <img src={photo} alt={idol.player_name} className="gs-played-photo" /> : <span className="gs-played-icon">🗿</span>}
                      <span className="gs-played-name">{idol.player_name}</span>
                      <span className="gs-played-detail">played {idol.label} in Ep. {idol.played_episode}</span>
                      {idol.notes && <span className="gs-played-notes">{idol.notes}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── ADVANTAGES ── */}
      {advantages.length > 0 && (
        <section className="gs-section">
          <h2 className="gs-section-title">
            <span className="gs-section-icon">⚡</span>
            Advantages
            {activeAdvantages.length > 0 && <span className="gs-count">{activeAdvantages.length} in play</span>}
          </h2>

          {activeAdvantages.length > 0 && (
            <div className="gs-advantage-grid">
              {activeAdvantages.map(adv => {
                const photo = getPhoto(adv.player_id);
                return (
                  <div key={adv.id} className="gs-advantage-card" style={{ '--tc': getTribeColor(adv.tribe) } as React.CSSProperties}>
                    <div className="gs-advantage-top">
                      <div className="gs-advantage-photo">
                        {photo ? (
                          <img src={photo} alt={adv.player_name} />
                        ) : (
                          <span className="gs-advantage-initials">{getInitials(adv.player_name)}</span>
                        )}
                      </div>
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
                );
              })}
            </div>
          )}

          {playedAdvantages.length > 0 && (
            <div className="gs-played-section">
              <h3 className="gs-played-title">Used Advantages</h3>
              <div className="gs-played-list">
                {playedAdvantages.map(adv => {
                  const photo = getPhoto(adv.player_id);
                  return (
                    <div key={adv.id} className="gs-played-item">
                      {photo ? <img src={photo} alt={adv.player_name} className="gs-played-photo" /> : <span className="gs-played-icon">⚡</span>}
                      <span className="gs-played-name">{adv.player_name}</span>
                      <span className="gs-played-detail">used {adv.advantage_type} in Ep. {adv.played_episode}</span>
                      {adv.notes && <span className="gs-played-notes">{adv.notes}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── ALLIANCES ── */}
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
                      {alliance.formed_episode && (
                        <div className="gs-alliance-ep">Est. Ep. {alliance.formed_episode}</div>
                      )}
                    </div>
                    {alliance.notes && <div className="gs-alliance-notes">{alliance.notes}</div>}
                    <div className="gs-alliance-members">
                      {activeMembers.map(m => {
                        const photo = getPhoto(m.id);
                        return (
                          <div key={m.id} className="gs-alliance-member" style={{ '--tc': getTribeColor(m.tribe) } as React.CSSProperties}>
                            <div className="gs-member-avatar" style={{ borderColor: getTribeColor(m.tribe) }}>
                              {photo ? (
                                <img src={photo} alt={m.name} />
                              ) : (
                                <span style={{ background: getTribeColor(m.tribe), width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                                  {getInitials(m.name)}
                                </span>
                              )}
                            </div>
                            <div className="gs-member-name">{m.name}</div>
                            <div className="gs-member-tribe" style={{ color: getTribeColor(m.tribe) }}>{m.tribe}</div>
                            {(playerAllianceMap.get(m.id)?.length || 0) > 1 && (
                              <div className="gs-member-multi" title={`Also in: ${playerAllianceMap.get(m.id)!.filter(n => n !== alliance.name).join(', ')}`}>
                                +{(playerAllianceMap.get(m.id)!.length) - 1}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {eliminatedMembers.map(m => {
                        const photo = getPhoto(m.id);
                        return (
                          <div key={m.id} className="gs-alliance-member eliminated">
                            <div className="gs-member-avatar" style={{ borderColor: '#555' }}>
                              {photo ? (
                                <img src={photo} alt={m.name} />
                              ) : (
                                <span style={{ background: '#555', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}>
                                  {getInitials(m.name)}
                                </span>
                              )}
                            </div>
                            <div className="gs-member-name">{m.name}</div>
                            <div className="gs-member-tribe">Voted Out</div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="gs-alliance-strength">
                      <div className="gs-strength-bar">
                        <div className="gs-strength-fill" style={{ width: `${(activeMembers.length / members.length) * 100}%` }} />
                      </div>
                      <span className="gs-strength-label">{activeMembers.length}/{members.length} active</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Alliance web - show connections between players */}
          {activeAlliances.length > 1 && (
            <div className="gs-web-section">
              <h3 className="gs-played-title">Alliance Web</h3>
              <div className="gs-web">
                {Array.from(playerAllianceMap.entries())
                  .filter(([, alliances]) => alliances.length > 1)
                  .map(([playerId, allianceNames]) => {
                    const player = players.find(p => p.id === playerId);
                    if (!player || player.is_eliminated) return null;
                    return (
                      <div key={playerId} className="gs-web-node">
                        <div className="gs-web-player" style={{ borderColor: getTribeColor(player.tribe) }}>
                          {player.photo_url && (
                            <img src={player.photo_url} alt={player.name} className="gs-web-photo" />
                          )}
                          <span>{player.nickname || player.name.split(' ')[0]}</span>
                        </div>
                        <div className="gs-web-connections">
                          {allianceNames.map(name => (
                            <span key={name} className="gs-web-tag">{name}</span>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
              {Array.from(playerAllianceMap.entries()).filter(([, a]) => a.length > 1).length === 0 && (
                <p className="gs-web-empty">No players are in multiple alliances yet.</p>
              )}
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
                    <span className="gs-played-detail">
                      {(a.members || []).map(m => m.name).join(', ')}
                    </span>
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
