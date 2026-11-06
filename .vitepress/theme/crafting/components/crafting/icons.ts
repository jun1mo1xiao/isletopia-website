/**
 * 物品图标：来自 github.com/destruc7i0n/minecraft-textures（npm 包 minecraft-textures）。
 * 虚拟模块 virtual:mc-textures 由 .vitepress/mc-textures-plugin.mts 的 mcTextures 插件生成：
 *   - items: manifest 物品元数据（id / readable / texture 哈希文件名）
 *   - urlLoaders: 哈希文件名 -> 贴图 URL（构建期由插件复制为 /mc-textures/<hash>.png，不进 Vite 资产图）
 * 图标只在浏览器真正用到时加载。MC 版本统一在 mc-textures-plugin.mts 的 MC_VERSION。
 */
import { items as manifestItems, urlLoaders } from 'virtual:mc-textures'
import { zhDisplayName, zhItemName } from './lang'
import type { ParsedRecipe, SlotKey } from './types'

const textureById = new Map<string, string>()
const readableById = new Map<string, string>()
for (const item of manifestItems) {
  textureById.set(item.id, item.texture)
  textureById.set(stripNamespace(item.id), item.texture)
  readableById.set(item.id, item.readable)
  readableById.set(stripNamespace(item.id), item.readable)
}

/** 去掉命名空间："minecraft:diamond" -> "diamond" */
export function stripNamespace(id: string): string {
  const i = id.indexOf(':')
  return i === -1 ? id : id.slice(i + 1)
}

/** 物品 id -> 贴图 URL（按需异步解析）；未知物品（如模组物品）返回 undefined，由组件显示占位 */
export async function itemIconUrl(itemId: string): Promise<string | undefined> {
  const file = textureById.get(itemId) ?? textureById.get(stripNamespace(itemId))
  const loader = file ? urlLoaders[file] : undefined
  if (!loader) return undefined
  try {
    return await loader()
  } catch {
    return undefined
  }
}

/** 槽位显示名：nameKey（药水等带组件物品，如 "item.minecraft.potion.effect.strength"）优先，其次按 id 解析 */
export function slotDisplayName(slot: { id: string; nameKey?: string }): string {
  if (slot.nameKey) {
    const zh = zhDisplayName(slot.nameKey)
    if (zh) return zh
  }
  return prettyLabel(slot.id)
}

/** 产物槽位按键名优先级（各面板类型的产物键不同） */
export const RESULT_KEYS: SlotKey[] = [
  'crafting.result',
  'cooking.result',
  'brewing.output',
  'stonecutter.result',
  'smithing.result',
]

/** 目录卡片标题：titleItem（如纹饰配方以锻造模板命名）优先，其次产物槽位显示名，无产物回退类型徽章 */
export function recipeTitle(recipe: ParsedRecipe): string {
  if (recipe.titleItem) {
    const zh = zhItemName(recipe.titleItem)
    if (zh) return zh
  }
  for (const key of RESULT_KEYS) {
    const slot = recipe.slots[key]
    if (slot) return slotDisplayName(slot)
  }
  return recipe.label
}

/** 物品搜索名：官方中文名 + 英文名 + 无命名空间 id（空格拼接），供目录搜索索引使用 */
export function itemSearchNames(itemId: string): string {
  const name = stripNamespace(itemId)
  return [zhItemName(itemId), readableById.get(itemId) ?? readableById.get(name), name]
    .filter(Boolean)
    .join(' ')
}

/** 物品显示名：优先官方简体中文（zh_cn 字典），未知中文回退 manifest 英文名，再退 ID 驼峰化 */
export function prettyLabel(itemId: string): string {
  const zh = zhItemName(itemId)
  if (zh) return zh
  const readable = readableById.get(itemId) ?? readableById.get(stripNamespace(itemId))
  if (readable) return readable
  return stripNamespace(itemId)
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
