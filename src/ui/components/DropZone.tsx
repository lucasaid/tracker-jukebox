// Window-wide drag & drop target (decision 37). Nothing is uploaded: files are read locally.
import { useEffect, useRef, useState } from 'react'
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'
import { showToast } from './Toast'

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false

/** onPlay: called with the first dropped song once it plays (the view page opens it). */
export function DropZone(props: { onPlay?: (id: string) => void }) {
  const player = usePlayer()
  const [over, setOver] = useState(false)
  // The listeners live for the whole mount (re-adding them each render would reset `depth`
  // mid-drag and flicker the overlay), so they reach the latest player through a ref.
  const api = useRef({ ...player, onPlay: props.onPlay })
  useEffect(() => {
    api.current = { ...player, onPlay: props.onPlay }
  })

  useEffect(() => {
    let depth = 0
    const onEnter = (e: DragEvent): void => {
      e.preventDefault()
      depth++
      setOver(true)
    }
    const onOver = (e: DragEvent): void => e.preventDefault()
    const onLeave = (): void => {
      depth = Math.max(0, depth - 1)
      if (depth === 0) setOver(false)
    }
    const onDrop = (e: DragEvent): void => {
      e.preventDefault()
      depth = 0
      setOver(false)
      const files = [...(e.dataTransfer?.files ?? [])]
      if (files.length === 0 || !hasFiles(e)) {
        showToast('Only files can be dropped')
        return
      }
      void (async () => {
        let first: string | null = null
        for (const file of files) {
          try {
            const entry = await api.current.addLocal(file)
            first ??= entry.id
          } catch (err) {
            showToast(`${file.name}: ${err instanceof Error ? err.message : 'Failed'}`)
          }
        }
        if (first === null) return
        await api.current.play(first)
        api.current.onPlay?.(first)
      })()
    }
    window.addEventListener('dragenter', onEnter)
    window.addEventListener('dragover', onOver)
    window.addEventListener('dragleave', onLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onEnter)
      window.removeEventListener('dragover', onOver)
      window.removeEventListener('dragleave', onLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return over ? (
    <div className={styles.drop} role="status">
      DROP MUSIC FILES TO PLAY
    </div>
  ) : null
}
