import { defineConfig } from 'vitepress'
import { execSync } from 'node:child_process'
import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { mcTextures, mcTextureAssets, craftingAssetsInlineLimit } from './mc-textures-plugin.mts'
import { generateSearchIndex } from './search/generate-index.ts'
import { LINKS, NAV, SEO, SIDEBAR, SITE_INFO } from './theme/config'

// 「动态」页聚合的文章目录（须与 NewsFeed.vue 的 glob 保持一致）
const FEED_DIRS = ['blogs', 'events', 'changelog', 'notices']

// —— 文章「最后修改时间」：取自 md 文件的 git 最后提交时间，无需手工维护 frontmatter ——
const repoRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

// navbar 右侧社交图标：直接读 public/icons 的单色 SVG（与首页 SocialLinks.vue 同一来源），
// VPIcon 会以 currentColor 填充，明暗主题自动跟随
const socialIcon = (name: string): { svg: string } => ({
  svg: readFileSync(path.resolve(repoRoot, `public/icons/${name}.svg`), 'utf8')
})

// 「<文章相对路径> -> 最后提交时间戳(秒)」映射，每次构建/开发会话只计算一次
let feedLastUpdatedMap: Map<string, number> | null = null

function getFeedLastUpdatedMap(): Map<string, number> {
  if (feedLastUpdatedMap) return feedLastUpdatedMap
  const map = new Map<string, number>()
  try {
    // git log 按时间倒序输出，每个文件取第一个触及它的提交即最后修改时间
    // -c core.quotepath=false：保证中文文件名按 UTF-8 输出而非八进制转义
    const output = execSync(
      `git -c core.quotepath=false log --format=@@@%ct --name-only -- ${FEED_DIRS.map((d) => `${d}`).join(' ')}`,
      { cwd: repoRoot, encoding: 'utf8' }
    )
    let ts = 0
    for (const raw of output.split(/\r?\n/)) {
      const line = raw.trim()
      if (line.startsWith('@@@')) {
        ts = Number(line.slice(3))
      } else if (line && ts && !map.has(line)) {
        map.set(line, ts)
      }
    }
  } catch {
    // 非 git 仓库或命令失败：视为无最后修改时间，组件会回退显示发布时间
  }
  feedLastUpdatedMap = map
  return map
}

// —— 「活动」栏：扫描 events/ 目录自动生成，无需手工登记 ——
// 导航「活动」入口指向 /events/，该页重定向到最新一篇；左侧边栏列出全部活动。
// 过滤规则与动态页一致：hide: true 不展示；按 date frontmatter 倒序（ISO 日期可直接按字典序比）。
interface EventItem {
  title: string
  url: string // 不带 .html 的站内路径，如 /events/长期建筑活动
  date: string
}

let eventsListCache: EventItem[] | null = null

function getEventsList(): EventItem[] {
  if (eventsListCache) return eventsListCache
  const eventsDir = path.resolve(repoRoot, 'events')
  const list: EventItem[] = []
  for (const name of readdirSync(eventsDir)) {
    if (!name.endsWith('.md') || name === 'index.md') continue
    const raw = readFileSync(path.join(eventsDir, name), 'utf8')
    const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)?.[1] ?? ''
    const get = (key: string): string | undefined =>
      new RegExp(`^${key}:[ \\t]*(.*)$`, 'm').exec(fm)?.[1]?.trim().replace(/^['"](.*)['"]$/, '$1')
    if (get('hide') === 'true') continue
    list.push({
      title: get('title') || name.replace(/\.md$/, ''),
      url: `/events/${name.replace(/\.md$/, '')}`,
      date: get('date') || ''
    })
  }
  list.sort((a, b) => (a.date < b.date ? 1 : -1))
  eventsListCache = list
  return list
}

// 侧边栏「活动」分组：与 sidebar.ts 的 wiki 静态配置合并进 themeConfig.sidebar
const eventsSidebar = [
  {
    text: '活动',
    link: '/events/',
    collapsed: false,
    items: getEventsList().map(({ title, url }) => ({ text: title, link: url }))
  }
]

// 最新一篇活动：/events/ 导航入口页重定向的目标
const latestEvent = getEventsList()[0]

// https://vitepress.dev/reference/site-config
export default defineConfig({
  // 站点基本信息取自 theme/config/siteInfo.ts
  title: SITE_INFO.name,
  description: SITE_INFO.description,
  lang: SITE_INFO.lang,
  sitemap: { hostname: SEO.hostname },
  // 仓库 README.md 是给 GitHub 看的说明，不作为站点页面构建/收录；
  // staff/ 是管理组成员数据（frontmatter，仅供 StaffCarousel.vue 读取），同样不生成页面
  srcExclude: ['README.md', 'staff/*.md'],
  // 合成表页面（/crafting）的物品贴图虚拟模块与资产规则，见 mc-textures-plugin.mts
  vite: {
    plugins: [mcTextures()],
    resolve: {
      alias: [{ find: '@mc-textures', replacement: mcTextureAssets }]
    },
    build: {
      assetsInlineLimit: craftingAssetsInlineLimit
    }
  },
  head: [
    ['link', { rel: 'icon', type: 'image/png', href: SITE_INFO.favicon }],
    ['meta', { name: 'keywords', content: SEO.keywords.join(', ') }],
    // 正文字体：思源黑体（Noto Sans SC），走国内 CDN（Google Fonts 镜像）加速
    ['link', { rel: 'preconnect', href: 'https://fonts.loli.net', crossorigin: '' }],
    ['link', { rel: 'preconnect', href: 'https://gstatic.loli.net', crossorigin: '' }],
    ['link', { rel: 'stylesheet', href: 'https://fonts.loli.net/css2?family=Noto+Sans+SC:wght@400;500;700&display=swap' }],
    // 首页预渲染 HTML 尚无 home-over-video 类（浏览器 JS 才会补上），
    // 用内联脚本在首屏前加上，避免顶部闪现原版配色导航栏。
    // 注意：本版本 head 元组为 [tag, attrs, innerHTML]，脚本体是第三个元素
    ['script', {},
      `(function(){if(location.pathname==='/'||/\\/index\\.html(\\?|#|$)/.test(location.pathname))document.documentElement.classList.add('home-over-video')})()`
    ]
  ],
  // 全站搜索的构建期索引：在 vitepress build 的 buildEnd 里直接生成，
  // 保证任何构建环境（CF Pages、本地）的产物都带 <outDir>/search/，
  // 不再依赖 package.json 构建命令里串联的独立脚本步骤（CF 上缺失会导致
  // 线上 /search/meta.json 404、搜索报「索引加载失败」）。逻辑见 search/generate-index.ts
  buildEnd({ outDir }) {
    generateSearchIndex(outDir)
  },
  transformPageData(pageData) {
    const fp = pageData.filePath
    const frontmatter = { ...pageData.frontmatter }

    // 为「动态」文章注入 git 最后提交时间（frontmatter.lastUpdated），供 ArticleMeta 显示「最后修改时间」
    const isFeedArticle = !!fp && FEED_DIRS.some((d) => fp.startsWith(`${d}/`))
    if (isFeedArticle) {
      const ts = getFeedLastUpdatedMap().get(fp)
      if (ts) {
        const d = new Date(ts * 1000)
        frontmatter.lastUpdated = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      }
    }

    // —— SEO：每页注入 canonical / og:* / twitter:*（设置见 theme/config/seo.ts）——
    // URL 与 sitemap 产物一致（cleanUrls 未开启 → 带 .html）：index.md → /，blogs/foo.md → /blogs/foo.html
    const pagePath = pageData.relativePath
      .replace(/(^|\/)index\.md$/, '/')
      .replace(/\.md$/, '.html')
    const pageUrl = pagePath === '/' ? `${SEO.hostname}/` : `${SEO.hostname}/${pagePath}`
    frontmatter.head ??= []
    frontmatter.head.push(
      ['link', { rel: 'canonical', href: pageUrl }],
      ['meta', { property: 'og:url', content: pageUrl }],
      ['meta', { property: 'og:site_name', content: SITE_INFO.name }],
      ['meta', { property: 'og:title', content: pageData.title || SITE_INFO.name }],
      [
        'meta',
        {
          property: 'og:description',
          content: (typeof frontmatter.description === 'string' && frontmatter.description) || SITE_INFO.description
        }
      ],
      ['meta', { property: 'og:type', content: isFeedArticle ? 'article' : 'website' }],
      ['meta', { property: 'og:image', content: `${SEO.hostname}${SEO.defaultOgImage}` }],
      ['meta', { name: 'twitter:card', content: SEO.twitterCard }]
    )

    // 「活动」导航入口直达最新一篇：/events/ 入口页注入重定向
    // （meta refresh 无 JS 兜底 + 脚本即时跳转；URL 带 .html 直达静态产物）
    if (pageData.relativePath === 'events/index.md' && latestEvent) {
      const target = `${latestEvent.url}.html`
      frontmatter.head.push(
        ['meta', { 'http-equiv': 'refresh', content: `0; url=${target}` }],
        ['script', {}, `location.replace(${JSON.stringify(target)})`]
      )
    }

    return { frontmatter }
  },
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: SITE_INFO.logo,
    // 默认主题内置文案（本版本无 locale 选项，逐个指定中文）
    navMenuLabel: '主导航',
    sidebarMenuLabel: '目录',
    mobileMenuLabel: '菜单',
    returnToTopLabel: '返回顶部',
    darkModeSwitchLabel: '外观',
    skipToContentLabel: '跳到主要内容',
    notFound: {
      title: '页面未找到',
      quote: '换个方向看看，也许你想要的页面就在别处。',
      linkLabel: '返回首页',
      linkText: '返回首页'
    },
    outline: { level: 'deep', label: '本页概览' },
    // 导航栏与文档侧边栏分别维护在 theme/config/nav.ts、theme/config/sidebar.ts（唯一数据源）；
    // 「活动」分组由 config 扫描 events/ 目录自动生成（见 getEventsList）
    nav: NAV,
    sidebar: { ...SIDEBAR, '/events/': eventsSidebar },

    // navbar 右侧媒体链接：与首页 SocialLinks.vue 共用 theme/config/links.ts 的 socials
    socialLinks: LINKS.socials.map((l) => ({
      icon: socialIcon(l.icon),
      link: l.href,
      ariaLabel: l.name
    }))
  }
})
