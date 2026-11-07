// Scrolling song message (the sample names / comments BBS people used for ads).
import styles from '../ui.module.css'

export function MessageScroller({ message }: { message: string }) {
  if (message === '') return <p className={styles.note}>No message in this file.</p>
  const lines = message.split('\n').length
  return (
    <div className={styles.scroller} aria-label="Song message" role="region" tabIndex={0}>
      <pre className={styles.scrollerText} style={{ animationDuration: `${10 + lines * 1.5}s` }}>
        {message}
      </pre>
    </div>
  )
}
