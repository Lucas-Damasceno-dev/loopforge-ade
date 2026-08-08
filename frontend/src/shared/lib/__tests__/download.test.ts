import { afterEach, describe, it, expect, vi } from 'vitest'
import { downloadJson } from '../download'

// downloadJson — blob + object URL + anchor click (jsdom não implementa
// URL.createObjectURL nem o download real — tudo é stubbed).
describe('downloadJson', () => {
  const originalCreate = URL.createObjectURL
  const originalRevoke = URL.revokeObjectURL

  afterEach(() => {
    URL.createObjectURL = originalCreate
    URL.revokeObjectURL = originalRevoke
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('creates a blob with pretty-printed JSON and clicks a download anchor', () => {
    const createUrl = vi.fn((_blob: Blob) => 'blob:mock')
    const revokeUrl = vi.fn()
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = revokeUrl
    const click = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(click)
    const appendSpy = vi.spyOn(document.body, 'appendChild')

    downloadJson('trajectory.json', { run_id: 'r1', checkpoints: [] })

    expect(createUrl).toHaveBeenCalledTimes(1)
    const [blob] = createUrl.mock.calls[0]
    expect(blob.type).toBe('application/json')
    expect(blob.size).toBeGreaterThan(0)
    // O anchor é capturado via spy — downloadJson o remove do DOM ao final.
    const anchor = appendSpy.mock.calls[0][0] as HTMLAnchorElement
    expect(anchor.getAttribute('download')).toBe('trajectory.json')
    expect(anchor.getAttribute('href')).toBe('blob:mock')
    expect(click).toHaveBeenCalledTimes(1)
    expect(revokeUrl).toHaveBeenCalledWith('blob:mock')
    expect(document.querySelector('a')).toBeNull()
  })

  it('serializes nested data with 2-space indentation', async () => {
    const createUrl = vi.fn((_blob: Blob) => 'blob:m')
    URL.createObjectURL = createUrl
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    downloadJson('x.json', { a: { b: 1 } })
    const [blob] = createUrl.mock.calls[0]
    // Blob do jsdom não expõe .text() — lê via FileReader.
    const text = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
    expect(text).toBe('{\n  "a": {\n    "b": 1\n  }\n}')
  })
})
