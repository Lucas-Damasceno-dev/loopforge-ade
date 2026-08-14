import { beforeEach, describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EdgeConfigDrawer } from '../EdgeConfigDrawer'
import { useEditorStore } from '../editorStore'

const draft = {
  name: 'x',
  description: '',
  nodes: [
    { id: 'in', type: 'input' as const, agent_id: null, config: {} },
    { id: 'dev', type: 'agent' as const, agent_id: 'a1', config: {} },
  ],
  edges: [{ source: 'in', target: 'dev', type: 'sequential' as const, condition: null, max_retries: 0 }],
}

beforeEach(() => {
  useEditorStore.setState({ open: true, editingId: 'p1', draft, live: false, selectedEdgeId: 'in->dev', positions: {} })
})

describe('EdgeConfigDrawer (S3)', () => {
  it('abre com a edge selecionada e mostra o type atual', () => {
    render(<EdgeConfigDrawer />)
    expect(screen.getByText('Edge config')).toBeInTheDocument()
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('sequential')
  })

  it('fecha sem edge selecionada (null)', () => {
    useEditorStore.setState({ selectedEdgeId: null })
    const { container } = render(<EdgeConfigDrawer />)
    expect(container).toBeEmptyDOMElement()
  })

  it('muda o type da edge para retry', () => {
    render(<EdgeConfigDrawer />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'retry' } })
    expect(useEditorStore.getState().draft!.edges[0].type).toBe('retry')
  })

  it('mostra max_retries quando retry e atualiza', () => {
    useEditorStore.setState({
      draft: { ...draft, edges: [{ source: 'in', target: 'dev', type: 'retry' as const, condition: null, max_retries: 1 }] },
    })
    render(<EdgeConfigDrawer />)
    fireEvent.change(screen.getByLabelText('Max retries'), { target: { value: '5' } })
    expect(useEditorStore.getState().draft!.edges[0].max_retries).toBe(5)
  })

  it('mostra condition quando conditional e atualiza', () => {
    useEditorStore.setState({
      draft: { ...draft, edges: [{ source: 'in', target: 'dev', type: 'conditional' as const, condition: 'x', max_retries: 0 }] },
    })
    render(<EdgeConfigDrawer />)
    fireEvent.change(screen.getByLabelText('Condition'), { target: { value: 'score > 0.5' } })
    expect(useEditorStore.getState().draft!.edges[0].condition).toBe('score > 0.5')
  })
})
