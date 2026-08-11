import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function resetAppStorage(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    localStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('hierarchicalMindMap')
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
      request.onblocked = () => resolve()
    })
  })
}

async function renameEditingNode(page: Page, name: string) {
  const editor = page.locator('.jsmind-editor')
  await expect(editor).toBeVisible()
  await editor.fill(name)
  await editor.press('Enter')
  await expect(page.locator('jmnode', { hasText: name })).toBeVisible()
}

async function selectNode(page: Page, topic: string) {
  await page.locator('jmnode', { hasText: topic }).click()
  await expect(page.getByRole('heading', { name: topic, level: 2 })).toBeVisible()
}

function breadcrumb(page: Page) {
  return page.getByLabel('Breadcrumb')
}

async function downloadJson(page: Page) {
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('menuitem', { name: 'Export JSON' }).evaluate((element) => (element as HTMLButtonElement).click())
  const download = await downloadPromise
  const stream = await download.createReadStream()

  if (!stream) {
    throw new Error('Export JSON download stream was not available')
  }

  const body = await new Promise<string>((resolve, reject) => {
    let text = ''
    stream.on('data', (chunk: unknown) => {
      text += String(chunk)
    })
    stream.on('end', () => resolve(text))
    stream.on('error', reject)
  })

  return JSON.parse(body)
}


test('updates node colors from context menu', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'Colored')

  const coloredNode = page.locator('jmnode', { hasText: 'Colored' })
  await coloredNode.click({ button: 'right' })
  await page.getByRole('button', { name: 'Background Red' }).click()
  await page.getByRole('button', { name: 'Text Green' }).click()

  await expect.poll(async () => coloredNode.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(220, 38, 38)')
  await expect.poll(async () => coloredNode.evaluate((element) => getComputedStyle(element).borderColor)).toBe('rgb(220, 38, 38)')
  await expect.poll(async () => coloredNode.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(22, 163, 74)' )
  await expect.poll(async () => page.locator('svg.jsmind path').first().evaluate((element) => element.getAttribute('stroke'))).toBe('#8b8f98')

  await page.getByRole('menuitem', { name: 'Reset colors' }).click()
  await expect.poll(async () => coloredNode.evaluate((element) => element.style.getPropertyValue('--node-bg'))).toBe('')
  await expect.poll(async () => coloredNode.evaluate((element) => element.style.getPropertyValue('--node-fg'))).toBe('')
})

test('persists node colors after reload', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  const rootNode = page.locator('jmnode', { hasText: 'MindNest' })
  await rootNode.click({ button: 'right' })
  await page.getByRole('button', { name: 'Background Red' }).click()
  await page.getByRole('button', { name: 'Text White' }).click()
  await page.waitForTimeout(600)
  await page.reload()

  const reloadedRoot = page.locator('jmnode', { hasText: 'MindNest' })
  await expect.poll(async () => reloadedRoot.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(220, 38, 38)')
  await expect.poll(async () => reloadedRoot.evaluate((element) => getComputedStyle(element).borderColor)).toBe('rgb(220, 38, 38)')
  await expect.poll(async () => reloadedRoot.evaluate((element) => getComputedStyle(element).color)).toBe('rgb(255, 255, 255)')
})

test('updates theme and font settings', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
  await page.getByRole('combobox', { name: 'Font', exact: true }).selectOption({ label: 'Monospace' })
  await page.getByRole('slider', { name: 'MindMap font size' }).fill('18')
  await page.getByRole('slider', { name: 'Memo font size' }).fill('20')
  await page.getByRole('button', { name: 'Done' }).click()

  const appShell = page.locator('.app-shell')
  await expect(appShell).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => page.locator('jmnode', { hasText: 'MindNest' }).evaluate((element) => getComputedStyle(element).fontSize)).toBe('18px')

  await page.getByRole('button', { name: 'Edit' }).click()
  await expect.poll(async () => page.getByLabel('Markdown memo editor').evaluate((element) => getComputedStyle(element).fontSize)).toBe('20px')
})

test('persists settings after reload', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Open settings' }).click()
  await page.getByRole('combobox', { name: 'Theme' }).selectOption('dark')
  await page.getByRole('combobox', { name: 'Font', exact: true }).selectOption({ label: 'Monospace' })
  await page.getByRole('slider', { name: 'MindMap font size' }).fill('18')
  await page.getByRole('slider', { name: 'Memo font size' }).fill('20')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.reload()

  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark')
  await expect.poll(async () => page.locator('jmnode', { hasText: 'MindNest' }).evaluate((element) => getComputedStyle(element).fontSize)).toBe('18px')

  await page.getByRole('button', { name: 'Edit' }).click()
  await expect.poll(async () => page.getByLabel('Markdown memo editor').evaluate((element) => getComputedStyle(element).fontSize)).toBe('20px')
})

test('renders markdown math fractions with KaTeX layout', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Markdown memo editor').fill('$$G(x)=\\frac{1}{\\sqrt{2\\pi\\sigma}}\\exp\\left(-\\frac{(x-\\mu)^2}{2\\sigma^2}\\right)^a$$')
  await page.keyboard.press('Control+M')

  const displayMath = page.locator('.markdown-preview .katex-display .katex')
  await expect(displayMath.locator('.mfrac')).toHaveCount(2)
  await expect(displayMath.locator('.frac-line').first()).toBeVisible()
  await expect(displayMath.locator('.mord.textstyle')).toHaveCount(0)
})

test('keeps cursor position in memo editor when pressing Backspace', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Edit' }).click()
  const editor = page.getByLabel('Markdown memo editor')
  await editor.fill('abcde')
  await editor.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement
    textarea.setSelectionRange(3, 3)
  })
  await editor.press('Backspace')

  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('abde')
  await expect.poll(async () => editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(2)
})

test('keeps Delete and arrow keys inside memo editor', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Edit' }).click()
  const editor = page.getByLabel('Markdown memo editor')
  await editor.fill('abcde')
  await editor.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement
    textarea.setSelectionRange(2, 2)
  })
  await editor.press('ArrowRight')
  await editor.press('Delete')

  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('abce')
  await expect.poll(async () => editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(3)
  await expect(page.locator('.jsmind-editor')).toBeHidden()
})

test('keeps focus in memo editor when pressing Enter and Tab', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Edit' }).click()
  const editor = page.getByLabel('Markdown memo editor')
  await editor.fill('first')
  await editor.press('Enter')
  await editor.press('Tab')
  await editor.type('second')

  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('first\n\tsecond')
  await expect(page.locator('jmnode:visible', { hasText: 'MindNest' })).toHaveCount(1)
  await expect(page.locator('.jsmind-editor')).toBeHidden()
})

test('confirms before deleting a node with child MindMap using Delete key', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'DeleteKeyChild')
  await page.locator('jmnode', { hasText: 'DeleteKeyChild' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Create MindMap' }).evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.locator('jmnode', { hasText: 'DeleteKeyChild' })).toContainText('↗')

  await page.locator('jmnode', { hasText: 'DeleteKeyChild' }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('child MindMap')
    await dialog.dismiss()
  })
  await page.keyboard.press('Delete')
  await expect(page.locator('jmnode:visible', { hasText: 'DeleteKeyChild' })).toBeVisible()
})

test('exports memo child MindMap reference and node colors', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'Exported')
  await selectNode(page, 'Exported')

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Markdown memo editor').fill('# Exported\n\nMemo body')
  await page.keyboard.press('Control+M')

  await page.locator('jmnode', { hasText: 'Exported' }).click({ button: 'right' })
  await page.getByRole('button', { name: 'Background Red' }).click()
  await page.getByRole('button', { name: 'Text White' }).click()
  await page.getByRole('menuitem', { name: 'Create MindMap' }).evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.locator('jmnode', { hasText: 'Exported' })).toContainText('↗')

  await page.locator('jmnode', { hasText: 'Exported' }).click({ button: 'right' })
  const json = await downloadJson(page)

  expect(json.type).toBe('mindmap-bundle')
  expect(json.rootNode.topic).toBe('Exported')
  expect(json.rootNode.memo).toContain('Memo body')
  expect(json.rootNode.childMindMapId).toEqual(expect.any(String))
  expect(json.rootNode['background-color']).toBe('#dc2626')
  expect(json.rootNode['foreground-color']).toBe('#ffffff')
  expect(json.maps.length).toBeGreaterThan(0)
})

test('confirms before deleting a node with child MindMap', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'Child')
  await page.locator('jmnode', { hasText: 'Child' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Create MindMap' }).click()
  await expect(page.locator('jmnode', { hasText: 'Child' })).toContainText('↗')

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('child MindMap')
    await dialog.dismiss()
  })
  await page.locator('jmnode', { hasText: 'Child' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await expect(page.locator('jmnode', { hasText: 'Child' })).toBeVisible()

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('child MindMap')
    await dialog.accept()
  })
  await page.locator('jmnode', { hasText: 'Child' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await expect(page.locator('jmnode', { hasText: 'Child' })).toBeHidden()
})

test('MVP acceptance scenario', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await expect(breadcrumb(page).getByText('MindNest')).toBeVisible()
  await expect(page.locator('jmnode', { hasText: 'MindNest' })).toBeVisible()

  await page.getByRole('button', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'Work')
  await selectNode(page, 'Work')

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Markdown memo editor').fill('# Work\n\n## Todo\n\n- [ ] Project A\n- [ ] Project B')
  await page.keyboard.press('Control+M')
  await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Todo' })).toBeVisible()
  await expect(page.getByText('[ ] Project A')).toBeVisible()

  await selectNode(page, 'MindNest')
  await selectNode(page, 'Work')
  await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible()
  await expect(page.getByText('[ ] Project B')).toBeVisible()

  await page.getByRole('button', { name: 'Create MindMap' }).click()
  await expect(page.locator('jmnode', { hasText: 'Work' })).toContainText('↗')
  await page.waitForTimeout(600)

  await page.getByRole('button', { name: 'Open MindMap' }).click()
  await expect(breadcrumb(page).getByText('/ Work')).toBeVisible()
  await expect(page.locator('jmnode', { hasText: 'Work' })).toBeVisible()

  await page.getByRole('button', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'Project A')
  await selectNode(page, 'Project A')

  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Markdown memo editor').fill('# Project A\n\nProject memo...')
  await page.keyboard.press('Control+M')
  await expect(page.getByRole('heading', { name: 'Project A', level: 1 })).toBeVisible()

  await page.waitForTimeout(600)
  await page.reload()

  await expect(breadcrumb(page).getByText('MindNest')).toBeVisible()
  await expect(page.locator('jmnode', { hasText: 'Work' })).toBeVisible()
  await selectNode(page, 'Work')
  await page.getByRole('button', { name: 'Open MindMap' }).click()
  await expect(breadcrumb(page).getByText('/ Work')).toBeVisible()
  await expect(page.locator('jmnode', { hasText: 'Project A' })).toBeVisible()
  await selectNode(page, 'Project A')
  await expect(page.getByRole('heading', { name: 'Project A', level: 1 })).toBeVisible()
  await expect(page.getByText('Project memo...')).toBeVisible()

  await page.getByRole('button', { name: 'Back' }).click()
  await selectNode(page, 'Work')
  await expect(page.getByRole('heading', { name: 'Work', level: 1 })).toBeVisible()
  await expect(page.getByText('[ ] Project A')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export JSON' }).click()
  const download = await downloadPromise
  const stream = await download.createReadStream()

  if (!stream) {
    throw new Error('Export JSON download stream was not available')
  }

  const body = await new Promise<string>((resolve, reject) => {
    let text = ''
    stream.on('data', (chunk: unknown) => {
      text += String(chunk)
    })
    stream.on('end', () => resolve(text))
    stream.on('error', reject)
  })
  const json = JSON.parse(body)

  expect(json.topic).toBe('Work')
  expect(JSON.stringify(json)).toContain('# Work')
  expect(JSON.stringify(json)).toContain('childMindMapId')
})
