// Music browser: search, format/channel chips, sortable headers, favorites, LOCAL group, info panel.
import { useState } from 'react'
import { FORMATS } from '../../formats'
import type { Format } from '../../formats'
import { EMPTY_FILTERS, filterEntries, sortEntries } from '../../library/search'
import type { Filters, SortKey } from '../../library/search'
import type { ManifestEntry } from '../../library/manifest'
import { usePlayer } from '../../state/PlayerContext'
import { DropZone } from '../components/DropZone'
import { InfoPanel } from '../components/InfoPanel'
import { formatTime } from '../components/PlayerBar'
import styles from '../ui.module.css'

const COLUMNS: { key: SortKey; label: string; cls: string }[] = [
  { key: 'title', label: 'Title', cls: '' },
  { key: 'format', label: 'Fmt', cls: styles.colFmt ?? '' },
  { key: 'channels', label: 'Ch', cls: styles.colCh ?? '' },
  { key: 'durationSec', label: 'Length', cls: styles.colLen ?? '' },
  { key: 'sizeBytes', label: 'Size', cls: styles.colSize ?? '' },
]

const toggle = <T,>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

const isLocal = (e: ManifestEntry): boolean => e.id.startsWith('local:')

export function Browse() {
  const { entries, manifestError, retryManifest, current, play, favorites, toggleFavorite } =
    usePlayer()
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'title',
    dir: 'asc',
  })
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const rows = sortEntries(filterEntries(entries, filters, favorites), sort.key, sort.dir)
  const bundled = rows.filter((e) => !isLocal(e))
  const locals = rows.filter(isLocal)
  const channelCounts = [...new Set(entries.map((e) => e.channels))].sort((a, b) => a - b)
  const selected = entries.find((e) => e.id === selectedId) ?? null

  const sortBy = (key: SortKey): void =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const row = (e: ManifestEntry) => (
    <tr
      key={e.id}
      className={
        e.id === current?.id ? styles.playing : e.id === selectedId ? styles.selected : undefined
      }
    >
      <th scope="row" className={styles.colPlay}>
        <button
          className={styles.btn}
          aria-label={`Play ${e.title}`}
          onClick={() => void play(e.id)}
        >
          PLAY
        </button>
      </th>
      <td className={styles.colStar}>
        {!isLocal(e) && (
          <button
            className={styles.star}
            aria-label={`${favorites.has(e.id) ? 'Unfavorite' : 'Favorite'} ${e.title}`}
            aria-pressed={favorites.has(e.id)}
            onClick={() => toggleFavorite(e.id)}
          >
            {favorites.has(e.id) ? '★' : '☆'}
          </button>
        )}
      </td>
      <td title={e.file}>
        <button className={styles.link} onClick={() => setSelectedId(e.id)}>
          {e.title}
        </button>
      </td>
      <td className={styles.colFmt}>{e.format.toUpperCase()}</td>
      <td className={styles.colCh}>{e.channels}</td>
      <td className={styles.colLen}>{e.loops ? '--:--' : formatTime(e.durationSec)}</td>
      <td className={styles.colSize}>{Math.ceil(e.sizeBytes / 1024)}K</td>
    </tr>
  )

  return (
    <>
      <DropZone />
      <section className={styles.panel}>
        <h2 className={styles.heading}>BROWSE</h2>
        {manifestError ? (
          <>
            <p className={styles.error}>Could not load the music list: {manifestError.message}</p>
            <button className={styles.btn} onClick={retryManifest}>
              RETRY
            </button>
          </>
        ) : (
          <>
            <input
              className={styles.search}
              type="search"
              placeholder="search title, file, message…"
              aria-label="Search"
              value={filters.query}
              onChange={(e) => setFilters({ ...filters, query: e.target.value })}
            />
            <div className={styles.chips} role="group" aria-label="Filters">
              <Chip
                on={filters.formats.length === 0}
                onClick={() => setFilters({ ...filters, formats: [] })}
              >
                ALL
              </Chip>
              {FORMATS.map((f: Format) => (
                <Chip
                  key={f}
                  on={filters.formats.includes(f)}
                  onClick={() => setFilters({ ...filters, formats: toggle(filters.formats, f) })}
                >
                  {f.toUpperCase()}
                </Chip>
              ))}
              {channelCounts.map((n) => (
                <Chip
                  key={n}
                  on={filters.channels.includes(n)}
                  onClick={() => setFilters({ ...filters, channels: toggle(filters.channels, n) })}
                >
                  {`${n}ch`}
                </Chip>
              ))}
              <Chip
                on={filters.favoritesOnly}
                onClick={() => setFilters({ ...filters, favoritesOnly: !filters.favoritesOnly })}
              >
                ★ only
              </Chip>
            </div>
            {entries.length === 0 ? (
              <p className={styles.note}>Loading…</p>
            ) : rows.length === 0 ? (
              <p className={styles.note}>No songs match.</p>
            ) : (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.colPlay} />
                    <th className={styles.colStar} aria-label="Favorite">
                      ★
                    </th>
                    {COLUMNS.map((c) => (
                      <th
                        key={c.key}
                        className={c.cls}
                        aria-sort={
                          sort.key === c.key
                            ? sort.dir === 'asc'
                              ? 'ascending'
                              : 'descending'
                            : 'none'
                        }
                      >
                        <button className={styles.sort} onClick={() => sortBy(c.key)}>
                          {c.label}
                          {sort.key === c.key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>{bundled.map(row)}</tbody>
                {locals.length > 0 && (
                  <tbody>
                    <tr>
                      <th colSpan={7} className={styles.group}>
                        LOCAL (this session)
                      </th>
                    </tr>
                    {locals.map(row)}
                  </tbody>
                )}
              </table>
            )}
          </>
        )}
      </section>
      {selected && <InfoPanel entry={selected} />}
    </>
  )
}

function Chip(props: { on: boolean; onClick: () => void; children: string }) {
  return (
    <button
      className={`${styles.chip} ${props.on ? styles.chipOn : ''}`}
      aria-pressed={props.on}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  )
}
