import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HitlGateBanner } from '../HitlGateBanner'
import { useHitlGateStore } from '../../../stores/hitlGateStore'

beforeEach(() => {
  useHitlGateStore.setState({ gates: [] })
})

describe('HitlGateBanner (C3)', () => {
  it('renders nothing without gates', () => {
    const { container } = render(<HitlGateBanner />)
    expect(container).toBeEmptyDOMElement()
  })
  it('renders the latest gate with timeout and on_timeout', () => {
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1', timeoutSeconds: 300, onTimeout: 'continue' })
    render(<HitlGateBanner />)
    const banner = screen.getByTestId('hitl-gate-banner')
    expect(banner).toHaveTextContent('Gate HITL: qa')
    expect(banner).toHaveTextContent('timeout 300s (continue)')
  })
  it('renders gate without timeout info when fields are missing', () => {
    useHitlGateStore.getState().push({ gateNode: 'developer', runId: 'r2' })
    render(<HitlGateBanner />)
    expect(screen.getByTestId('hitl-gate-banner')).toHaveTextContent('Gate HITL: developer')
  })
  it('dismisses the top gate; a previous gate is revealed', () => {
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1' })
    useHitlGateStore.getState().push({ gateNode: 'pm', runId: 'r2' })
    render(<HitlGateBanner />)
    expect(screen.getByTestId('hitl-gate-banner')).toHaveTextContent('Gate HITL: pm')
    fireEvent.click(screen.getByRole('button', { name: /dispensar/i }))
    expect(screen.getByTestId('hitl-gate-banner')).toHaveTextContent('Gate HITL: qa')
  })
})
