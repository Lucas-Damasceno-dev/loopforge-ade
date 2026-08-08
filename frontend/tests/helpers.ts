import { expect, type Page } from '@playwright/test'

// Helper E2E — modo demo (sem backend): o ApiKeyGate (M-20) abre um modal
// bloqueante (z-[70]) sempre que não há key salva em localStorage. Os specs
// que exercitam a demo precisam dispensar o overlay antes de interagir com o
// workspace. Idempotente: se o modal não estiver aberto, não faz nada.
export async function dismissApiKeyGate(page: Page): Promise<void> {
  const continueWithoutBackend = page.getByRole('button', { name: 'Continue without backend' })
  if (await continueWithoutBackend.isVisible().catch(() => false)) {
    await continueWithoutBackend.click()
    await expect(continueWithoutBackend).toBeHidden()
  }
}
