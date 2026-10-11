// Blockbench 导出的 .animation.json（Bedrock 动画格式）播放器。
//
// 站点不再使用 skinview3d 内置动作：动作数据全部来自项目根 animations/ 目录下的
// <名字>.animation.json，由 Blockbench「导出动画」得到，或由
// scripts/bake-animations.mjs 从旧的 skinview3d 动作转换而来。
//
// 支持的文件形状：
//   { format_version, animations: { "animation.xxx": { loop, animation_length, bones } } }
// 也兼容把单个动画对象直接放在顶层、用 animators 代替 bones、
// 以及关键帧写成 { "vector": [x, y, z] } 的形式（Blockbench 内部序列化的样子）。
// 未识别的通道（scale、音效、粒子、Molang 表达式等）忽略；关键帧之间线性插值，
// step / catmullrom 等插值模式不特殊处理。
//
// 坐标系换算（Bedrock 文件空间 -> skinview3d 的 three.js 空间）：
//   Bedrock 的 Y 轴朝下、Z 轴朝模型背后，skinview3d 是 Y 朝上、Z 朝脸（人物面向 +Z），
//   两者相差一个绕 X 轴 180° 的旋转，所以位置和旋转都取 (x, -y, -z)，
//   旋转另外把度数换成弧度。这条映射是自身的逆运算，正反向共用即可。
import type { PlayerObject } from 'skinview3d'

const DEG_TO_RAD = Math.PI / 180

/** 只用到 position / rotation 两个属性，避免为此直接依赖 three 的类型 */
export interface RigNode {
  position: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
  rotation: { x: number; y: number; z: number; set(x: number, y: number, z: number): void }
}

/** 归一化后的骨骼名 -> 形象上的节点。取不到就当作不存在的骨骼跳过 */
const BONES: Record<string, (player: PlayerObject) => RigNode> = {
  head: (p) => p.skin.head as unknown as RigNode,
  body: (p) => p.skin.body as unknown as RigNode,
  rightarm: (p) => p.skin.rightArm as unknown as RigNode,
  leftarm: (p) => p.skin.leftArm as unknown as RigNode,
  rightleg: (p) => p.skin.rightLeg as unknown as RigNode,
  leftleg: (p) => p.skin.leftLeg as unknown as RigNode,
  cape: (p) => p.cape as unknown as RigNode,
  elytra: (p) => p.elytra as unknown as RigNode,
  leftelytra: (p) => p.elytra.leftWing as unknown as RigNode,
  leftwing: (p) => p.elytra.leftWing as unknown as RigNode,
  rightelytra: (p) => p.elytra.rightWing as unknown as RigNode,
  rightwing: (p) => p.elytra.rightWing as unknown as RigNode,
  // 整体变换：跑跳的起伏、飞翔的倾倒、游泳的下潜
  root: (p) => p as unknown as RigNode,
  global: (p) => p as unknown as RigNode,
  player: (p) => p as unknown as RigNode
}

const normalizeBone = (key: string) => key.toLowerCase().replace(/[^a-z]/g, '')

function resolveBone(player: PlayerObject, key: string): RigNode | null {
  const pick = BONES[normalizeBone(key)]
  return pick ? pick(player) : null
}

/** 只判断骨骼名认不认得，不碰形象对象 */
const isKnownBone = (key: string) => normalizeBone(key) in BONES

type ChannelName = 'rotation' | 'position'

interface Track {
  /** 关键帧时间（秒），升序；空数组表示整段用同一个值 */
  times: number[]
  /** 与 times 对齐的三分量增量，已换算到 skinview3d 坐标系 */
  values: number[]
}

interface BoneChannel {
  bone: string
  channel: ChannelName
  track: Track
}

/** 编译后的动画：只留下 skinview3d 形象能落地的通道 */
export interface CompiledAnimation {
  /** 一周期长度（秒） */
  length: number
  /** true 循环播放；false 播到最后一帧停住 */
  loop: boolean
  channels: BoneChannel[]
}

/** 动画的最小契约，推进方式与 skinview3d 的 PlayerAnimation 一致：speed 缩放时间 */
export interface RigAnimation {
  speed: number
  paused: boolean
  progress: number
  /** 一周期长度（秒） */
  readonly length: number
  /** 一次性动画（入场动作）是否已播完一整段；循环播放时恒为 false */
  readonly done: boolean
  update(player: PlayerObject, deltaTime: number): void
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)

/** 关键帧值：[x, y, z]、{ vector: [x, y, z] }，或单个数字（三轴同值） */
function keyValue(v: unknown): number[] | null {
  const raw = Array.isArray(v) ? v : isRecord(v) && Array.isArray(v.vector) ? v.vector : null
  if (raw && raw.length >= 3) return [Number(raw[0]), Number(raw[1]), Number(raw[2])]
  if (typeof v === 'number') return [v, v, v]
  return null
}

/** 文件空间 -> skinview3d 空间：度数换弧度、y 与 z 取反 */
function toRigSpace(channel: ChannelName, v: number[]): number[] {
  const [x, y, z] = v
  return channel === 'rotation'
    ? [x * DEG_TO_RAD, -y * DEG_TO_RAD, -z * DEG_TO_RAD]
    : [x, -y, -z]
}

function buildTrack(channel: ChannelName, raw: unknown): Track | null {
  const single = keyValue(raw)
  if (single) return { times: [], values: toRigSpace(channel, single) }
  if (!isRecord(raw)) return null
  const points: { time: number; value: number[] }[] = []
  for (const [timecode, value] of Object.entries(raw)) {
    const v = keyValue(value)
    // Molang 表达式等无法求值的帧直接丢掉
    if (v && v.every(Number.isFinite)) points.push({ time: Number(timecode), value: v })
  }
  if (points.length === 0) return null
  if (points.length === 1) return { times: [], values: toRigSpace(channel, points[0].value) }
  points.sort((a, b) => a.time - b.time)
  const times: number[] = []
  const values: number[] = []
  for (const p of points) {
    times.push(p.time)
    values.push(...toRigSpace(channel, p.value))
  }
  return { times, values }
}

/**
 * 取出文件里的一条动画。Bedrock 一个文件可以放多条动画，
 * 按 animation.<name> / <name> / 以 .<name> 结尾匹配，匹配不到就用第一条。
 */
export function compileAnimation(json: unknown, name?: string): CompiledAnimation | null {
  if (!isRecord(json)) return null
  let body: unknown = json
  if (isRecord(json.animations)) {
    const entries = Object.entries(json.animations)
    const wanted = name
      ? entries.find(([key]) => key === `animation.${name}` || key === name || key.endsWith(`.${name}`))
      : undefined
    body = (wanted ?? entries[0])?.[1]
  }
  if (!isRecord(body)) return null
  const animators = isRecord(body.bones) ? body.bones : isRecord(body.animators) ? body.animators : null
  if (!animators) return null

  const channels: BoneChannel[] = []
  let lastTime = 0
  for (const [key, definition] of Object.entries(animators)) {
    if (!isRecord(definition)) continue
    // Blockbench 内部形状按 UUID 索引，骨骼名放在 name 字段上
    const bone = typeof definition.name === 'string' ? definition.name : key
    if (!isKnownBone(bone)) continue
    for (const channel of ['rotation', 'position'] as ChannelName[]) {
      const track = buildTrack(channel, definition[channel])
      if (!track) continue
      channels.push({ bone, channel, track })
      for (const t of track.times) if (t > lastTime) lastTime = t
    }
  }
  if (channels.length === 0) return null

  const declared = Number(body.animation_length)
  const length = Number.isFinite(declared) && declared > 0 ? declared : lastTime
  return {
    length: length > 0 ? length : 1,
    loop: body.loop === true || body.loop === 'loop',
    channels
  }
}

export class BlockbenchAnimation implements RigAnimation {
  speed = 1
  paused = false
  progress = 0
  /** 绑定姿势基线，首次 update 时从形象上读 */
  private baseline: Map<string, { position: number[]; rotation: number[] }> | null = null
  private readonly out = [0, 0, 0]

  /**
   * @param animation 编译好的动画
   * @param playOnce 只播一整个周期后停住（入场动作用），文件里写着循环也照此办理
   */
  constructor(
    private readonly animation: CompiledAnimation,
    private readonly playOnce = false
  ) {}

  get length() {
    return this.animation.length
  }

  get done() {
    return this.playOnce && this.progress >= this.animation.length
  }

  /**
   * 施加动画。要求当帧开始前形象处于绑定姿势
   * （StaffCarousel 每帧先 resetJoints），否则基线会带上上一段的姿势。
   */
  update(player: PlayerObject, deltaTime: number) {
    if (this.paused) return
    this.progress += deltaTime * this.speed
    if (!this.baseline) this.baseline = this.captureBaseline(player)

    const { length, loop } = this.animation
    const once = this.playOnce || !loop
    const t = once ? Math.min(this.progress, length) : ((this.progress % length) + length) % length
    for (const { bone, channel, track } of this.animation.channels) {
      const node = resolveBone(player, bone)
      const base = this.baseline.get(bone)
      if (!node || !base) continue
      this.sample(track, t, loop ? length : 0)
      if (channel === 'rotation') {
        node.rotation.set(
          base.rotation[0] + this.out[0],
          base.rotation[1] + this.out[1],
          base.rotation[2] + this.out[2]
        )
      } else {
        node.position.set(
          base.position[0] + this.out[0],
          base.position[1] + this.out[1],
          base.position[2] + this.out[2]
        )
      }
    }
  }

  private captureBaseline(player: PlayerObject) {
    const map = new Map<string, { position: number[]; rotation: number[] }>()
    for (const { bone } of this.animation.channels) {
      if (map.has(bone)) continue
      const node = resolveBone(player, bone)
      if (!node) continue
      map.set(bone, {
        position: [node.position.x, node.position.y, node.position.z],
        rotation: [node.rotation.x, node.rotation.y, node.rotation.z]
      })
    }
    return map
  }

  /**
   * 线性插值出 t 时刻相对绑定姿势的增量，写进 this.out。
   * loopLength > 0 表示循环动画：最后一个关键帧之后不算完就停住，
   * 而是继续插回第一帧（第一帧同时也是 t = loopLength 的姿势），否则每圈末尾会卡一下。
   */
  private sample(track: Track, t: number, loopLength: number) {
    const { times, values } = track
    if (times.length === 0) {
      this.out[0] = values[0]
      this.out[1] = values[1]
      this.out[2] = values[2]
      return
    }
    const last = times.length - 1
    if (loopLength > 0 && t > times[last]) {
      this.lerp(values, last, 0, (t - times[last]) / (loopLength - times[last]))
      return
    }
    const i = t <= times[0] ? 0 : t >= times[last] ? last : -1
    if (i >= 0) {
      const n = i * 3
      this.out[0] = values[n]
      this.out[1] = values[n + 1]
      this.out[2] = values[n + 2]
      return
    }
    // 二分找区间左端点
    let lo = 0
    let hi = last
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1
      if (times[mid] <= t) lo = mid
      else hi = mid
    }
    this.lerp(values, lo, hi, times[lo] === times[hi] ? 1 : (t - times[lo]) / (times[hi] - times[lo]))
  }

  private lerp(values: number[], a: number, b: number, k: number) {
    const i = a * 3
    const j = b * 3
    this.out[0] = values[i] + (values[j] - values[i]) * k
    this.out[1] = values[i + 1] + (values[j + 1] - values[i + 1]) * k
    this.out[2] = values[i + 2] + (values[j + 2] - values[i + 2]) * k
  }
}
