// 站点共用配置统一出口。
// 基本信息 siteInfo / 全部链接 links / SEO 设置 seo / 全局横幅 banner / 导航栏 nav / 文档侧边栏 sidebar / 全站搜索 search / 管理团队轮播 staffCarousel。
// 客户端组件用相对路径引入（如 ../config），config.mts 用 ./theme/config。
// 注意：search.ts 另被 Node 构建脚本直读（scripts/build-search-index.ts），保持纯数据。

export * from './siteInfo'
export * from './links'
export * from './seo'
export * from './banner'
export * from './nav'
export * from './sidebar'
export * from './search'
export * from './staffCarousel'
