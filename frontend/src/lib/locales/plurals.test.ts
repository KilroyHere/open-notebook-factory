import { describe, expect, it } from 'vitest'
import i18next from 'i18next'
import { resources } from './index'

// Counts go through i18next's plural rules, with the app's settings (see
// ../i18n.ts): a key with _one/_other forms picks the one the language uses.
async function translator(lng: string) {
  const instance = i18next.createInstance()
  await instance.init({
    resources,
    lng,
    fallbackLng: 'en-US',
    interpolation: { escapeValue: false },
  })
  return instance.t.bind(instance)
}

describe('insight counts', () => {
  it('say "1 insight" for one and "insights" otherwise', async () => {
    const t = await translator('en-US')

    expect(t('sources.insightsCount', { count: 1 })).toBe('1 insight')
    expect(t('sources.insightsCount', { count: 2 })).toBe('2 insights')
    expect(t('sources.insightsCount', { count: 0 })).toBe('0 insights')
  })

  it.each([
    ['ca-ES', '1 anàlisi', '3 anàlisis'],
    ['de-DE', '1 Erkenntnis', '3 Erkenntnisse'],
    ['fr-FR', '1 aperçu', '3 aperçus'],
    ['it-IT', '1 approfondimento', '3 approfondimenti'],
    ['pt-BR', '1 insight', '3 insights'],
  ])('use the singular for one in %s', async (lng, one, three) => {
    const t = await translator(lng)

    expect(t('sources.insightsCount', { count: 1 })).toBe(one)
    expect(t('sources.insightsCount', { count: 3 })).toBe(three)
  })

  it('have a form for every count in every language', async () => {
    for (const lng of Object.keys(resources)) {
      const t = await translator(lng)
      for (const count of [0, 1, 2, 5, 21]) {
        const text = t('sources.insightsCount', { count })
        expect(text, `${lng}, ${count}`).toContain(String(count))
        expect(text, `${lng}, ${count}`).not.toContain('insightsCount')
      }
    }
  })
})
