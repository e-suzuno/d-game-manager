import './StatsBar.css'

export interface Stat {
  label: string
  value: string | number
  unit: string
}

/** 統計バー: 総ゲーム数 / 総容量 / お気に入り / 未整理（全ゲーム基準で算出した値を受け取る） */
export function StatsBar({ stats }: { stats: Stat[] }) {
  return (
    <div className="stats-bar">
      {stats.map((s) => (
        <div key={s.label} className="stats-bar__item">
          <span className="stats-bar__label">{s.label}</span>
          <span className="stats-bar__value">
            <span className="stats-bar__number">{s.value}</span>
            <span className="stats-bar__unit">{s.unit}</span>
          </span>
        </div>
      ))}
    </div>
  )
}
