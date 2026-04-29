import { useMemo, useState } from 'react';

export default function ChartsPanel({ inventory, trades }) {
  const [hovered, setHovered] = useState(null);

  const stats = useMemo(() => {
    const accepted = trades.filter(t => t.status === 'accepted').length;
    const completed = trades.filter(t => t.status === 'completed').length;
    const declined = trades.filter(t => t.status === 'declined').length;
    const tradedItems = trades.reduce((sum, trade) => sum + (trade.fromItems?.length || 0) + (trade.toItems?.length || 0), 0);

    return {
      inventoryCount: inventory.length,
      tradedItems,
      accepted,
      completed,
      declined
    };
  }, [inventory, trades]);

  const linePoints = [
    { label: 'Inventory', value: stats.inventoryCount },
    { label: 'Traded', value: stats.tradedItems }
  ];

  const max = Math.max(1, ...linePoints.map(point => point.value));
  const p1 = `35,${130 - (linePoints[0].value / max) * 90}`;
  const p2 = `215,${130 - (linePoints[1].value / max) * 90}`;

  const pie = [
    { key: 'accepted', label: 'Accepted', value: stats.accepted, className: 'pie-accepted' },
    { key: 'completed', label: 'Completed', value: stats.completed, className: 'pie-completed' },
    { key: 'declined', label: 'Declined', value: stats.declined, className: 'pie-declined' }
  ];

  const total = Math.max(1, pie.reduce((sum, item) => sum + item.value, 0));
  let cumulative = 0;

  return (
    <aside className="charts-panel">
      <div className="card chart-card">
        <h3>Inventory vs Traded Items</h3>
        <svg className="line-chart" viewBox="0 0 250 150">
          <line x1="30" y1="130" x2="230" y2="130" />
          <line x1="30" y1="20" x2="30" y2="130" />
          <polyline points={`${p1} ${p2}`} />
          <circle cx="35" cy={p1.split(',')[1]} r="5" />
          <circle cx="215" cy={p2.split(',')[1]} r="5" />
          <text x="15" y="145">Inventory: {stats.inventoryCount}</text>
          <text x="145" y="145">Traded: {stats.tradedItems}</text>
        </svg>
      </div>

      <div className="card chart-card">
        <h3>Trade Status</h3>

        <div className="pie-wrap">
          <svg className="pie-chart" viewBox="0 0 42 42">
            {pie.map(item => {
              const portion = item.value / total;
              const dash = `${portion * 100} ${100 - portion * 100}`;
              const offset = 25 - cumulative * 100;
              cumulative += portion;
              const isHovered = hovered === item.key;
              const isDimmed = hovered && hovered !== item.key;

              return (
                <circle
                  key={item.key}
                  className={`pie-slice ${item.className} ${isHovered ? 'hovered' : ''} ${isDimmed ? 'dimmed' : ''}`}
                  cx="21"
                  cy="21"
                  r="15.915"
                  strokeDasharray={dash}
                  strokeDashoffset={offset}
                  onMouseEnter={() => setHovered(item.key)}
                  onMouseLeave={() => setHovered(null)}
                />
              );
            })}
          </svg>

          <div className="pie-center">
            <strong>{hovered ? pie.find(item => item.key === hovered)?.value : total}</strong>
            <span>{hovered ? pie.find(item => item.key === hovered)?.label : 'Total'}</span>
          </div>
        </div>

        <div className="chart-legend">
          {pie.map(item => (
            <span key={item.key}>{item.label}: {item.value}</span>
          ))}
        </div>
      </div>
    </aside>
  );
}
