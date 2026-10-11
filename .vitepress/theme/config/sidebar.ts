// 文档侧边栏（唯一数据源）：wiki 全量启用（新手必看/高手必看已并入）；分组可折叠、默认收起
// （collapsed: true），当前页所在分组挂载/切页时会自动展开。其他根级路径（blogs、
// changelog 等）不匹配任何 key，不受影响。
// 分组的入口页统一是该分类下的 wiki/<分类>/总览.md，列为 items 的第一项；分组本身不挂
// link（点标题只负责展开收起），目录里「总览」与文章平级可见。
// 消费方：config.mts（themeConfig.sidebar，另「活动」分组由 config 扫描 events/ 生成）。
// 增删页面条目、调整分组只动这里；注意新增页面后要在这里同步登记，否则页面左侧无目录。

import type { DefaultTheme } from 'vitepress'

export const SIDEBAR: DefaultTheme.Sidebar = {
  '/wiki/': [
    { text: 'Wiki 总览', link: '/wiki/' },
    {
      text: '新手必看教程（入门）',
      collapsed: true,
      items: [
        { text: '总览', link: '/wiki/新手必看/总览' },
        { text: '入服教程', link: '/wiki/新手必看/入服教程' },
        { text: '特色玩法', link: '/wiki/新手必看/特色玩法' },
        { text: '规则', link: '/wiki/新手必看/规则' }
      ]
    },
    {
      text: '新手强化教程（进阶）',
      collapsed: true,
      items: [
        { text: '部分物资获取', link: '/wiki/高手必看/部分物资获取' },
        { text: '推荐下载的模组安装使用', link: '/wiki/高手必看/推荐下载的模组安装使用' }
      ]
    },
    {
      text: '岛屿',
      collapsed: true,
      items: [
        { text: '总览', link: '/wiki/空岛类型/总览' },
        { text: '经典空岛', link: '/wiki/空岛类型/经典空岛' },
        { text: '单方块空岛', link: '/wiki/空岛类型/单方块空岛' },
        { text: '随机空岛', link: '/wiki/空岛类型/随机空岛' },
        { text: '九选一空岛', link: '/wiki/空岛类型/九选一空岛' },
        { text: '钓鱼空岛', link: '/wiki/空岛类型/钓鱼空岛' },
        { text: '假日海岛', link: '/wiki/空岛类型/假日海岛' },
        { text: '地底世界', link: '/wiki/空岛类型/地底世界' },
        { text: '困难空岛', link: '/wiki/空岛类型/困难空岛' },
        { text: '海底求生', link: '/wiki/空岛类型/海底求生' },
        { text: '惊变空岛100天🔥', link: '/wiki/空岛类型/惊变空岛100天' },
        { text: '极限生存挑战', link: '/wiki/空岛类型/极限生存挑战' },
        { text: '粘液科技空岛', link: '/wiki/空岛类型/粘液科技空岛' },
        { text: '特殊岛屿', link: '/wiki/空岛类型/特殊岛屿' }
      ]
    },
    {
      text: '岛屿特性',
      collapsed: true,
      items: [
        { text: '单方块', link: '/wiki/岛屿特性/单方块' },
        { text: '九选一', link: '/wiki/岛屿特性/九选一' },
        { text: '钓鱼', link: '/wiki/岛屿特性/钓鱼' },
        { text: '随机方块', link: '/wiki/岛屿特性/随机方块' },
        { text: '假日群岛', link: '/wiki/岛屿特性/假日群岛' },
        { text: '海洋世界', link: '/wiki/岛屿特性/海洋世界' },
        { text: '基因鸡', link: '/wiki/岛屿特性/基因鸡' },
        { text: '粘液科技', link: '/wiki/岛屿特性/粘液科技' },
        { text: '淬炼', link: '/wiki/岛屿特性/淬炼' }
      ]
    },
    {
      text: '资源获取',
      collapsed: true,
      items: [
        { text: '刷石机出矿', link: '/wiki/资源获取/刷石机出矿' },
        { text: '空岛合成配方', link: '/wiki/资源获取/空岛合成配方' },
        { text: '李芒果机制', link: '/wiki/资源获取/李芒果机制' },
        { text: '特殊生物与掉落', link: '/wiki/资源获取/特殊生物与掉落' }
      ]
    },
    {
      text: '特殊功能',
      collapsed: true,
      items: [
        { text: '幻形', link: '/wiki/特殊功能/幻形' },
        { text: '幻形图鉴', link: '/wiki/特殊功能/幻形图鉴' },
        { text: '幽匿侵蚀', link: '/wiki/特殊功能/幽匿侵蚀' },
        { text: '祈愿池', link: '/wiki/特殊功能/祈愿池' },
        { text: '幸运色', link: '/wiki/特殊功能/幸运色' },
        { text: '挑战任务', link: '/wiki/特殊功能/挑战任务' }
      ]
    },
    {
      text: '便利功能',
      collapsed: true,
      items: [
        { text: '总览', link: '/wiki/便利功能/总览' },
        { text: '自动铺路', link: '/wiki/便利功能/自动铺路' },
        { text: '铁电梯', link: '/wiki/便利功能/铁电梯' },
        { text: '铁路传送', link: '/wiki/便利功能/铁路传送' },
        { text: '举高高', link: '/wiki/便利功能/举高高' },
        { text: '时钟菜单', link: '/wiki/便利功能/时钟菜单' },
        { text: '更多椅子', link: '/wiki/便利功能/更多椅子' },
        { text: '音乐', link: '/wiki/便利功能/音乐' },
        { text: '首棵树苗', link: '/wiki/便利功能/首棵树苗' },
        { text: '信标传送', link: '/wiki/便利功能/信标传送' },
        { text: '回响扳手', link: '/wiki/便利功能/回响扳手' },
        { text: '岩浆保护', link: '/wiki/便利功能/岩浆保护' },
        { text: '安全落点', link: '/wiki/便利功能/安全落点' },
        { text: '伤害显示', link: '/wiki/便利功能/伤害显示' },
        { text: '邮箱', link: '/wiki/便利功能/邮箱' },
        { text: '传送牌', link: '/wiki/便利功能/传送牌' },
        { text: '云仓', link: '/wiki/便利功能/云仓' },
        { text: '岛屿管理', link: '/wiki/便利功能/岛屿管理' },
        { text: '岛屿开关', link: '/wiki/便利功能/岛屿开关' }
      ]
    },
    {
      text: '系统功能',
      collapsed: true,
      items: [
        { text: '岛屿系统', link: '/wiki/系统功能/岛屿系统' },
        { text: '玩家系统', link: '/wiki/系统功能/玩家系统' },
        { text: '经济系统', link: '/wiki/系统功能/经济系统' }
      ]
    },
    {
      text: '服务器小游戏',
      collapsed: true,
      items: [
        { text: '总览', link: '/wiki/服务器小游戏/总览' },
        { text: '通用游玩流程', link: '/wiki/服务器小游戏/通用游玩流程' },
        { text: '掘一死战', link: '/wiki/服务器小游戏/掘一死战' },
        { text: '消失的羊毛', link: '/wiki/服务器小游戏/消失的羊毛' },
        { text: '天天酷跑', link: '/wiki/服务器小游戏/天天酷跑' },
        { text: '颜色匹配', link: '/wiki/服务器小游戏/颜色匹配' },
        { text: '烫手山芋', link: '/wiki/服务器小游戏/烫手山芋' },
        { text: '击击棒', link: '/wiki/服务器小游戏/击击棒' },
        { text: '射箭', link: '/wiki/服务器小游戏/射箭' },
        { text: '扫雷', link: '/wiki/服务器小游戏/扫雷' },
        { text: '彩色跑酷', link: '/wiki/服务器小游戏/彩色跑酷' },
        { text: '红绿灯', link: '/wiki/服务器小游戏/红绿灯' },
        { text: '黄金矿工', link: '/wiki/服务器小游戏/黄金矿工' },
        { text: '剪羊毛', link: '/wiki/服务器小游戏/剪羊毛' },
        { text: '山丘之王', link: '/wiki/服务器小游戏/山丘之王' },
        { text: '泼洒颜料！', link: '/wiki/服务器小游戏/泼洒颜料' },
        { text: '炸弹人', link: '/wiki/服务器小游戏/炸弹人' },
        { text: '起床战争', link: '/wiki/服务器小游戏/起床战争' },
        { text: '梦战（IsletWars）', link: '/wiki/服务器小游戏/梦战' },
        { text: '骑马与砍杀', link: '/wiki/服务器小游戏/骑马与砍杀' }
      ]
    },
    {
      text: 'QQ群功能',
      collapsed: true,
      items: [
        { text: 'QQ 机器人绑定', link: '/wiki/QQ群功能/QQ机器人绑定' },
        { text: '每日签到', link: '/wiki/群内小游戏/每日签到' },
        { text: '挖矿', link: '/wiki/群内小游戏/挖矿' },
        { text: '钓鱼', link: '/wiki/群内小游戏/钓鱼' },
        { text: '农场', link: '/wiki/群内小游戏/农场' },
        { text: '模拟炒股', link: '/wiki/群内小游戏/模拟炒股' }
      ]
    },
    // 单页分组：点击「常见问题」标题即打开文章本身
    { text: '常见问题', link: '/wiki/常见问题' }
  ]
}
