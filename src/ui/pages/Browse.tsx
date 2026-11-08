// Music browser: search, format/channel chips, sortable headers, favorites, LOCAL group, info panel.
import { useState } from 'react'
import { FORMATS } from '../../formats'
import type { Format } from '../../formats'
import { EMPTY_FILTERS, filterEntries, sortEntries } from '../../library/search'
import type { Filters, SortKey } from '../../library/search'
import type { ManifestEntry } from '../../library/manifest'
import { formatRoute } from '../../state/route'
import { usePlayer } from '../../state/PlayerContext'
import { useSettings } from '../../state/SettingsContext'
import type { Settings } from '../../state/settings'
import { DropZone } from '../components/DropZone'
import { formatTime } from '../components/PlayerBar'
import styles from '../ui.module.css'

const COLUMNS: { key: SortKey; label: string; cls: string }[] = [
  { key: 'title', label: 'Title', cls: '' },
  { key: 'format', label: 'Fmt', cls: styles.colFmt ?? '' },
  { key: 'channels', label: 'Ch', cls: styles.colCh ?? '' },
  { key: 'durationSec', label: 'Length', cls: styles.colLen ?? '' },
  { key: 'sizeBytes', label: 'Size', cls: styles.colSize ?? '' },
  { key: 'addedAt', label: 'Added', cls: styles.colAdded ?? '' },
]

const toggle = <T,>(list: readonly T[], v: T): T[] =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

const isLocal = (e: ManifestEntry): boolean => e.id.startsWith('local:')

const PAGE_SIZES = [25, 50, 100] as const

export function Browse() {
  const { entries, manifestError, retryManifest, current, play, favorites, toggleFavorite } =
    usePlayer()
  const { settings, update } = useSettings()
  const [query, setQuery] = useState(EMPTY_FILTERS.query)
  const { sortKey, sortDir, ...chips } = settings.browse
  const filters: Filters = { ...chips, query }
  const sort = { key: sortKey, dir: sortDir }
  const setBrowse = (patch: Partial<Settings['browse']>): void =>
    update((s) => ({ ...s, browse: { ...s.browse, ...patch } }))
  const setFilters = ({ query: q, ...rest }: Filters): void => {
    setQuery(q)
    setBrowse(rest)
  }

  const rows = sortEntries(filterEntries(entries, filters, favorites), sort.key, sort.dir)
  const bundled = rows.filter((e) => !isLocal(e))
  const locals = rows.filter(isLocal)
  // ponytail: page size is session-only; move it into Settings.browse if it should persist
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[0])
  // The page belongs to one filter + sort; any change goes back to page 1 (index 0).
  const listKey = JSON.stringify([filters, sort, pageSize])
  const [paging, setPaging] = useState({ listKey, page: 0 })
  const lastPage = Math.max(0, Math.ceil(bundled.length / pageSize) - 1)
  const page = paging.listKey === listKey ? Math.min(paging.page, lastPage) : 0
  const goTo = (p: number): void => setPaging({ listKey, page: p })
  const channelCounts = [...new Set(entries.map((e) => e.channels))].sort((a, b) => a - b)

  const sortBy = (key: SortKey): void =>
    update((s) => ({
      ...s,
      browse: {
        ...s.browse,
        sortKey: key,
        sortDir: s.browse.sortKey === key && s.browse.sortDir === 'asc' ? 'desc' : 'asc',
      },
    }))

  const row = (e: ManifestEntry) => (
    <tr key={e.id} className={e.id === current?.id ? styles.playing : undefined}>
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
        <a className={styles.link} href={formatRoute({ page: 'play', id: e.id, seek: null })}>
          {e.title}
        </a>
      </td>
      <td className={styles.colFmt}>{e.format.toUpperCase()}</td>
      <td className={styles.colCh}>{e.channels}</td>
      <td className={styles.colLen}>{e.loops ? '--:--' : formatTime(e.durationSec)}</td>
      <td className={styles.colSize}>{Math.ceil(e.sizeBytes / 1024)}K</td>
      <td className={styles.colAdded}>{e.addedAt.slice(0, 10)}</td>
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
              {(query !== '' ||
                chips.formats.length > 0 ||
                chips.channels.length > 0 ||
                chips.favoritesOnly) && (
                <button className={styles.chip} onClick={() => setFilters(EMPTY_FILTERS)}>
                  RESET
                </button>
              )}
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
                <tbody>{bundled.slice(page * pageSize, (page + 1) * pageSize).map(row)}</tbody>
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
            {bundled.length > PAGE_SIZES[0] && (
              <nav className={styles.chips} aria-label="Pages">
                <label>
                  Show{' '}
                  <select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}>
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
                <button className={styles.btn} disabled={page === 0} onClick={() => goTo(0)}>
                  FIRST
                </button>
                <button className={styles.btn} disabled={page === 0} onClick={() => goTo(page - 1)}>
                  PREV
                </button>
                <span className={styles.note} aria-live="polite">
                  {`Page ${page + 1} of ${lastPage + 1}`}
                </span>
                <button
                  className={styles.btn}
                  disabled={page === lastPage}
                  onClick={() => goTo(page + 1)}
                >
                  NEXT
                </button>
                <button
                  className={styles.btn}
                  disabled={page === lastPage}
                  onClick={() => goTo(lastPage)}
                >
                  LAST
                </button>
              </nav>
            )}
          </>
        )}
      </section>
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
