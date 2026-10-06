// https://vitepress.dev/guide/custom-theme
import type { Theme } from 'vitepress'
import { inBrowser } from 'vitepress'
import DefaultTheme, { VPButton } from 'vitepress/theme'
import Layout from './Layout.vue'
import VideoBackground from './components/VideoBackground.vue'
import CopyIp from './components/CopyIp.vue'
import HomeIntro from './components/HomeIntro.vue'
import HomeFeatures from './components/HomeFeatures.vue'
import HomeSteps from './components/HomeSteps.vue'
import ReviewWall from './components/ReviewWall.vue'
import QqJoinButton from './components/QqJoinButton.vue'
import QrTooltip from './components/QrTooltip.vue'
import SocialLinks from './components/SocialLinks.vue'
import NewsFeed from './components/NewsFeed.vue'
import HeroTagline from './components/HeroTagline.vue'
import CraftingPage from './components/CraftingPage.vue'
import StaffCarousel from './components/StaffCarousel.vue'
import SearchBox from './search/SearchBox.vue'
// @ts-ignore -- 该包无类型声明
import busuanzi from 'busuanzi.pure.js'
import './style.css'

declare global {
  interface Window {
    // 不蒜子实例，供页脚调用 fetch() 刷新统计数字
    busuanzi: { fetch: () => void }
  }
}

export default {
  extends: DefaultTheme,
  // 本版（2.0 alpha）不会自动拾取 theme/Layout.vue，需显式覆盖
  Layout,
  enhanceApp({ app, router }) {
    // 全局注册，供 markdown（index.md）直接使用
    app.component('VideoBackground', VideoBackground)
    app.component('CopyIp', CopyIp)
    app.component('HomeIntro', HomeIntro)
    app.component('HomeFeatures', HomeFeatures)
    app.component('HomeSteps', HomeSteps)
    app.component('ReviewWall', ReviewWall)
    app.component('QqJoinButton', QqJoinButton)
    app.component('QrTooltip', QrTooltip)
    app.component('SocialLinks', SocialLinks)
    app.component('NewsFeed', NewsFeed)
    app.component('HeroTagline', HeroTagline)
    app.component('CraftingPage', CraftingPage)
    app.component('StaffCarousel', StaffCarousel)
    app.component('SearchBox', SearchBox)
    app.component('VPButton', VPButton)

    // 首页导航栏夜间配色只在覆盖全屏视频区域时生效：
    // 滚动监听维护 html.home-over-video，滚出视频区后 CSS 回落到原版自适应明暗
    if (!inBrowser) return

    // 全局暴露不蒜子，供页脚在挂载后 / 路由切换时调用 fetch 刷新数字
    window.busuanzi = busuanzi

    // —— 切换阈值（px），唯一微调处 ——
    // 视频底边距视口顶部的距离大于该值时保持夜间配色：
    //   0    = 视频完全滚出视口顶部才切回原版（默认）
    //   > 0  = 提前切换，如 80 = 视频还剩 80px 可见时就切回
    //   < 0  = 推迟切换，如 -40 = 视频滚出顶部 40px 后才切回
    const NIGHT_STYLE_THRESHOLD = 80

    const root = document.documentElement
    let ticking = false
    const sync = () => {
      ticking = false
      const hero = document.querySelector<HTMLElement>('.video-background')
      root.classList.toggle(
        'home-over-video',
        !!hero && hero.getBoundingClientRect().bottom > NIGHT_STYLE_THRESHOLD
      )
    }
    const onScroll = () => {
      if (!ticking) {
        ticking = true
        requestAnimationFrame(sync)
      }
    }
    sync()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })

    // 路由切换时重同步：切页后路由在 nextTick 里 scrollTo(0,0)，若用户已在顶部
    // 则无 scroll 事件，仅靠滚动监听无法补回首页的 home-over-video 类。
    // rAF 等 Vue 提交新页面 DOM 后再 sync，保证读到新页的 .video-background。
    router.onAfterRouteChange = () => {
      requestAnimationFrame(sync)
    }
  }
} satisfies Theme
