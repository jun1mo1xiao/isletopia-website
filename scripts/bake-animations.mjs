#!/usr/bin/env node
// 把 skinview3d 内置动作烘焙成 Blockbench 可编辑的 .animation.json（Bedrock 动画格式）。
//
//   node scripts/bake-animations.mjs
//
// 输出到项目根 animations/<动作名>.animation.json，StaffCarousel.vue 构建期读取。
// 这些文件是转换产物，可以直接用 Blockbench 打开继续编辑；重新执行本脚本会整体覆盖。
//
// 做法：按 libs/animation.js（skinview3d 3.4.2）里的公式逐帧采样，每帧先从绑定姿势
// 出发（等价于 viewer 每帧的 resetJoints），再取相对绑定姿势的增量。
// 坐标与单位换算和 .vitepress/theme/utils/blockbenchAnimation.ts 里的映射互为逆运算：
//   旋转 (x, -y, -z) 且弧度换度数；位置 (x, -y, -z)（单位都是 1 像素）。
//
// 与原实现的三处有意的差别（都为了能整周期无缝循环，观感不变）：
//   1. walk：head.rotation.x 原为 sin(progress*1.6)，一个循环里不是整数个周期，
//      改成与 head.rotation.y 同频不同相；cape 的 sin(t/1.5) 同理就近取到 3 个周期。
//   2. crouch：原实现是 |sin| 阶跃地在蹲/站之间来回弹（showProgress=false 时把进度取整），
//      改成 0.125 秒蹲下后保持蹲姿，因此循环方式用 hold_on_last_frame。
//   3. swim：去掉原实现里只发生一次的下潜开场（lock 逻辑），直接定格在 submerged 姿态；
//      入场动作的混合过渡会负责“沉下去”的过程。腿部摆动频率就近取到每循环 2 个周期。
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = join(ROOT, 'animations')

const PI = Math.PI
const { sin, cos, abs, atan2, sqrt, min, max, pow } = Math
const CAPE_BIND_X = (10.8 * PI) / 180

// 绑定姿势（取自 skinview3d libs/model.js 的 resetJoints），three.js 空间、绝对值
const BIND = {
  root: { p: [0, 0, 0], r: [0, 0, 0] },
  head: { p: [0, 0, 0], r: [0, 0, 0] },
  body: { p: [0, -6, 0], r: [0, 0, 0] },
  right_arm: { p: [-5, -2, 0], r: [0, 0, 0] },
  left_arm: { p: [5, -2, 0], r: [0, 0, 0] },
  right_leg: { p: [-1.9, -12, -0.1], r: [0, 0, 0] },
  left_leg: { p: [1.9, -12, -0.1], r: [0, 0, 0] },
  cape: { p: [0, 8, -2], r: [CAPE_BIND_X, PI, 0] },
  elytra: { p: [0, 8, -2], r: [0, 0, 0] },
  left_elytra: { p: [5, 0, 0], r: [0.2617994, 0.01, 0.2617994] },
  right_elytra: { p: [-5, 0, 0], r: [0.2617994, -0.01, -0.2617994] }
}

const freshState = () =>
  Object.fromEntries(Object.entries(BIND).map(([k, v]) => [k, { p: [...v.p], r: [...v.r] }]))

// —— 各动作：写绝对值，与 skinview3d 的原公式一一对应 ——

function idle(s, p) {
  const t = p * 2
  s.left_arm.r[2] = cos(t) * 0.03 + PI * 0.02
  s.right_arm.r[2] = cos(t + PI) * 0.03 - PI * 0.02
  s.cape.r[0] = sin(t) * 0.01 + PI * 0.06
}

function walk(s, p) {
  const t = p * 8
  s.left_leg.r[0] = sin(t) * 0.5
  s.right_leg.r[0] = sin(t + PI) * 0.5
  s.left_arm.r[0] = sin(t + PI) * 0.5
  s.right_arm.r[0] = sin(t) * 0.5
  s.left_arm.r[2] = cos(t) * 0.03 + PI * 0.02
  s.right_arm.r[2] = cos(t + PI) * 0.03 - PI * 0.02
  s.head.r[1] = sin(t / 4) * 0.2
  // 原为 sin(t / 5)，在一个循环里不足整数周期，改为同频不同相
  s.head.r[0] = sin(t / 4 + PI / 2) * 0.1
  // 原为 sin(t / 1.5)，同样就近取整周期
  s.cape.r[0] = sin(p * 6) * 0.06 + PI * 0.06
}

function run(s, p) {
  const t = p * 15 + PI * 0.5
  s.left_leg.r[0] = cos(t + PI) * 1.3
  s.right_leg.r[0] = cos(t) * 1.3
  s.left_arm.r[0] = cos(t) * 1.5
  s.right_arm.r[0] = cos(t + PI) * 1.5
  s.left_arm.r[2] = cos(t) * 0.1 + PI * 0.1
  s.right_arm.r[2] = cos(t + PI) * 0.1 - PI * 0.1
  s.root.p[1] = cos(t * 2)
  s.root.p[0] = cos(t) * 0.15
  s.root.r[2] = cos(t + PI) * 0.01
  s.cape.r[0] = sin(t * 2) * 0.1 + PI * 0.3
}

function fly(s, p) {
  const t = p > 0 ? p * 20 : 0
  const start = min(max((t * t) / 100, 0), 1)
  s.root.r[0] = (start * PI) / 2
  s.head.r[0] = start > 0.5 ? PI / 4 - s.root.r[0] : 0
  const armZ = PI * 0.25 * start
  s.left_arm.r[2] = armZ
  s.right_arm.r[2] = -armZ
  const interp = pow(0.9, t)
  s.left_elytra.r[0] = 0.34906584 + interp * (0.2617994 - 0.34906584)
  s.left_elytra.r[2] = PI / 2 + interp * (0.2617994 - PI / 2)
  mirrorWing(s)
}
function crouch(s, p) {
  const a = abs(sin((min(p * 8, 1) * PI) / 2))
  s.body.r[0] = 0.4537860552 * a
  s.body.p[2] = (1.3256181 - 3.4500310377) * a
  s.body.p[1] = -6 - 2.103677462 * a
  s.cape.p[1] = 8 - 1.851236166577372 * a
  s.cape.r[0] = CAPE_BIND_X + 0.294220265771 * a
  s.cape.p[2] = -2 + (3.786619432 - 3.4500310377) * a
  // 原实现把翅膀跟到披风的位置上，并做展开/收拢；玩家形象看不到翅膀，这里只跟位置
  s.elytra.p[0] = s.cape.p[0]
  s.elytra.p[1] = s.cape.p[1]
  s.elytra.p[2] = s.cape.p[2]
  s.elytra.r[0] = s.cape.r[0] - CAPE_BIND_X
  s.head.p[1] = -3.618325234674 * a
  s.left_arm.p[2] = (3.618325234674 - 3.4500310377) * a
  s.right_arm.p[2] = s.left_arm.p[2]
  s.left_arm.r[0] = 0.410367746202 * a
  s.right_arm.r[0] = s.left_arm.r[0]
  s.left_arm.r[2] = 0.1
  s.right_arm.r[2] = -0.1
  s.left_arm.p[1] = -2 - 2.53943318 * a
  s.right_arm.p[1] = s.left_arm.p[1]
  s.right_leg.p[2] = -3.4500310377 * a
  s.left_leg.p[2] = s.right_leg.p[2]
}

function hit(s, p) {
  const t = p * 18
  s.right_arm.r[0] = -0.4537860552 * 2 + 2 * sin(t + PI) * 0.3
  s.right_arm.r[2] = -cos(t) * 0.403 + 0.01 * PI + 0.06
  s.body.r[1] = -cos(t) * 0.06
  s.left_arm.r[0] = sin(t + PI) * 0.077
  s.left_arm.r[2] = -cos(t) * 0.015 + 0.13 - 0.05
  s.left_arm.p[2] = cos(t) * 0.3
  s.left_arm.p[0] = 5 - cos(t) * 0.05
}

// 挥手：照 skinview3d 上游原样保留那个著名的笔误——WaveAnimation 把 rotation.x 写成
// 180，而 three.js 的 Euler 是弧度制，等于 28.6 圈。取向只看 mod 2π，折算到一圈内
// 就是 180 - 28·2π ≈ 4.0708 rad ≈ 233.24°：手臂越过正上方再往后斜 53°，官方 demo 里
// 看到的就是这个姿势。（之前组件用 addAnimation 把它掰回 π 让手臂笔直朝上，现在不掰了）
const WAVE_TILT = ((180 % (2 * PI)) + 2 * PI) % (2 * PI)

function wave(which) {
  return (s, p) => {
    const arm = which === 'left' ? s.left_arm : s.right_arm
    arm.r[0] = WAVE_TILT
    arm.r[2] = sin(p * PI) * 0.5
  }
}

// —— 游泳的手臂是四元数插值，这里复刻 skinview3d 的算法再转回欧拉角 ——

const quatMul = (a, b) => [
  a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
  a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
  a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
]

const quatAxis = (axis, angle) => {
  const s = sin(angle / 2)
  return [cos(angle / 2), axis[0] * s, axis[1] * s, axis[2] * s]
}

// 与 skinview3d 一致：qx * qy * qz（先绕 Z，再绕 Y，最后绕 X）
const quatZYX = (z, y, x) =>
  quatMul(quatMul(quatAxis([1, 0, 0], x), quatAxis([0, 1, 0], y)), quatAxis([0, 0, 1], z))

function quatSlerp(a, b, t) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
  const bb = [...b]
  if (d < 0) {
    for (let i = 0; i < 4; i++) bb[i] = -bb[i]
    d = -d
  }
  if (d > 0.9995) {
    const out = a.map((v, i) => v + (bb[i] - v) * t)
    const n = sqrt(out.reduce((s, v) => s + v * v, 0))
    return out.map((v) => v / n)
  }
  const theta = Math.acos(d)
  const sinT = sin(theta)
  const k0 = sin((1 - t) * theta) / sinT
  const k1 = sin(t * theta) / sinT
  return a.map((v, i) => v * k0 + bb[i] * k1)
}

// 转成 three.js 默认的 XYZ 欧拉序（R = Rx·Ry·Rz），与形象上 rotation.set 的语义一致
function quatToEulerXYZ(q) {
  const [w, x, y, z] = q
  const m00 = 1 - 2 * (y * y + z * z)
  const m01 = 2 * (x * y - w * z)
  const m02 = 2 * (x * z + w * y)
  const m12 = 2 * (y * z - w * x)
  const m22 = 1 - 2 * (x * x + y * y)
  const clamp = (v) => min(max(v, -1), 1)
  return [atan2(-m12, m22), Math.asin(clamp(m02)), atan2(-m01, m00)]
}

const SWIM_PERIOD = 1.3
// 时间比例（0~1）与四元数关键帧，照抄 skinview3d 的 SwimAnimation
const SWIM_TIMES = [0, 0.7 / SWIM_PERIOD, 1.1 / SWIM_PERIOD, 1.0]
const SWIM_LEFT = [
  { z: 180, y: 180, x: 0 },
  { z: 287.2, y: 180, x: 0 },
  { z: 180, y: 180, x: 90 },
  { z: 180, y: 180, x: 0 }
].map((e) => quatZYX(e.z * (PI / 180), e.y * (PI / 180), e.x * (PI / 180)))
const SWIM_RIGHT = [
  { z: -180, y: 180, x: 0 },
  { z: -287.2, y: 180, x: 0 },
  { z: -180, y: 180, x: 90 },
  { z: -180, y: 180, x: 0 }
].map((e) => quatZYX(e.z * (PI / 180), e.y * (PI / 180), e.x * (PI / 180)))

function swimArm(keys, phase) {
  let i = SWIM_TIMES.length - 2
  for (let k = 0; k < SWIM_TIMES.length - 1; k++) {
    if (phase >= SWIM_TIMES[k] && phase <= SWIM_TIMES[k + 1]) {
      i = k
      break
    }
  }
  const p = (phase - SWIM_TIMES[i]) / (SWIM_TIMES[i + 1] - SWIM_TIMES[i])
  return quatToEulerXYZ(quatSlerp(keys[i], keys[i + 1], p))
}

function swim(s, p) {
  // 原实现开场有一次性下潜，这里直接取到位后的姿态（下潜过程交给入场混合）
  s.root.p[1] = -5
  s.root.r[0] = (1.3 * PI) / 2
  s.head.r[0] = -1.3 * (PI / 4)
  s.cape.r[0] = 1.3 * (PI / 4)
  const phase = (p % SWIM_PERIOD) / SWIM_PERIOD
  ;[s.left_arm.r[0], s.left_arm.r[1], s.left_arm.r[2]] = swimArm(SWIM_LEFT, phase)
  ;[s.right_arm.r[0], s.right_arm.r[1], s.right_arm.r[2]] = swimArm(SWIM_RIGHT, phase)
  // 原为 390°/秒，一个循环里不足整数周期，就近取每循环 2 个周期
  const legFreq = (4 * PI) / SWIM_PERIOD
  const legAmp = 17.2 * (PI / 180)
  s.left_leg.r[0] = legAmp * cos(p * legFreq + PI)
  s.left_leg.r[1] = -0.1 * (PI / 180)
  s.left_leg.r[2] = -0.1 * (PI / 180)
  s.right_leg.r[0] = legAmp * cos(p * legFreq)
  s.right_leg.r[1] = 0.1 * (PI / 180)
  s.right_leg.r[2] = 0.1 * (PI / 180)
}

function mirrorWing(s) {
  s.right_elytra.p[0] = -s.left_elytra.p[0]
  s.right_elytra.p[1] = s.left_elytra.p[1]
  s.right_elytra.r[0] = s.left_elytra.r[0]
  s.right_elytra.r[1] = -s.left_elytra.r[1]
  s.right_elytra.r[2] = -s.left_elytra.r[2]
}

const ACTIONS = [
  { name: 'idle', fn: idle, length: PI, samples: 24 },
  { name: 'walk', fn: walk, length: PI, samples: 64 },
  { name: 'run', fn: run, length: (2 * PI) / 15, samples: 32 },
  // 飞翔是一次性展开（0.9^t 渐近收敛），用非均匀网格并停在最后一帧
  { name: 'fly', fn: fly, loop: false, grid: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.6, 0.7, 0.8, 0.9, 1, 1.25, 1.5, 2, 2.5, 3, 3.5] },
  { name: 'wave_left', fn: wave('left'), length: 2, samples: 32 },
  { name: 'wave_right', fn: wave('right'), length: 2, samples: 32 },
  // 潜行同理：0.125 秒蹲到位后保持，之后几个时间点只是把姿势钉住
  { name: 'crouch', fn: crouch, loop: false, grid: [0, 0.016, 0.031, 0.047, 0.063, 0.078, 0.094, 0.125, 0.141, 0.25, 0.5] },
  { name: 'hit', fn: hit, length: (2 * PI) / 18, samples: 24 },
  { name: 'swim', fn: swim, length: SWIM_PERIOD, samples: 48 }
]

const round = (v, digits = 4) => {
  const f = 10 ** digits
  const r = Math.round(v * f) / f
  return Object.is(r, -0) ? 0 : r
}

const timecode = (t) => {
  const v = round(t)
  return Number.isInteger(v) ? `${v}.0` : `${v}`
}

/** 采样结果 -> 每条骨骼每个通道的关键帧列表（已换到 Bedrock 文件空间） */
function bake(action) {
  const loop = action.loop !== false
  const times =
    action.grid ??
    Array.from({ length: action.samples + 1 }, (_, i) => (action.length * i) / action.samples)
  // 循环动画用最后一帧补回第一帧的值，保证接缝连续
  const list = loop ? times.slice(0, -1) : times
  const tracks = new Map()
  for (const t of list) {
    const s = freshState()
    action.fn(s, t)
    for (const [bone, { p, r }] of Object.entries(s)) {
      const bind = BIND[bone]
      const deltaP = p.map((v, i) => v - bind.p[i])
      const deltaR = r.map((v, i) => v - bind.r[i])
      for (const [channel, three] of [['rotation', deltaR], ['position', deltaP]]) {
        // three -> Bedrock：同样取 (x, -y, -z)，旋转再换回度数
        const value =
          channel === 'rotation'
            ? [three[0] / DEG, -three[1] / DEG, -three[2] / DEG]
            : [three[0], -three[1], -three[2]]
        const key = `${bone}.${channel}`
        const track = tracks.get(key) ?? { bone, channel, points: [] }
        track.points.push({ time: t, value: value.map((v) => round(v)) })
        tracks.set(key, track)
      }
    }
  }
  return [...tracks.values()]
    // 整段没动的通道不写：旋转全 0 且位置全 0 的骨骼直接跳过
    .filter(({ points }) => points.some((pt) => pt.value.some((v) => abs(v) > 1e-6)))
    .map(({ bone, channel, points }) => {
      if (channel === 'rotation') unwrap(points)
      // 常量通道只写一个关键帧，省掉几十条重复数据
      const first = points[0].value.join()
      const constant = points.every((pt) => pt.value.join() === first)
      return { bone, channel, constant, points }
    })
}

// 度数解算出来天然落在 (-180, 180]，跨过这条线时相邻两帧会写成 -180 与 +180，
// 关键帧之间的线性插值因此变成整整一圈的疯转（游泳的手臂四元数正卡在这条线上）。
// 按「与上一帧的差不能超过半圈」把轨道摊平成连续角度；差 360° 的姿势是同一个，
// three.js 落到四元数上不受影响
function unwrap(points) {
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].value
    const cur = points[i].value
    for (let a = 0; a < 3; a++) {
      let v = cur[a]
      while (v - prev[a] < -180) v += 360
      while (v - prev[a] > 180) v -= 360
      cur[a] = round(v)
    }
  }
}

const DEG = PI / 180
const actionLength = (action) => (action.grid ? action.grid[action.grid.length - 1] : action.length)

function toJson(action) {
  const bones = {}
  for (const { bone, channel, constant, points } of bake(action)) {
    const tag = bones[bone] ?? {}
    if (constant) {
      // 整段不动的通道写成一个值，省掉几十条重复关键帧
      tag[channel] = points[0].value
    } else {
      const frames = {}
      for (const pt of points) frames[timecode(pt.time)] = pt.value
      tag[channel] = frames
    }
    bones[bone] = tag
  }
  if (Object.keys(bones).length === 0) throw new Error(`${action.name} 没有产出任何通道`)
  return {
    format_version: '1.8.0',
    animations: {
      [`animation.${action.name}`]: {
        loop: action.loop === false ? 'hold_on_last_frame' : true,
        animation_length: round(actionLength(action)),
        bones
      }
    }
  }
}

/** 自检：数值都得是有限数；循环动作在周期末必须回到起点，否则每圈都会跳一下 */
function verify(action, json) {
  const name = action.name
  const ani = json.animations[`animation.${name}`]
  for (const [bone, tag] of Object.entries(ani.bones)) {
    for (const [channel, value] of Object.entries(tag)) {
      const triples = Array.isArray(value) ? [value] : Object.values(value)
      for (const v of triples) {
        if (!v.every(Number.isFinite)) throw new Error(`${name}.${bone}.${channel} 含非数值`)
      }
    }
  }
  if (action.loop === false) return
  const start = freshState()
  const end = freshState()
  action.fn(start, 0)
  action.fn(end, actionLength(action))
  for (const bone of Object.keys(start)) {
    for (const axis of ['p', 'r']) {
      for (let i = 0; i < 3; i++) {
        const diff = abs(start[bone][axis][i] - end[bone][axis][i])
        if (diff > 1e-3) {
          throw new Error(
            `${name} 首尾不接：${bone}.${axis}[${i}] ${start[bone][axis][i].toFixed(4)} → ${end[bone][axis][i].toFixed(4)}`
          )
        }
      }
    }
  }
}

mkdirSync(OUT_DIR, { recursive: true })
const lines = []
for (const action of ACTIONS) {
  const json = toJson(action)
  verify(action, json)
  // 三元组排成一行，便于人肉比对与 Blockbench 之外的手工微调
  const text = JSON.stringify(json, null, 2).replace(
    /\[\s*(-?[\d.]+),\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\]/g,
    '[$1, $2, $3]'
  )
  writeFileSync(join(OUT_DIR, `${action.name}.animation.json`), `${text}\n`, 'utf8')
  const ani = json.animations[`animation.${action.name}`]
  const frames = Object.values(ani.bones).reduce(
    (n, tag) =>
      n + Object.values(tag).reduce((m, v) => m + (Array.isArray(v) ? 1 : Object.keys(v).length), 0),
    0
  )
  lines.push(
    `${action.name.padEnd(11)} ${String(round(actionLength(action))).padStart(6)}s  ` +
      `${String(Object.keys(ani.bones).length).padStart(2)} 骨骼  ` +
      `${String(frames).padStart(4)} 帧  ` +
      `${(Buffer.byteLength(text) / 1024).toFixed(1).padStart(6)} KB`
  )
}
console.log(lines.join('\n'))
console.log(`\n已写入 ${OUT_DIR}`)
