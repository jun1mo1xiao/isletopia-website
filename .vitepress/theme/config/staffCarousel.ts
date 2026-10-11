// 管理团队轮播（StaffCarousel.vue）的站点级可调参数：轮播节奏、取景与相机朝向、
// 成员动作的默认速度，对全体成员统一生效。
// 成员的动作数据来自 animations/<动作名>.animation.json：入场动作只播一整段（时长由
// 动画文件自己决定，不可配），入场播完要混合到待机动作，
// 开播前的等待与混合的快慢都由本文件决定。

/**
 * 自动轮播间隔（毫秒）。单个页面可用 <StaffCarousel :interval="8000" /> 覆盖这个值。
 */
export const CAROUSEL_INTERVAL_MS = 5000

/**
 * 入场动作开播前先等这么久（毫秒）：切到某位成员（含首次显示、双击重播）后，
 * 形象先按待机动作原地站着，倒计时结束才开始播入场动作。填 0 等于立刻开播。
 * 主要用来错开卡片的滑动动画与皮肤贴图加载，免得动作在画面还没站稳时就已经做完。
 */
export const ENTRANCE_DELAY_MS = 100

/**
 * 入场动作 → 待机动作 的过渡时长（秒）。
 * 数值越小过渡越快，填 0 等于瞬间切换（会看到姿势硬跳一下），越大越绵软。
 * 过渡按 easeInOut 缓动，所以这里给的是整段过渡的总时长，不是速度倍数。
 */
export const ENTRANCE_BLEND_SECONDS = 0.5

/**
 * CMS 里动作速度留空（或填了非法值）时的默认倍数：入场按动画原速播放，
 * 待机放慢到 0.7 倍速，在卡片里看着更稳。
 */
export const DEFAULT_ENTRANCE_SPEED = 1
export const DEFAULT_IDLE_SPEED = 0.7

/**
 * 正交观感：skinview3d 内部固定使用 PerspectiveCamera，无法换成 OrthographicCamera，
 * 这里用「极小 fov + 等比拉远」逼近正交投影。可见高度 = 9·tan(fov/2) + 33/zoom，
 * 取 fov 10°、zoom 0.7725 使取景与原先的 fov 55 / zoom 0.85 完全一致；
 * 对应相机距离约 249，仍在 skinview3d 内部 10~256 的限幅内（再小就会被卡住而放大画面）。
 */
export const ORTHO_LIKE_FOV = 10
export const ORTHO_LIKE_ZOOM = 0.7725

/**
 * 相机朝向（度）：yaw 绕竖直轴水平转，pitch 向上抬升。
 * 改这两个值即可换视角，取景大小不变（只重摆方向，不动距离）。
 */
export const CAMERA_YAW_DEG = -30
export const CAMERA_PITCH_DEG = 20
