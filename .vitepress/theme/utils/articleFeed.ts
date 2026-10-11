// 「动态」页（/update/）文章数据的解析与过滤。
// 输入为 md 原文（import.meta.glob ?raw），字段约定沿用统一模板 frontmatter：
// title / date / hide / category / author / description，头图为正文首个
// 图片 ![...](...) 或 [头图](...) 约定行。

export interface Article {
  title: string
  href: string
  date: string
  author: string
  category: string
  description: string
  cover: string | null
  /** 时间轴视图图片宫格：正文 ![] 图按序收集（无则回退头图约定行），去重后最多 9 张 */
  images: string[]
}

export const CATEGORY_LABELS: Record<string, string> = {
  blogs: '博客',
  events: '活动',
  changelog: '更新日志',
  notices: '公告'
}

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*\r?\n?/
const KEY_RE = /^([A-Za-z0-9_-]+):[ \t]*(.*)$/
const ITEM_RE = /^-[ \t]*(.*)$/
const SEQ_RE = /^-[ \t]/
const IMAGE_RE = /!\[[^\]]*\]\(([^)\s]+)[^)]*\)/g
const COVER_LINK_RE = /(?:^|\n)[ \t]*\[头图\]\(([^)\s]+)[^)]*\)/

/**
 * frontmatter 用到的 YAML 子集：嵌套映射、标量、标量列表。
 * （列表元素本身是映射的写法只取原始字符串，目前站点没有数据源依赖它）
 */
export type YamlValue = string | YamlValue[] | { [key: string]: YamlValue }

interface Line {
  /** 行首缩进列数 */
  indent: number
  /** 去掉缩进与注释后的内容 */
  text: string
  /** 是否为 `- xxx` 序列项 */
  seq: boolean
}

const unquote = (v: string) => v.replace(/^(['"])(.*)\1$/, '$2')

function toLines(block: string): Line[] {
  const lines: Line[] = []
  for (const line of block.split(/\r?\n/)) {
    const text = line.trim()
    if (!text || text.startsWith('#')) continue
    lines.push({ indent: line.search(/\S/), text, seq: SEQ_RE.test(text) })
  }
  return lines
}

/** 解析一段同缩进的 `key: value`；值为空的键递归收下它的子块 */
function parseMap(lines: Line[], start: number, indent: number): [Record<string, YamlValue>, number] {
  const out: Record<string, YamlValue> = {}
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    // 缩进退回上一级说明本层结束，剩下的行交给外层
    if (line.indent < indent) break
    // 同层里更深的行（如列表元素是映射的续行）跳过，别把后面的字段一起带没了
    if (line.indent !== indent || line.seq) {
      i++
      continue
    }
    const kv = KEY_RE.exec(line.text)
    if (!kv) {
      i++
      continue
    }
    const inline = unquote(kv[2].trim())
    if (inline) {
      out[kv[1]] = inline
      i++
      continue
    }
    const [child, next] = parseNested(lines, i + 1, indent)
    out[kv[1]] = child
    i = next
  }
  return [out, i]
}

/** 键或序列项之后紧跟的子块：更深一级才算有内容，否则是空值 */
function parseNested(lines: Line[], start: number, parentIndent: number): [YamlValue, number] {
  const first = lines[start]
  if (!first) return [[], start]
  // YAML 允许序列项与键同缩进
  if (first.seq && first.indent >= parentIndent) return parseSeq(lines, start, first.indent)
  if (first.indent <= parentIndent) return [[], start]
  return first.seq ? parseSeq(lines, start, first.indent) : parseMap(lines, start, first.indent)
}

function parseSeq(lines: Line[], start: number, indent: number): [YamlValue[], number] {
  const out: YamlValue[] = []
  let i = start
  while (i < lines.length) {
    const line = lines[i]
    if (line.indent !== indent || !line.seq) break
    const item = ITEM_RE.exec(line.text)?.[1].trim() ?? ''
    if (item) {
      out.push(unquote(item))
      i++
      continue
    }
    const [child, next] = parseNested(lines, i + 1, indent)
    out.push(child)
    i = next
  }
  return [out, i]
}

export function parseFrontmatter(raw: string) {
  const m = FRONTMATTER_RE.exec(raw)
  if (!m) return { data: {} as Record<string, YamlValue>, body: raw }
  const lines = toLines(m[1])
  const [data] = parseMap(lines, 0, lines[0]?.indent ?? 0)
  return { data, body: raw.slice(m[0].length) }
}

// 无 description 时的兜底摘要：剥掉 markdown 标记后取正文前 120 字
function plainSummary(body: string): string {
  const text = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}[ \t].*$/gm, ' ')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/[*_~|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.length > 120 ? text.slice(0, 120) + '…' : text
}

// 按正文顺序提取图片（去重、最多 9 张）；无 ![] 图时回退头图约定行。
// 绝对路径 / 外链 / public 路径直接可用，相对路径挂到文章所在目录
function extractImages(body: string, dir: string): string[] {
  let srcs = [...body.matchAll(IMAGE_RE)].map((m) => m[1])
  if (srcs.length === 0) {
    const m = COVER_LINK_RE.exec(body)
    if (m) srcs = [m[1]]
  }
  const images: string[] = []
  for (const src of srcs) {
    let url: string
    if (/^(https?:)?\/\//.test(src) || src.startsWith('/')) {
      url = src
    } else if (/^[a-z0-9-]+(\.[a-z0-9-]+)+\//i.test(src)) {
      // 无协议的域名链接（www.xxx.com/...）补 https
      url = `https://${src}`
    } else {
      url = `/${dir}/${src}`
    }
    if (!images.includes(url)) images.push(url)
    if (images.length >= 9) break
  }
  return images
}

const asList = (v: YamlValue | undefined): string[] => {
  if (typeof v === 'string') return v === '' ? [] : [v]
  if (Array.isArray(v)) return v.filter((item): item is string => typeof item === 'string')
  return []
}

// entries: [globKey, rawText] 对，如 ['/blogs/foo.md', '---\n...']
export function buildArticles(
  entries: ReadonlyArray<readonly [string, string]>
): Article[] {
  const list: Article[] = []
  for (const [file, raw] of entries) {
    const path = file.replace(/^\//, '')
    const dir = path.replace(/\/[^/]+$/, '')
    const name = path.replace(/^.*\//, '').replace(/\.md$/, '')
    const { data, body } = parseFrontmatter(raw)
    if (data.hide === 'true') continue
    // 「动态」页自身（update.md，layout: page）不进列表
    if (data.layout === 'page') continue
    const category =
      (typeof data.category === 'string' && data.category) ||
      dir.split('/')[0] ||
      'blogs'
    const images = extractImages(body, dir)
    list.push({
      title: (typeof data.title === 'string' && data.title) || name,
      href: `/${path.replace(/\.md$/, '')}/`,
      date: typeof data.date === 'string' ? data.date : '',
      author: asList(data.author).join('、'),
      category,
      description:
        (typeof data.description === 'string' && data.description) ||
        plainSummary(body),
      cover: images[0] ?? null,
      images
    })
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return list
}
