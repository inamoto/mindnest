import { toText } from 'hast-util-to-text'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import css from 'highlight.js/lib/languages/css'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import { createLowlight } from 'lowlight'
import { visit } from 'unist-util-visit'
import type { Element, ElementContent, Root } from 'hast'

const lowlight = createLowlight({
  bash,
  css,
  javascript,
  json,
  python,
  typescript,
  xml,
})

lowlight.registerAlias({
  bash: ['sh', 'shell', 'zsh'],
  javascript: ['js'],
  typescript: ['ts'],
  xml: ['html', 'svg'],
})

function getLanguage(node: Element) {
  const classNames = node.properties.className

  if (!Array.isArray(classNames)) {
    return null
  }

  for (const className of classNames) {
    const value = String(className)

    if (value === 'no-highlight' || value === 'nohighlight') {
      return null
    }

    if (value.startsWith('language-')) {
      return value.slice('language-'.length)
    }

    if (value.startsWith('lang-')) {
      return value.slice('lang-'.length)
    }
  }

  return null
}

export function rehypeSelectedHighlight() {
  return (tree: Root) => {
    visit(tree, 'element', (node, _index, parent) => {
      if (node.tagName !== 'code' || parent?.type !== 'element' || parent.tagName !== 'pre') {
        return
      }

      const language = getLanguage(node)

      if (!language || !lowlight.registered(language)) {
        return
      }

      const classNames = Array.isArray(node.properties.className) ? node.properties.className : []
      node.properties.className = classNames.includes('hljs') ? classNames : ['hljs', ...classNames]
      node.children = lowlight.highlight(language, toText(node, { whitespace: 'pre' })).children as ElementContent[]
    })
  }
}
