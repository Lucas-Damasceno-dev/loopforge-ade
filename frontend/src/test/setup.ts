// Setup global dos testes: matchers do jest-dom no Vitest (toBeInTheDocument etc.).
import '@testing-library/jest-dom/vitest'

// jsdom não implementa Blob/File.prototype.text() (Node tem, o jsdom 27 não) —
// polyfill p/ os testes que leem arquivos via file.text() (import de
// trajetória, Fase C). Usa FileReader, que o jsdom implementa.
if (typeof File !== 'undefined' && typeof File.prototype.text !== 'function') {
  File.prototype.text = function readAsText(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'))
      reader.readAsText(this)
    })
  }
}

