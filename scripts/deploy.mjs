#!/usr/bin/env node
// 发布脚本:把 main 快进合并(fast-forward)到远程 deploy 分支。
// EdgeOne 的生产分支指向 deploy,推送后即触发线上构建——这是本仓库唯一的
// 发布途径(Pages CMS 与 GitHub Actions 都不再提供发布/预览按钮)。
// 其余分支(含 main)的推送只会让 EdgeOne 生成预览版本,不会上线。
//
// 行为:
//   - 本地 main 落后 origin/main 时拒绝执行,提示先拉取;
//     领先时先推送 main,保证 deploy 不会越过 origin/main。
//   - deploy 含有 main 之外的提交(非快进)时拒绝发布,需先处理分歧。
//   - deploy 已与 main 一致时无事可做,直接退出。
//   - 发布成功后把本地 deploy 引用同步到远程(当前恰好检出了 deploy 分支则跳过)。
//
// 用法:
//   npm run deploy            # 实际发布
//   npm run deploy -- --dry-run  # 演练:只检查并打印将执行的操作,不推送

import { execFileSync } from 'node:child_process'

const DRY_RUN = process.argv.includes('--dry-run')

const git = (args, opts = {}) =>
  execFileSync('git', args, { encoding: 'utf8', ...opts }).trim()

// push/fetch 直接继承 stdio,让 git 自己输出进度
const gitInherit = (args) => execFileSync('git', args, { stdio: 'inherit' })

const die = (msg) => {
  console.error(`✗ ${msg}`)
  process.exit(1)
}

const hash = (ref) => git(['rev-parse', ref])
const short = (ref) => git(['rev-parse', '--short', ref])
const subject = (ref) => git(['log', '-1', '--format=%s', ref])
// merge-base --is-ancestor 用退出码表示结果(0=是,1=否),execFileSync 对非零码会抛错
const isAncestor = (a, b) => {
  try {
    git(['merge-base', '--is-ancestor', a, b])
    return true
  } catch {
    return false
  }
}

// —— 1. 拉取远程最新状态 ——
gitInherit(['fetch', 'origin', 'main', 'deploy'])

const localMain = hash('main')
const remoteMain = hash('origin/main')
const remoteDeploy = hash('origin/deploy')

if (remoteMain !== localMain) {
  if (isAncestor(localMain, remoteMain))
    die(`本地 main(${short('main')}) 落后于 origin/main(${short('origin/main')}),请先 git pull`)
  if (!isAncestor(remoteMain, localMain))
    die(`本地 main(${short('main')}) 与 origin/main(${short('origin/main')}) 存在分歧,请先处理`)
  // 本地领先:先推送 main,确保发布内容已进入远程 main
  console.log(`▸ 本地 main 领先,先推送 origin/main(${short('main')})`)
  if (!DRY_RUN) gitInherit(['push', 'origin', 'main'])
}

// —— 2. 发布检查:deploy 必须能从 main 快进 ——
if (remoteDeploy === localMain) {
  console.log(`✓ deploy(${short('origin/deploy')}) 已与 main 一致,无需发布`)
  process.exit(0)
}

if (!isAncestor(remoteDeploy, localMain)) {
  die(
    `deploy(${short('origin/deploy')}) 包含 main 之外的提交,快进发布会被拒绝。\n` +
      `  请先把 deploy 上的改动合并回 main,或手动处理后再发布。`
  )
}

console.log(
  `▸ 发布 main → deploy:${short('origin/deploy')}..${short('main')}「${subject('main')}」` +
    (DRY_RUN ? '(dry-run,未推送)' : '')
)

if (!DRY_RUN) {
  gitInherit(['push', 'origin', 'main:deploy'])

  // —— 3. 同步本地 deploy 引用(检出着 deploy 分支时无法更新,提示自行 pull) ——
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])
  if (branch === 'deploy') {
    console.log('▸ 当前检出了 deploy 分支,请稍后自行 git pull 同步本地')
  } else {
    try {
      git(['fetch', 'origin', 'deploy:deploy'])
    } catch {
      console.warn('⚠ 本地 deploy 引用同步失败(可能存在分歧),不影响本次发布')
    }
  }
  console.log(`✓ 已发布 ${short('main')} → deploy,EdgeOne 将自动构建上线`)
}
