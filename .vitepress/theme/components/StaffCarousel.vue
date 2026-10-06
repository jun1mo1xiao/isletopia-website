<script setup lang="ts">
// 管理组成员轮播卡片（嵌入于 about.md「管理团队」，全局注册名 StaffCarousel）
// 成员数据来自项目根 staff/ 目录的 md frontmatter（Pages CMS「管理组成员」集合），
// 构建期由 Vite 读盘打包，CMS 改动后重新部署即生效。
// skinview3d 依赖 WebGL，只能在浏览器端初始化：动态 import 放在 onMounted 内，
// SSR 阶段仅渲染卡片骨架，不加载 three。
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseFrontmatter } from '../utils/articleFeed'

// 自动轮播间隔（ms），可通过 <StaffCarousel :interval="8000" /> 覆盖
const props = withDefaults(defineProps<{ interval?: number }>(), {
  interval: 5000
})

interface StaffMember {
  name: string
  role: string
  bio: string
  skin: string
  weight: number
}

// 成员 md 原文（?raw 由 Vite 直接读盘）；staff 条目少，构建期 eager 打包
const rawModules = import.meta.glob('/staff/*.md', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

const members: StaffMember[] = Object.values(rawModules)
  .map((raw) => {
    const { data } = parseFrontmatter(raw)
    return {
      name: String(data.name || ''),
      role: String(data.role || ''),
      bio: String(data.bio || ''),
      skin: String(data.skin || ''),
      weight: Number(data.weight) || 0
    }
  })
  .filter((m) => m.name)
  // weight 小者在前，同权重按名称排序，保证轮播顺序稳定
  .sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name, 'zh-Hans-CN'))

const count = members.length
const current = ref(0)
// 悬停 / 键盘聚焦时暂停自动轮播，方便阅读与拖拽 3D 形象
const paused = ref(false)

const currentMember = computed(
  () => members[current.value] ?? { name: '', role: '', bio: '', skin: '', weight: 0 }
)

function goTo(i: number) {
  if (count === 0) return
  current.value = ((i % count) + count) % count
  restartTimer()
}
function next() {
  goTo(current.value + 1)
}
function prev() {
  goTo(current.value - 1)
}

// —— 自动轮播 ——
let timer: number | null = null
function stopTimer() {
  if (timer !== null) {
    window.clearInterval(timer)
    timer = null
  }
}
function startTimer() {
  stopTimer()
  if (count <= 1) return
  timer = window.setInterval(() => {
    if (!paused.value) current.value = (current.value + 1) % count
  }, props.interval)
}
// 手动切换后重置计时，避免刚看完一位立刻被切走
function restartTimer() {
  if (timer !== null) startTimer()
}

onMounted(startTimer)

// —— skinview3d 3D 形象 ——
const stageRef = ref<HTMLElement | null>(null)
// 皮肤未配置或加载失败时显示占位提示
const skinMissing = ref(false)
type SkinViewer = import('skinview3d').SkinViewer
type Skinview3dModule = typeof import('skinview3d')
let viewer: SkinViewer | null = null
let observer: ResizeObserver | null = null
let disposed = false

function loadCurrentSkin() {
  if (!viewer) return
  const skin = currentMember.value.skin
  if (!skin) {
    viewer.loadSkin(null)
    skinMissing.value = true
    return
  }
  viewer
    .loadSkin(skin)
    .then(() => {
      skinMissing.value = false
    })
    .catch(() => {
      // 皮肤文件尚未上传（CMS 里还没传图）或路径有误：清空形象并提示
      viewer?.loadSkin(null)
      skinMissing.value = true
    })
}

onMounted(async () => {
  if (count === 0 || !stageRef.value) return
  let skinview3d: Skinview3dModule
  try {
    skinview3d = await import('skinview3d')
  } catch {
    return
  }
  // 等待动态导入期间组件可能已被卸载（VitePress 切页）
  if (disposed || !stageRef.value) return

  const stage = stageRef.value
  viewer = new skinview3d.SkinViewer({
    canvas: stage.querySelector('canvas')!,
    // 以舞台实际尺寸初始化；后续尺寸变化由 ResizeObserver 同步
    width: stage.clientWidth || 300,
    height: stage.clientHeight || 400,
    fov: 55,
    zoom: 0.85,
    animation: new skinview3d.IdleAnimation()
  })
  viewer.animation!.speed = 0.7
  viewer.autoRotate = true
  viewer.autoRotateSpeed = 1.5
  loadCurrentSkin()

  observer = new ResizeObserver(() => {
    if (!viewer || !stage.clientWidth || !stage.clientHeight) return
    viewer.setSize(stage.clientWidth, stage.clientHeight)
  })
  observer.observe(stage)
})

watch(current, loadCurrentSkin)

onBeforeUnmount(() => {
  disposed = true
  stopTimer()
  observer?.disconnect()
  observer = null
  viewer?.dispose()
  viewer = null
})
</script>

<template>
  <div
    v-if="count > 0"
    class="staff-carousel"
    role="region"
    aria-roledescription="轮播"
    aria-label="管理组成员"
    @mouseenter="paused = true"
    @mouseleave="paused = false"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div class="staff-carousel__card">
      <!-- 左：3D 虚拟形象（skinview3d 画布，背景透明） -->
      <div ref="stageRef" class="staff-carousel__stage">
        <canvas class="staff-carousel__canvas" aria-hidden="true"></canvas>
        <Transition name="staff-fade">
          <div v-if="skinMissing" class="staff-carousel__placeholder">
            皮肤待上传
          </div>
        </Transition>
      </div>

      <!-- 右：成员信息 -->
      <Transition name="staff-fade" mode="out-in">
        <div :key="current" class="staff-carousel__info">
          <h3 class="staff-carousel__name">{{ currentMember.name }}</h3>
          <span class="staff-carousel__role">{{ currentMember.role }}</span>
          <p class="staff-carousel__bio">{{ currentMember.bio }}</p>
        </div>
      </Transition>

      <!-- 左右切换箭头 -->
      <button
        v-if="count > 1"
        class="staff-carousel__arrow staff-carousel__arrow--prev"
        aria-label="上一位成员"
        @click="prev"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M15 5l-7 7 7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
      <button
        v-if="count > 1"
        class="staff-carousel__arrow staff-carousel__arrow--next"
        aria-label="下一位成员"
        @click="next"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            d="M9 5l7 7-7 7"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </button>
    </div>

    <!-- 底部圆点指示器 -->
    <div v-if="count > 1" class="staff-carousel__dots">
      <button
        v-for="(m, i) in members"
        :key="m.name"
        class="staff-carousel__dot"
        :class="{ 'is-active': i === current }"
        :aria-label="`查看第 ${i + 1} 位成员：${m.name}`"
        :aria-current="i === current"
        @click="goTo(i)"
      ></button>
    </div>
  </div>
</template>

<style scoped>
.staff-carousel {
  max-width: 760px;
  margin: 24px auto;
}

.staff-carousel__card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 28px 56px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  transition: border-color 0.25s;
}

.staff-carousel__card:hover {
  border-color: var(--vp-c-brand-1);
}

/* —— 3D 形象舞台 —— */
.staff-carousel__stage {
  position: relative;
  flex: 0 0 220px;
  height: 300px;
  border-radius: 10px;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  overflow: hidden;
}

.staff-carousel__canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.staff-carousel__placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: var(--vp-c-text-3);
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 12px,
    var(--vp-c-bg-soft) 12px,
    var(--vp-c-bg-soft) 24px
  );
}

/* —— 成员信息 —— */
.staff-carousel__info {
  flex: 1;
  min-width: 0;
}

.staff-carousel__name {
  margin: 0 0 10px;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.3;
  color: var(--vp-c-text-1);
  border-top: none;
}

.staff-carousel__role {
  display: inline-block;
  margin-bottom: 14px;
  padding: 3px 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.6;
  color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  border-radius: 999px;
}

.staff-carousel__bio {
  margin: 0;
  font-size: 15px;
  line-height: 1.8;
  color: var(--vp-c-text-2);
}

/* —— 切换箭头 —— */
.staff-carousel__arrow {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  color: var(--vp-c-text-2);
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 50%;
  cursor: pointer;
  transition:
    color 0.2s,
    border-color 0.2s;
}

.staff-carousel__arrow:hover {
  color: var(--vp-c-brand-1);
  border-color: var(--vp-c-brand-1);
}

.staff-carousel__arrow--prev {
  left: 12px;
}

.staff-carousel__arrow--next {
  right: 12px;
}

/* —— 圆点指示器 —— */
.staff-carousel__dots {
  display: flex;
  justify-content: center;
  gap: 10px;
  margin-top: 16px;
}

.staff-carousel__dot {
  width: 9px;
  height: 9px;
  padding: 0;
  background: var(--vp-c-divider);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition:
    background-color 0.2s,
    transform 0.2s;
}

.staff-carousel__dot:hover {
  background: var(--vp-c-text-3);
}

.staff-carousel__dot.is-active {
  background: var(--vp-c-brand-1);
  transform: scale(1.25);
}

/* —— 切换过渡：淡入 + 轻微上移 —— */
.staff-fade-enter-active,
.staff-fade-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.staff-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.staff-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* —— 窄屏：形象与信息上下排列 —— */
@media (max-width: 640px) {
  .staff-carousel__card {
    flex-direction: column;
    padding: 24px 48px 28px;
  }

  .staff-carousel__stage {
    flex-basis: auto;
    width: 200px;
    height: 280px;
  }

  .staff-carousel__info {
    width: 100%;
    text-align: center;
  }
}
</style>
