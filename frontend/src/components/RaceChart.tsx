import { useMemo, useRef, useState } from 'react';
import { RecapStanding } from '../types';

/** Validated 6-slot categorical palette for the dark card surface (dataviz validator: all checks pass). */
export const TEAM_COLORS = ['#B8862E', '#1FA3B8', '#E8622C', '#C05CB0', '#6FA33A', '#5A7DE8'];

interface Props {
  standings: RecapStanding[];
  episodes: number[];
  cumulative: Record<number, Record<number, number>>;
  colorFor: (teamId: number) => string;
}

/**
 * Cumulative points per team across episodes. One axis, thin 2px lines, crosshair tooltip
 * listing every series at the hovered episode, legend below, end labels for the top three.
 */
export default function RaceChart({ standings, episodes, cumulative, colorFor }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const W = 760, H = 320;
  const pad = { top: 16, right: 110, bottom: 36, left: 44 };
  const innerW = W - pad.left - pad.right;
  const innerH = H - pad.top - pad.bottom;

  const maxY = useMemo(() => {
    let m = 0;
    for (const t of standings) for (const ep of episodes) m = Math.max(m, cumulative[t.id]?.[ep] ?? 0);
    return Math.ceil(m / 25) * 25 || 25;
  }, [standings, episodes, cumulative]);

  if (episodes.length === 0) return null;

  const x = (i: number) => pad.left + (episodes.length === 1 ? innerW / 2 : (i / (episodes.length - 1)) * innerW);
  const y = (v: number) => pad.top + innerH - (v / maxY) * innerH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(f * maxY));

  const series = standings.map(t => ({
    team: t,
    color: colorFor(t.id),
    points: episodes.map((ep, i) => ({ x: x(i), y: y(cumulative[t.id]?.[ep] ?? 0), v: cumulative[t.id]?.[ep] ?? 0 })),
  }));

  // End labels: top three by final score, nudged apart so they never collide.
  const endLabels = series
    .slice(0, 3)
    .map(s => ({ s, y: s.points[s.points.length - 1].y }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < endLabels.length; i++) {
    if (endLabels[i].y - endLabels[i - 1].y < 14) endLabels[i].y = endLabels[i - 1].y + 14;
  }

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    episodes.forEach((_, i) => { const d = Math.abs(x(i) - px); if (d < bestD) { bestD = d; best = i; } });
    setHoverIdx(best);
  };

  const hovered = hoverIdx !== null ? episodes[hoverIdx] : null;
  const tooltipRows = hoverIdx !== null
    ? [...series].sort((a, b) => b.points[hoverIdx].v - a.points[hoverIdx].v)
    : [];

  return (
    <div className="race-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Cumulative points by team across episodes"
        onPointerMove={onMove}
        onPointerLeave={() => setHoverIdx(null)}
      >
        {ticks.map(t => (
          <g key={t}>
            <line x1={pad.left} x2={pad.left + innerW} y1={y(t)} y2={y(t)} className="rc-grid" />
            <text x={pad.left - 8} y={y(t) + 4} className="rc-axis" textAnchor="end">{t}</text>
          </g>
        ))}
        {episodes.map((ep, i) => (
          <text key={ep} x={x(i)} y={H - 12} className="rc-axis" textAnchor="middle">{i === 0 ? `Ep ${ep}` : ep}</text>
        ))}
        {hoverIdx !== null && (
          <line x1={x(hoverIdx)} x2={x(hoverIdx)} y1={pad.top} y2={pad.top + innerH} className="rc-crosshair" />
        )}
        {series.map(({ team, color, points }, i) => (
          <g key={team.id}>
            <path
              d={points.map((p, j) => `${j === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeWidth={i === 0 ? 3 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              opacity={i === 0 || hoverIdx !== null ? 1 : 0.8}
            />
            {hoverIdx !== null && (
              <circle cx={points[hoverIdx].x} cy={points[hoverIdx].y} r={5} fill={color} stroke="#1a1810" strokeWidth={2} />
            )}
          </g>
        ))}
        {endLabels.map(({ s, y: ly }) => (
          <text key={s.team.id} x={pad.left + innerW + 8} y={ly + 4} className="rc-endlabel">
            {s.team.name.length > 16 ? s.team.name.slice(0, 15) + '…' : s.team.name}
          </text>
        ))}
      </svg>

      {hovered !== null && (
        <div className="rc-tooltip" style={{ left: `${(x(hoverIdx!) / W) * 100}%` }}>
          <div className="rc-tooltip-title">After Episode {hovered}</div>
          {tooltipRows.map(({ team, color, points }) => (
            <div key={team.id} className="rc-tooltip-row">
              <span className="rc-swatch" style={{ background: color }} />
              <strong>{points[hoverIdx!].v.toFixed(1)}</strong>
              <span>{team.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="rc-legend" role="list">
        {series.map(({ team, color }) => (
          <span key={team.id} className="rc-legend-item" role="listitem">
            <span className="rc-legend-line" style={{ background: color }} />
            {team.name}
          </span>
        ))}
      </div>
    </div>
  );
}
