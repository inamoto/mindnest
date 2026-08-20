import { expect, test } from '@playwright/test'

test('restores memo editor cursor position after Ctrl+M toggles', async ({ page }) => {
  await page.goto('/')
  await page.locator('jmnode', { hasText: 'MindNest' }).click()

  await page.keyboard.press('Control+M')
  const editor = page.getByLabel('Markdown memo editor')
  await expect(editor).toBeVisible()
  await editor.fill('MindNest memo')
  await editor.evaluate((textarea) => {
    const memoEditor = textarea as HTMLTextAreaElement
    memoEditor.focus()
    memoEditor.setSelectionRange(4, 4)
    memoEditor.dispatchEvent(new Event('select', { bubbles: true }))
  })
  await expect.poll(async () => editor.evaluate((textarea) => (textarea as HTMLTextAreaElement).selectionStart)).toBe(4)

  await page.keyboard.press('Control+M')
  await expect(editor).toBeHidden()

  await page.keyboard.press('Control+M')
  await expect(editor).toBeVisible()
  await expect.poll(async () => editor.evaluate((textarea) => (textarea as HTMLTextAreaElement).selectionStart)).toBe(4)
})
