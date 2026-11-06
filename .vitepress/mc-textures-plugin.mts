/**
 * minecraft-textures 贴图接入插件（移植自 vue-crafting/vite.config.ts，供 config.mts 的 vite.plugins 使用）。
 * 物品图标来自 github.com/destruc7i0n/minecraft-textures（npm 包 minecraft-textures）。
 *
 * 贴图不走 Vite 资产管道：26.3 的 manifest 引用 1600+ 张 PNG，若逐个 import('...?url')，
 * 打包时 vite:asset 会并发 open 这些文件，在文件描述符上限较低的构建容器里直接 EMFILE
 * （构建日志中的 `[plugin vite:asset] Error: EMFILE: too many open files`）。因此改为：
 *   - 构建：writeBundle 阶段按顺序复制到 <outDir>/mc-textures/，不进入逐文件资产图；
 *   - 开发：configureServer 中间件按请求从 node_modules 流式读取，一次只打开一个文件；
 *   - 虚拟模块 virtual:mc-textures 只导出 manifest 元数据与普通 URL，不再产生资产依赖。
 * 文件名本身是内容哈希，可长期缓存；MC 版本统一在 MC_VERSION。
 */
import { copyFileSync, createReadStream, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { Plugin, ResolvedConfig } from 'vite'

const require = createRequire(import.meta.url)
// MC 版本唯一出处：manifest 与贴图均取自 minecraft-textures 包
const MC_VERSION = '26.3'
const mcTexturesPkg = path.dirname(require.resolve('minecraft-textures/package.json'))
const mcTextureAssets = path.join(mcTexturesPkg, 'dist', 'textures', 'assets')
const manifest = JSON.parse(
  readFileSync(path.join(mcTexturesPkg, 'dist', 'textures', 'manifest', `${MC_VERSION}.json`), 'utf8'),
) as { items: { id: string; readable: string; texture: string }[] }
// 只处理 manifest 引用到的贴图（内容哈希去重），包内其余版本资产不进构建产物
const textureHashes = [...new Set(manifest.items.map((item) => item.texture))]
const textureHashSet = new Set(textureHashes)
// 贴图在站点内的公共路径；由本插件写入构建产物，与 public 目录无关
const MC_TEXTURES_ROUTE = 'mc-textures'

export function mcTextures(): Plugin {
  const virtualId = 'virtual:mc-textures'
  const resolvedId = '\0' + virtualId
  let resolvedConfig: ResolvedConfig | undefined
  return {
    name: 'mc-textures',
    configResolved(config) {
      resolvedConfig = config
    },
    // 开发服务器：直接流式返回 node_modules 内的 PNG，一次请求只打开一个文件
    configureServer(server) {
      const base = server.config.base.endsWith('/') ? server.config.base : `${server.config.base}/`
      const prefix = `${base}${MC_TEXTURES_ROUTE}/`
      server.middlewares.use((req, res, next) => {
        let pathname: string
        try {
          pathname = decodeURI(new URL(req.url ?? '/', 'http://localhost').pathname)
        } catch {
          return next()
        }
        if (!pathname.startsWith(prefix)) return next()
        const file = pathname.slice(prefix.length)
        if (!textureHashSet.has(file)) return next()
        res.setHeader('Content-Type', 'image/png')
        // 文件名即内容哈希，内容不会再变
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        createReadStream(path.join(mcTextureAssets, file)).on('error', next).pipe(res)
      })
    },
    // 构建：客户端产物写完后按顺序复制，避免并发打开上千个文件；SSR 构建的 outDir 是临时目录，跳过
    writeBundle() {
      if (!resolvedConfig || resolvedConfig.command !== 'build' || resolvedConfig.build.ssr) return
      const outDir = path.join(resolvedConfig.build.outDir, MC_TEXTURES_ROUTE)
      mkdirSync(outDir, { recursive: true })
      for (const hash of textureHashes) {
        copyFileSync(path.join(mcTextureAssets, hash), path.join(outDir, hash))
      }
    },
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      // URL 跟随 Vite base，站点部署在子路径时同样可用
      const base = resolvedConfig?.base ?? '/'
      const urls = textureHashes
        .map(
          (hash) =>
            `  ${JSON.stringify(hash)}: () => Promise.resolve(${JSON.stringify(`${base}${MC_TEXTURES_ROUTE}/${hash}`)}),`,
        )
        .join('\n')
      return [
        `const items = ${JSON.stringify(manifest.items)}`,
        `const urlLoaders = {\n${urls}\n}`,
        'export { items, urlLoaders }',
      ].join('\n')
    },
  }
}

/**
 * 字体保持为独立文件（按需异步加载），不以 base64 内联进 JS/CSS；
 * 返回 undefined 回落 Vite 默认的小文件内联判断，不影响站点其余资产。
 */
export function craftingAssetsInlineLimit(filePath: string): boolean | undefined {
  return filePath.replaceAll('\\', '/').includes('/fonts/') ? false : undefined
}
