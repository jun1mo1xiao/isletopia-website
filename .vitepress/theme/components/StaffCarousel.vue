<script setup lang="ts">
// 管理组成员轮播卡片（嵌入于 about.md「管理团队」，全局注册名 StaffCarousel）
// 成员数据来自项目根 staff/ 目录的 md frontmatter（Pages CMS「管理组成员」集合），
// 构建期由 Vite 读盘打包，CMS 改动后重新部署即生效。
// 轮播方式为整页滑动：所有成员卡片排成一条横向轨道，整体 translateX 左移切换
// （皮肤预览随卡片一起滑动）。每个成员一个 skinview3d 实例，惰性创建——
// 首次滑到该页才建 WebGL 上下文；非当前页 renderPaused 暂停渲染循环，避免多开空转。
// skinview3d 依赖 WebGL，只能在浏览器端初始化：动态 import 放在 onMounted 内，
// SSR 阶段仅渲染卡片骨架，不加载 three。
// skinview3d 只用它的形象与渲染，动作数据换成 Blockbench 导出的
// animations/*.animation.json（播放器见 utils/blockbenchAnimation）。
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { parseFrontmatter, type YamlValue } from '../utils/articleFeed'
import {
  CAMERA_PITCH_DEG,
  CAMERA_YAW_DEG,
  CAROUSEL_INTERVAL_MS,
  DEFAULT_ENTRANCE_SPEED,
  DEFAULT_IDLE_SPEED,
  ENTRANCE_BLEND_SECONDS,
  ENTRANCE_DELAY_MS,
  ORTHO_LIKE_FOV,
  ORTHO_LIKE_ZOOM
} from '../config'
import {
  BlockbenchAnimation,
  compileAnimation,
  type CompiledAnimation,
  type RigAnimation,
  type RigNode
} from '../utils/blockbenchAnimation'

// 自动轮播间隔：不传就用站点配置 CAROUSEL_INTERVAL_MS，
// 可通过 <StaffCarousel :interval="8000" /> 覆盖
const props = defineProps<{ interval?: number }>()

// 动作配置整体收在 frontmatter 的 animation 节点下，分入场与待机两段，
// 各自的 name（动画文件名，即 animations/<name>.animation.json）与 speed 互不影响。
// 入场动作只播一整段（动画自身的长度，文件里写着循环也照样只播一圈），
// 播完就混合到待机动作，所以没有「播放时长」可填
interface StaffAnimation {
  entrance: { name: string; speed: number }
  idle: { name: string; speed: number }
}

interface StaffMember {
  name: string
  role: string
  bio: string
  skin: string
  weight: number
  animation: StaffAnimation
}

// 留空或非法值回退默认值（默认倍数见 config/staffCarousel.ts）
function parseNumber(raw: unknown, fallback: number, min: number): number {
  const text = String(raw ?? '').trim()
  if (!text) return fallback
  const n = Number(text)
  return Number.isFinite(n) && n >= min ? n : fallback
}

const asRecord = (raw: unknown): Record<string, YamlValue> =>
  raw && typeof raw === 'object' && !Array.isArray(raw)
    ? (raw as Record<string, YamlValue>)
    : {}

const asName = (raw: YamlValue | undefined, fallback: string): string =>
  (typeof raw === 'string' && raw.trim()) || fallback

function parseAnimation(raw: unknown): StaffAnimation {
  const root = asRecord(raw)
  const entrance = asRecord(root.entrance)
  const idle = asRecord(root.idle)
  return {
    entrance: {
      // 留空即无入场动作，一直保持待机
      name: asName(entrance.name, 'none'),
      // 下限 0.01 而不是 0：入场动作必须播完一整段，速度填 0 会永远停在起始姿势
      speed: parseNumber(entrance.speed, DEFAULT_ENTRANCE_SPEED, 0.01)
    },
    idle: {
      name: asName(idle.name, 'idle'),
      // 待机可以显式填 0，等于定格在待机动画的起始姿势
      speed: parseNumber(idle.speed, DEFAULT_IDLE_SPEED, 0)
    }
  }
}

// —— 动作数据：项目根 animations/<名字>.animation.json（Blockbench 导出的 Bedrock 动画格式） ——
// 构建期 eager 打包成 JSON 对象，文件名（去掉后缀）即 CMS 里可填的动作名，
// 新增动作只要往目录里放一个文件，不用改代码
const animationFiles = import.meta.glob('/animations/*.animation.json', {
  import: 'default',
  eager: true
}) as Record<string, unknown>

const compiledAnimations: Record<string, CompiledAnimation> = {}
for (const [path, json] of Object.entries(animationFiles)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -'.animation.json'.length)
  const compiled = compileAnimation(json, name)
  if (compiled) compiledAnimations[name] = compiled
  else console.warn(`[StaffCarousel] ${path} 不是可用的动画，已忽略`)
}

// 动作名 -> 动画实例。name 取值与 .pages.yml 里
// staff.animation.entrance.name / staff.animation.idle.name 的下拉一致，
// 认不出来的动作回退到 idle 文件，避免 CMS 填错就把形象搞没了；
// 'none' 由调用方当作「没有动作」处理。once 用于入场：只播一整段，文件里写着循环也照样只播一圈
function createAnimation(name: string, once: boolean): RigAnimation | null {
  const animation = compiledAnimations[name] ?? compiledAnimations.idle
  if (!animation) return null
  return new BlockbenchAnimation(animation, once)
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
      weight: Number(data.weight) || 0,
      animation: parseAnimation(data.animation)
    }
  })
  .filter((m) => m.name)
  // weight 小者在前，同权重按名称排序，保证轮播顺序稳定
  .sort((a, b) => a.weight - b.weight || a.name.localeCompare(b.name, 'zh-Hans-CN'))

const count = members.length
const current = ref(0)
// 悬停 / 键盘聚焦时暂停自动轮播，方便读完一段简介
const paused = ref(false)
// 每位成员的皮肤加载状态（未配置 / 加载失败 → 显示占位提示）
const skinMissing = ref<boolean[]>(members.map(() => false))
// 指示器用的 2D 头像（底脸 + 帽层合成后的 data URL；未生成时显示占位方块）
const faceUrls = ref<string[]>(members.map(() => ''))

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`无法加载皮肤：${src}`))
    img.src = src
  })
}

// 从皮肤贴图抠出头部正面 8x8，再叠上第二层（帽层）。
// 皮肤布局：底脸 (8,8)、帽层脸 (40,8)；64x32 旧格式帽层坐标相同，
// 贴图过小（容不下帽层）时只取底层，避免越界取样
function composeFace(img: HTMLImageElement): string | null {
  const size = 8
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingEnabled = false
  ctx.drawImage(img, 8, 8, size, size, 0, 0, size, size)
  if (img.width >= 48 && img.height >= 16) {
    ctx.drawImage(img, 40, 8, size, size, 0, 0, size, size)
  }
  return canvas.toDataURL('image/png')
}

async function loadFace(i: number) {
  const skin = members[i].skin
  if (!skin) return
  try {
    const img = await loadImage(skin)
    const url = composeFace(img)
    if (url) faceUrls.value[i] = url
  } catch {
    // 与 3D 形象共用同一套皮肤：加载失败时保留占位，由 skinMissing 提示
  }
}

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
  }, props.interval ?? CAROUSEL_INTERVAL_MS)
}
// 手动切换后重置计时，避免刚看完一位立刻被切走
function restartTimer() {
  if (timer !== null) startTimer()
}

// —— skinview3d 3D 形象（每页一个，惰性创建 + 离页暂停） ——
type SkinViewer = import('skinview3d').SkinViewer
type Skinview3dModule = typeof import('skinview3d')
const stageEls: (HTMLElement | null)[] = []
const viewers: (SkinViewer | null)[] = []
const observers: (ResizeObserver | null)[] = []
let skinview3d: Skinview3dModule | null = null
let disposed = false

function setStageRef(i: number, el: unknown) {
  stageEls[i] = (el as HTMLElement | null) ?? null
}

function loadSkin(i: number) {
  const viewer = viewers[i]
  if (!viewer) return
  const skin = members[i].skin
  if (!skin) {
    viewer.loadSkin(null)
    skinMissing.value[i] = true
    return
  }
  viewer
    .loadSkin(skin)
    .then(() => {
      skinMissing.value[i] = false
    })
    .catch(() => {
      // 皮肤文件尚未上传（CMS 里还没传图）或路径有误：清空形象并提示
      viewer.loadSkin(null)
      skinMissing.value[i] = true
    })
}

// 取景（ORTHO_LIKE_FOV / ORTHO_LIKE_ZOOM）与相机朝向（CAMERA_YAW_DEG / CAMERA_PITCH_DEG）
// 都是站点配置，见 config/staffCarousel.ts

// 沿指定方向重摆相机。距离取 skinview3d 已按 fov/zoom 算好的值，只改方向不改距离，
// 取景大小因此不变；朝向由 OrbitControls.update() 按 target 重新 lookAt
function applyCamera(viewer: SkinViewer, yawDeg: number, pitchDeg: number) {
  const yaw = (yawDeg * Math.PI) / 180
  const pitch = (pitchDeg * Math.PI) / 180
  const d = viewer.camera.position.length()
  viewer.camera.position.set(
    d * Math.sin(yaw) * Math.cos(pitch),
    d * Math.sin(pitch),
    d * Math.cos(yaw) * Math.cos(pitch)
  )
  viewer.controls.target.set(0, 0, 0)
  viewer.controls.update()
}

function setCameraPose(viewer: SkinViewer) {
  applyCamera(viewer, CAMERA_YAW_DEG, CAMERA_PITCH_DEG)
}

// —— 拖拽旋转视角（鼠标左键 / 触摸）：按住拖动改朝向，松开平滑复原 ——
// OrbitControls 的 enableRotate 保持关闭，改由指针事件自己改 yaw/pitch：
// 这样松手一定能回到站点配置的默认机位，不会被控件的惯性甩歪。
const DRAG_ROTATE_DEG_PER_PX = 0.35
const PITCH_LIMIT_DEG = 75
const RESET_MS = 280

interface DragState {
  pointerId: number
  x: number
  y: number
  yaw: number
  pitch: number
}

const dragStates = new Map<number, DragState>()
const resetRafs = new Map<number, number>()

function clamp(v: number, min: number, max: number) {
  return v < min ? min : v > max ? max : v
}

function cancelCameraReset(i: number) {
  const raf = resetRafs.get(i)
  if (raf !== undefined) {
    cancelAnimationFrame(raf)
    resetRafs.delete(i)
  }
}

function cameraAngles(viewer: SkinViewer): { yaw: number; pitch: number } {
  const p = viewer.camera.position
  const d = p.length() || 1
  return {
    yaw: (Math.atan2(p.x, p.z) * 180) / Math.PI,
    pitch: (Math.asin(clamp(p.y / d, -1, 1)) * 180) / Math.PI
  }
}

function animateCameraHome(i: number) {
  const viewer = viewers[i]
  if (!viewer) return
  cancelCameraReset(i)
  const from = cameraAngles(viewer)
  // yaw 走最短弧，避免复原时多转一整圈
  let dy = ((CAMERA_YAW_DEG - from.yaw + 540) % 360) - 180
  const dp = CAMERA_PITCH_DEG - from.pitch
  const t0 = performance.now()
  const step = () => {
    const live = viewers[i]
    if (!live) {
      resetRafs.delete(i)
      return
    }
    const k = clamp((performance.now() - t0) / RESET_MS, 0, 1)
    const ease = 1 - (1 - k) ** 3
    applyCamera(live, from.yaw + dy * ease, from.pitch + dp * ease)
    if (k < 1) resetRafs.set(i, requestAnimationFrame(step))
    else {
      resetRafs.delete(i)
      setCameraPose(live)
    }
  }
  resetRafs.set(i, requestAnimationFrame(step))
}

function onStagePointerDown(i: number, e: PointerEvent) {
  // 只响应主指针（鼠标左键 / 第一根手指）
  if (!e.isPrimary) return
  if (e.pointerType === 'mouse' && e.button !== 0) return
  const stage = e.currentTarget as HTMLElement
  const viewer = viewers[i]
  if (!viewer) return
  cancelCameraReset(i)
  stage.setPointerCapture(e.pointerId)
  const from = cameraAngles(viewer)
  dragStates.set(i, {
    pointerId: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    yaw: from.yaw,
    pitch: from.pitch
  })
  // 拖拽中暂停自动轮播，避免视角刚转就被切走
  paused.value = true
}

function onStagePointerMove(i: number, e: PointerEvent) {
  const drag = dragStates.get(i)
  if (!drag || drag.pointerId !== e.pointerId) return
  const viewer = viewers[i]
  if (!viewer) return
  const dx = e.clientX - drag.x
  const dy = e.clientY - drag.y
  drag.x = e.clientX
  drag.y = e.clientY
  // 增量取负：拖拽方向与视角转动方向一致（向右拖则视角向右转，向上拖则视角向上抬）
  drag.yaw -= dx * DRAG_ROTATE_DEG_PER_PX
  drag.pitch = clamp(drag.pitch + dy * DRAG_ROTATE_DEG_PER_PX, -PITCH_LIMIT_DEG, PITCH_LIMIT_DEG)
  applyCamera(viewer, drag.yaw, drag.pitch)
}

function onStagePointerUp(i: number, e: PointerEvent) {
  const drag = dragStates.get(i)
  if (!drag || drag.pointerId !== e.pointerId) return
  dragStates.delete(i)
  const stage = e.currentTarget as HTMLElement
  if (stage.hasPointerCapture(e.pointerId)) stage.releasePointerCapture(e.pointerId)
  // 松开即复原默认机位
  animateCameraHome(i)
  // 触摸没有 hover：抬手后恢复自动轮播；
  // 鼠标若拖拽期间已离开轮播（pointer capture 不触发 mouseleave），这里补一次
  if (e.pointerType !== 'mouse' || !document.querySelector('.staff-carousel:hover')) {
    paused.value = false
  }
}

function onCarouselLeave() {
  // 拖拽尚未结束时保持暂停，避免 capture 期间 mouseleave 把自动轮播打开
  if (dragStates.size === 0) paused.value = false
}

// —— 入场动作 → 待机动作 两段式播放 ——
// 入场动作只播一整段（一次性的挥手、挥击、下蹲、起飞），时长由动画文件自己决定；
// 切到该成员（或双击形象）后先按待机动作原地等 ENTRANCE_DELAY_MS，才开始播入场动作；
// 播完进入混合期（过渡时长按站点配置 ENTRANCE_BLEND_SECONDS，全体成员统一）：
// 每帧把两个动画各摆一遍姿势，再对整棵子树逐节点插值过渡到待机动作，
// 之后待机一直保持。

type PlayerRig = import('skinview3d').PlayerObject

interface PoseState {
  phase: 'entrance' | 'blend' | 'idle'
  entrance: RigAnimation | null
  idle: RigAnimation
  /** 入场动作开播前的剩余等待时间（秒），每次（重）播入场时按站点配置初始化 */
  delay: number
  /** 混合进度 0~1 */
  blend: number
  /** 参与插值的节点（首帧从形象子树收集） */
  nodes: RigNode[] | null
  /** 混合期两趟姿势快照，每个节点 6 个分量（position + rotation） */
  from: number[]
  to: number[]
}

const poses: (PoseState | null)[] = []

// 整棵子树逐节点插值：动画写入的骨骼除了六个肢体，还可能是整体（root）、cape、elytra，
// 改动会连带传到下属节点，只挑几个刚体插的话，其余节点会在混合起点直接跳到待机姿势
function collectRigNodes(player: PlayerRig): RigNode[] {
  const nodes: RigNode[] = []
  player.traverse((node) => nodes.push(node as unknown as RigNode))
  return nodes
}

// resetJoints 会把肢体/pivot/cape/elytra 全部摆回绑定姿势，但不含整体变换，
// 所以整体位移和朝向要自己清回原点
function resetRig(player: PlayerRig) {
  player.resetJoints()
  player.position.set(0, 0, 0)
  player.rotation.set(0, 0, 0)
}

function capturePose(nodes: RigNode[], out: number[]) {
  let n = 0
  for (const node of nodes) {
    out[n++] = node.position.x
    out[n++] = node.position.y
    out[n++] = node.position.z
    out[n++] = node.rotation.x
    out[n++] = node.rotation.y
    out[n++] = node.rotation.z
  }
}

// 角度归到 (-π, π]
function wrapAngle(rad: number) {
  return Math.atan2(Math.sin(rad), Math.cos(rad))
}

function easeInOut(k: number) {
  return k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2
}

// 角度按最短弧插值，位移按线性插值——两者绝不能混用一个插值函数：
// 把 wrap 套到位移上等于把差值折进 ±π，蹲下这种超过 3 单位的位移会被掰到反方向，
// 混合结束时姿势是错的，切到纯待机的那一帧就「啪」地弹一下。
// 角度必须绕最短弧：动画里的角度是以弧度直接写在节点上的，绑定姿势上就有 cape 的
// rotation.y = π，照原值线性插值等于让披风多转一整圈。
function mixPose(nodes: RigNode[], a: number[], b: number[], k: number) {
  let n = 0
  const lerp = (j: number) => a[j] + (b[j] - a[j]) * k
  const slerp = (j: number) => a[j] + wrapAngle(b[j] - a[j]) * k
  for (const node of nodes) {
    node.position.set(lerp(n), lerp(n + 1), lerp(n + 2))
    node.rotation.set(slerp(n + 3), slerp(n + 4), slerp(n + 5))
    n += 6
  }
}

function createPose(m: StaffMember): PoseState | null {
  const { entrance: ent, idle: idleCfg } = m.animation
  const idle = createAnimation(idleCfg.name, false)
  if (!idle) return null
  // 入场动作只播一整段，播多久由动画文件自己的长度决定
  const entrance = ent.name === 'none' ? null : createAnimation(ent.name, true)
  // 入场与待机各自按自己的速度播放，改待机速度不会连带改变入场快慢
  idle.speed = idleCfg.speed
  if (entrance) entrance.speed = ent.speed
  return {
    phase: entrance ? 'entrance' : 'idle',
    entrance,
    idle,
    delay: ENTRANCE_DELAY_MS / 1000,
    blend: 0,
    nodes: null,
    from: [],
    to: []
  }
}

// 每帧的姿势调度，由下面挂到 viewer 上的 FunctionAnimation 回调驱动
function updatePose(i: number, player: PlayerRig, rawDt: number) {
  const s = poses[i]
  if (!s) return
  if (!s.nodes) {
    const nodes = collectRigNodes(player)
    s.nodes = nodes
    s.from = new Array(nodes.length * 6).fill(0)
    s.to = new Array(nodes.length * 6).fill(0)
  }
  const nodes = s.nodes
  // 切回后台标签页后 rAF 会攒出一个巨大的帧间隔，不截断的话入场和混合会在同一帧内直接跑完
  const dt = Math.min(rawDt, 0.1)
  if (s.phase === 'entrance' && s.entrance) {
    // 开播前的等待：这段时间形象只按待机动作原地站着，入场动画一秒都不推进
    if (s.delay > 0) {
      s.delay -= dt
      resetRig(player)
      s.idle.update(player, dt)
      return
    }
    resetRig(player)
    s.entrance.update(player, dt)
    // 入场动画自己报「一整段播完了」，才交棒给待机
    if (s.entrance.done) {
      s.phase = 'blend'
      s.blend = 0
    }
    return
  }
  if (s.phase === 'blend' && s.entrance) {
    // 配置填 0 表示瞬间切换；直接除以 0 会在 dt 为 0 的那一帧算出 NaN，所以显式分支
    s.blend = Math.min(
      1,
      s.blend + (ENTRANCE_BLEND_SECONDS > 0 ? dt / ENTRANCE_BLEND_SECONDS : 1)
    )
    resetRig(player)
    s.entrance.update(player, dt)
    capturePose(nodes, s.from)
    resetRig(player)
    s.idle.update(player, dt)
    capturePose(nodes, s.to)
    mixPose(nodes, s.from, s.to, easeInOut(s.blend))
    if (s.blend >= 1) {
      s.phase = 'idle'
      s.entrance = null
    }
    return
  }
  resetRig(player)
  s.idle.update(player, dt)
}

// 重播入场动作（双击形象、以及轮播切到该成员时调用）
function playEntrance(i: number) {
  const s = poses[i]
  if (!s) return
  const entranceCfg = members[i].animation.entrance
  if (entranceCfg.name === 'none') {
    s.phase = 'idle'
    s.entrance = null
    return
  }
  // 每次重播都新建实例，progress 从 0 开始，一整段重新走一遍
  const entrance = createAnimation(entranceCfg.name, true)
  if (!entrance) return
  entrance.speed = entranceCfg.speed
  s.entrance = entrance
  s.delay = ENTRANCE_DELAY_MS / 1000
  s.blend = 0
  s.phase = 'entrance'
}

async function ensureViewer(i: number) {
  if (!stageEls[i]) return
  if (viewers[i]) {
    // 已有实例：恢复渲染循环即可
    viewers[i]!.renderPaused = false
    return
  }
  try {
    skinview3d ||= await import('skinview3d')
  } catch {
    return
  }
  if (disposed) return
  const stage = stageEls[i]!
  // 动画目录缺 idle 时 createPose 返回 null，形象按绑定姿势静止显示
  poses[i] = createPose(members[i])
  // FunctionAnimation 只当作「每帧回调」用：真正的两段式调度在 updatePose 里。
  // 它自身 speed 保持 1，回调拿到的就是未经缩放的真实帧间隔，入场/待机各自按配置速度推进
  const animation = new skinview3d.FunctionAnimation((player, _progress, dt) =>
    updatePose(i, player, dt)
  )
  const viewer = new skinview3d.SkinViewer({
    canvas: stage.querySelector('canvas')!,
    // 以舞台实际尺寸初始化；后续尺寸变化由 ResizeObserver 同步
    width: stage.clientWidth || 300,
    height: stage.clientHeight || 400,
    fov: ORTHO_LIKE_FOV,
    zoom: ORTHO_LIKE_ZOOM,
    animation
  })
  // 不自动旋转（skinview3d 的 autoRotate 转的是人物而非相机），只保留所选动作本身
  viewer.autoRotate = false
  // 转视角由阶段上的指针拖拽自己改 yaw/pitch（松手复原），控件只保留 target 更新；
  // 锁掉控件自带的旋转与缩放，避免两套逻辑抢相机、滚轮把画面拽远
  viewer.controls.enableRotate = false
  viewer.controls.enableZoom = false
  setCameraPose(viewer)
  const observer = new ResizeObserver(() => {
    if (stage.clientWidth && stage.clientHeight) {
      viewer.setSize(stage.clientWidth, stage.clientHeight)
    }
  })
  observer.observe(stage)
  observers[i] = observer
  viewers[i] = viewer
  loadSkin(i)
}

watch(current, (now, before) => {
  // 离开当前页时暂停其渲染循环，GPU 只为可见页工作
  if (viewers[before]) viewers[before]!.renderPaused = true
  // 切到的这一位重走一遍入场 → 待机。viewer 首次创建时 createPose 本就停在入场阶段，
  // 等 ensureViewer 落定再触发，让「新建」和「已存在」两种情况表现一致
  ensureViewer(now).then(() => playEntrance(now))
})

onMounted(() => {
  startTimer()
  ensureViewer(0)
  // 指示器头像只需贴图本身，不依赖 WebGL，启动时全部合成好
  members.forEach((_, i) => loadFace(i))
})

onBeforeUnmount(() => {
  disposed = true
  stopTimer()
  dragStates.clear()
  for (const i of resetRafs.keys()) cancelCameraReset(i)
  observers.forEach((o) => o?.disconnect())
  observers.length = 0
  viewers.forEach((v) => v?.dispose())
  viewers.length = 0
  poses.length = 0
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
    @mouseleave="onCarouselLeave"
    @focusin="paused = true"
    @focusout="paused = false"
  >
    <div class="staff-carousel__viewport">
      <!-- 滑动轨道：所有成员卡片并排，整体左移完成切换（皮肤预览随页滑动） -->
      <div
        class="staff-carousel__track"
        :style="{ transform: `translateX(-${current * 100}%)` }"
      >
        <div
          v-for="(m, i) in members"
          :key="m.name"
          class="staff-carousel__slide"
          :aria-hidden="i !== current"
        >
          <!-- 左：3D 虚拟形象（skinview3d 画布，背景透明，与卡片融为一体）。
               拖拽旋转视角，松开自动复原；双击重播入场动作 -->
          <div
            :ref="(el) => setStageRef(i, el)"
            class="staff-carousel__stage"
            title="拖拽旋转视角，松开自动复原；双击重播动作"
            @pointerdown="onStagePointerDown(i, $event)"
            @pointermove="onStagePointerMove(i, $event)"
            @pointerup="onStagePointerUp(i, $event)"
            @pointercancel="onStagePointerUp(i, $event)"
            @lostpointercapture="onStagePointerUp(i, $event)"
            @dblclick="playEntrance(i)"
          >
            <canvas class="staff-carousel__canvas" aria-hidden="true"></canvas>
            <Transition name="staff-fade">
              <div v-if="skinMissing[i]" class="staff-carousel__placeholder">
                皮肤待上传
              </div>
            </Transition>
          </div>

          <!-- 右：成员信息 -->
          <div class="staff-carousel__info">
            <h3 class="staff-carousel__name">{{ m.name }}</h3>
            <span class="staff-carousel__role">{{ m.role }}</span>
            <p class="staff-carousel__bio">{{ m.bio }}</p>
          </div>
        </div>
      </div>

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

      <!-- 头像指示器（位于卡片内部底部）：当前页彩色放大，其余灰阶原尺寸 -->
      <div v-if="count > 1" class="staff-carousel__dots">
        <button
          v-for="(m, i) in members"
          :key="m.name"
          class="staff-carousel__dot"
          :class="{ 'is-active': i === current }"
          :aria-label="`查看第 ${i + 1} 位成员：${m.name}`"
          :aria-current="i === current"
          @click="goTo(i)"
        >
          <img
            v-if="faceUrls[i]"
            class="staff-carousel__face"
            :src="faceUrls[i]"
            :alt="`${m.name} 的皮肤头像`"
            width="8"
            height="8"
          />
          <span v-else class="staff-carousel__face staff-carousel__face--empty"></span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.staff-carousel {
  max-width: 760px;
  margin: 24px auto;
}

.staff-carousel__viewport {
  position: relative;
  background: var(--vp-c-bg);
  border: 1px solid var(--vp-c-divider);
  border-radius: 14px;
  overflow: hidden;
  transition: border-color 0.25s;
}

.staff-carousel__viewport:hover {
  border-color: var(--vp-c-brand-1);
}

.staff-carousel__track {
  display: flex;
  transition: transform 0.45s cubic-bezier(0.33, 1, 0.68, 1);
}

.staff-carousel__slide {
  flex: 0 0 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 28px;
  /* 内边距放在每页自身而非视口：overflow 只裁到视口边界，
     相邻页（连同其 padding）在静止与滑动过程中都不会从边缘露出；
     底部留出头像指示器高度，避免文字被盖住 */
  padding: 28px 56px 52px;
}

/* —— 3D 形象舞台：透明背景，与卡片背景保持一致；拖拽旋转、双击重播 —— */
.staff-carousel__stage {
  position: relative;
  flex: 0 0 220px;
  height: 300px;
  cursor: grab;
  /* 拖拽改视角需要独占手势，避免触摸时页面跟着滚动 */
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.staff-carousel__stage:active {
  cursor: grabbing;
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
    var(--vp-c-bg) 12px,
    var(--vp-c-bg) 24px
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

/* —— 头像指示器（卡片内部底部居中） —— */
.staff-carousel__dots {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 1;
}

.staff-carousel__dot {
  /* 外框固定 32px，头像在内部 24↔32 缩放，切换时圆点行不发生位移 */
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
}

.staff-carousel__face {
  display: block;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  /* 8x8 像素脸：只允许整数倍放大，避免半像素发糊 */
  image-rendering: pixelated;
  /* 未轮到：黑白色、正常大小 */
  filter: grayscale(1);
  transition:
    width 0.25s ease,
    height 0.25s ease,
    filter 0.25s ease;
  pointer-events: none;
}

.staff-carousel__face--empty {
  background: var(--vp-c-bg);
  box-shadow: inset 0 0 0 1px var(--vp-c-divider);
}

.staff-carousel__dot:hover .staff-carousel__face {
  filter: grayscale(0.45);
}

/* 轮到当前页：彩色并放大一点（24px → 32px，整数倍） */
.staff-carousel__dot.is-active .staff-carousel__face {
  width: 32px;
  height: 32px;
  filter: grayscale(0);
}

.staff-carousel__dot.is-active:hover .staff-carousel__face {
  filter: grayscale(0);
}

/* —— 占位提示淡入淡出 —— */
.staff-fade-enter-active,
.staff-fade-leave-active {
  transition: opacity 0.28s ease;
}

.staff-fade-enter-from,
.staff-fade-leave-to {
  opacity: 0;
}

/* —— 窄屏：形象与信息上下排列 —— */
@media (max-width: 640px) {
  .staff-carousel__slide {
    flex-direction: column;
    padding: 24px 48px 50px;
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
