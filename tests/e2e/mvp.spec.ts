import { Buffer } from 'node:buffer'
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


test('updates node colors from keyboard shortcuts', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  const rootNode = page.locator('jmnode:visible', { hasText: 'MindNest' })
  await rootNode.click()

  await page.keyboard.press('Control+1')
  await expect.poll(async () => rootNode.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(220, 38, 38)')
  await expect(page.locator('.jsmind-editor')).toBeHidden()
  await expect(page.getByLabel('Markdown memo editor')).toBeHidden()

  await page.keyboard.press('Control+2')
  await expect.poll(async () => rootNode.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(234, 179, 8)')
  await expect(page.locator('.jsmind-editor')).toBeHidden()
  await expect(page.getByLabel('Markdown memo editor')).toBeHidden()

  await page.keyboard.press('Control+3')
  await expect.poll(async () => rootNode.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe('rgb(22, 163, 74)')
  await expect(page.locator('.jsmind-editor')).toBeHidden()
  await expect(page.getByLabel('Markdown memo editor')).toBeHidden()

  await page.keyboard.press('Control+0')
  await expect.poll(async () => rootNode.evaluate((element) => element.style.getPropertyValue('--node-bg'))).toBe('')
  await expect(page.locator('.jsmind-editor')).toBeHidden()
  await expect(page.getByLabel('Markdown memo editor')).toBeHidden()
})

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

test('edits Gantt task fields from Gantt mode', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Gantt' }).click()
  await expect(page.getByLabel('Gantt chart mode')).toBeVisible()

  const rootRow = page.getByLabel('Gantt task fields').locator('.gantt-inline-row').first()
  await rootRow.getByLabel('From MindNest').fill('2026-01-01')
  await rootRow.getByLabel('To MindNest').fill('2026-01-10')
  await rootRow.getByLabel('Assignee MindNest').fill('Inamoto')
  await rootRow.getByLabel('Progress MindNest').fill('40')

  await expect(rootRow.getByLabel('Assignee MindNest')).toHaveValue('Inamoto')
  await expect(rootRow.getByLabel('Progress MindNest')).toHaveValue('40')
  await expect(page.locator('.gantt-chart-panel')).toContainText('MindNest')
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

test('keeps cursor position after entering memo editor with Ctrl+M', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.getByRole('button', { name: 'Edit' }).click()
  const editor = page.getByLabel('Markdown memo editor')
  await editor.fill('abcde')
  await page.keyboard.press('Control+M')
  await page.keyboard.press('Control+M')
  await editor.evaluate((element) => {
    const textarea = element as HTMLTextAreaElement
    textarea.setSelectionRange(2, 2)
  })
  await editor.type('X')

  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('abXcde')
  await expect.poll(async () => editor.evaluate((element) => (element as HTMLTextAreaElement).selectionStart)).toBe(3)
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

test('creates child MindMap with Ctrl+Enter when missing', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'ShortcutChildMap')
  await page.locator('jmnode', { hasText: 'ShortcutChildMap' }).click()

  await page.keyboard.press('Control+Enter')
  await expect(breadcrumb(page).getByText('/ ShortcutChildMap')).toBeVisible()
  await expect(page.locator('jmnode:visible', { hasText: 'ShortcutChildMap' })).toBeVisible()

  await breadcrumb(page).getByRole('button', { name: 'MindNest' }).click()
  await page.locator('jmnode:visible', { hasText: 'ShortcutChildMap' }).click()
  await expect(page.getByRole('dialog', { name: 'ShortcutChildMap child MindMap' })).toBeVisible()
  await page.getByRole('button', { name: 'Open MindMap' }).click()
  await expect(breadcrumb(page).getByText('/ ShortcutChildMap')).toBeVisible()
})

test('deletes child MindMap with Ctrl+Delete', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'ShortcutDeleteMap')
  await page.locator('jmnode', { hasText: 'ShortcutDeleteMap' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Create MindMap' }).evaluate((element) => (element as HTMLButtonElement).click())
  await expect(page.locator('jmnode:visible', { hasText: 'ShortcutDeleteMap' })).toContainText('↗')

  await page.locator('jmnode:visible', { hasText: 'ShortcutDeleteMap' }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Delete child MindMap')
    await dialog.accept()
  })
  await page.keyboard.press('Control+Delete')

  await expect(page.locator('jmnode:visible', { hasText: 'ShortcutDeleteMap' })).not.toContainText('↗')
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

test('renames a node on double click', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'DoubleClickChild')
  await page.locator('jmnode', { hasText: 'DoubleClickChild' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Create MindMap' }).evaluate((element) => (element as HTMLButtonElement).click())

  await page.locator('jmnode', { hasText: 'DoubleClickChild' }).dblclick()
  await renameEditingNode(page, 'RenamedByDoubleClick')

  await expect(breadcrumb(page).getByText('MindNest')).toBeVisible()
  await expect(breadcrumb(page).getByText('/ RenamedByDoubleClick')).toBeHidden()
  await expect(page.locator('jmnode', { hasText: 'RenamedByDoubleClick' })).toContainText('↗')
})

test('opens child MindMap from selection popover', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'PopoverChild')
  await page.locator('jmnode', { hasText: 'PopoverChild' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Create MindMap' }).evaluate((element) => (element as HTMLButtonElement).click())

  await page.locator('jmnode', { hasText: 'MindNest' }).click()
  await page.locator('jmnode', { hasText: 'PopoverChild' }).click()
  await expect(page.getByRole('dialog', { name: 'PopoverChild child MindMap' })).toBeVisible()
  await page.getByRole('button', { name: 'Open MindMap' }).click()

  await expect(breadcrumb(page).getByText('/ PopoverChild')).toBeVisible()
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

test('copies and pastes a node subtree as a child', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'CopySource')
  await page.locator('jmnode', { hasText: /^CopySource$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'CopySourceChild')

  await page.locator('jmnode', { hasText: /^CopySource$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Copy Node' }).click()
  await page.locator('jmnode', { hasText: /^MindNest$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Paste as Child' }).click()

  await expect(page.locator('jmnode:visible', { hasText: 'CopySource Copy' })).toBeVisible()
  await expect(page.locator('jmnode:visible', { hasText: 'CopySourceChild Copy' })).toBeVisible()
})

test('cuts and pastes a node as a child', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'CutParent')
  await page.locator('jmnode', { hasText: /^MindNest$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'CutSource')

  await page.locator('jmnode', { hasText: /^CutSource$/ }).click()
  await page.keyboard.press('Control+X')
  await page.locator('jmnode', { hasText: /^CutParent$/ }).click()
  await page.keyboard.press('Control+V')

  await expect(page.locator('jmnode:visible', { hasText: /^CutSource$/ })).toBeVisible()
  await selectNode(page, 'CutSource')
  await expect(page.getByRole('heading', { name: 'CutSource', level: 2 })).toBeVisible()
})

test('restores selected node from URL', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'UrlTarget')
  await selectNode(page, 'UrlTarget')

  await expect.poll(() => page.evaluate(() => new URL(window.location.href).searchParams.get('node'))).not.toBeNull()
  await page.waitForTimeout(600)
  const selectedUrl = page.url()

  await page.goto('about:blank')
  await page.goto(selectedUrl)

  await expect(page.locator('jmnode:visible', { hasText: /^UrlTarget$/ })).toHaveClass(/selected/)
  await expect(page.getByRole('heading', { name: 'UrlTarget', level: 2 })).toBeVisible()
})

test('does not scroll the mind map panel while dragging a node', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'DragNoScroll')

  const panel = page.locator('.jsmind-inner')
  const node = page.locator('jmnode', { hasText: /^DragNoScroll$/ })
  const nodeBox = await node.boundingBox()

  if (!nodeBox) {
    throw new Error('DragNoScroll node box was not available')
  }

  const beforeScroll = await panel.evaluate((element) => {
    element.scrollLeft = 24
    element.scrollTop = 24

    return {
      left: element.scrollLeft,
      top: element.scrollTop,
    }
  })

  await page.mouse.move(nodeBox.x + nodeBox.width / 2, nodeBox.y + nodeBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(nodeBox.x + nodeBox.width / 2 + 180, nodeBox.y + nodeBox.height / 2 + 120, { steps: 8 })

  const duringScroll = await panel.evaluate((element) => ({
    left: element.scrollLeft,
    top: element.scrollTop,
  }))

  await page.mouse.up()

  expect(duringScroll).toEqual(beforeScroll)
})

test('imports JSON as child when replace confirmation is dismissed', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'ImportTarget')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.locator('jmnode', { hasText: /^ImportTarget$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Import JSON' }).click()
  const fileChooser = await fileChooserPromise

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Replace "ImportTarget"')
    await dialog.dismiss()
  })

  await fileChooser.setFiles({
    name: 'imported.bundle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      type: 'mindmap-bundle',
      version: 1,
      exportedAt: Date.now(),
      rootNode: { id: 'imported-root', topic: 'ImportedAsChild', memo: '', children: [] },
      maps: [],
    })),
  })

  await expect(page.locator('jmnode:visible', { hasText: 'ImportTarget' })).toBeVisible()
  await expect(page.locator('jmnode:visible', { hasText: 'ImportedAsChild' })).toBeVisible()
})

test('replaces selected node when JSON import confirmation is accepted', async ({ page }) => {
  await resetAppStorage(page)
  await page.reload()

  await page.locator('jmnode', { hasText: 'MindNest' }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: '+ Child Node' }).click()
  await renameEditingNode(page, 'ReplaceTarget')

  const fileChooserPromise = page.waitForEvent('filechooser')
  await page.locator('jmnode', { hasText: /^ReplaceTarget$/ }).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Import JSON' }).click()
  const fileChooser = await fileChooserPromise

  page.once('dialog', async (dialog) => {
    expect(dialog.message()).toContain('Replace "ReplaceTarget"')
    await dialog.accept()
  })

  await fileChooser.setFiles({
    name: 'replacement.bundle.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({
      type: 'mindmap-bundle',
      version: 1,
      exportedAt: Date.now(),
      rootNode: { id: 'replacement-root', topic: 'ImportedReplacement', memo: '', children: [] },
      maps: [],
    })),
  })

  await expect(page.locator('jmnode:visible', { hasText: 'ReplaceTarget' })).toBeHidden()
  await expect(page.locator('jmnode:visible', { hasText: 'ImportedReplacement' })).toBeVisible()
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
