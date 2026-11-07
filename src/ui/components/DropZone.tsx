// Window-wide drag & drop target (decision 37). Nothing is uploaded: files are read locally.
import { useEffect, useState } from 'react'
import { usePlayer } from '../../state/PlayerContext'
import styles from '../ui.module.css'
import { showToast } from './Toast'

const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false

export function DropZone() {
  const { addLocal, play } = usePlayer()
  const [over, setOver] = useState(false)

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
            const entry = await addLocal(file)
            first ??= entry.id
          } catch (err) {
            showToast(`${file.name}: ${err instanceof Error ? err.message : 'Failed'}`)
          }
        }
        if (first !== null) await play(first)
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
  }, [addLocal, play])

  return over ? (
    <div className={styles.drop} role="status">
      DROP MUSIC FILES TO PLAY
    </div>
  ) : null
}
