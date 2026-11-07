// SYSTEM HALTED screen. A key or click resets the boundary and goes to Browse.
import { Component } from 'react'
import type { ReactNode } from 'react'
import { formatRoute } from '../../state/route'
import styles from '../ui.module.css'

interface State {
  halted: boolean
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { halted: false }

  static getDerivedStateFromError(): State {
    return { halted: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('SYSTEM HALTED', error)
  }

  componentDidUpdate(_prev: unknown, prevState: State): void {
    if (this.state.halted && !prevState.halted) {
      window.addEventListener('keydown', this.reset)
      window.addEventListener('click', this.reset)
    }
  }

  componentWillUnmount(): void {
    this.detach()
  }

  private detach(): void {
    window.removeEventListener('keydown', this.reset)
    window.removeEventListener('click', this.reset)
  }

  private reset = (): void => {
    this.detach()
    location.hash = formatRoute({ page: 'browse' })
    this.setState({ halted: false })
  }

  render(): ReactNode {
    if (!this.state.halted) return this.props.children
    return (
      <div className={styles.halted} role="alert">
        <p>SYSTEM HALTED — press any key</p>
      </div>
    )
  }
}
