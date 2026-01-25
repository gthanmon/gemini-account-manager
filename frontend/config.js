/**
 * 配置文件 - API 地址配置
 * 只需修改此文件即可切换本地/远程环境
 */

// ========== 环境开关 ==========
// true = 使用本地开发环境
// false = 使用远程生产环境
const USE_LOCAL = false;

// ========== 地址配置 ==========
const LOCAL_URL = 'http://localhost:8787';
const REMOTE_URL = 'https://your-worker.your-subdomain.workers.dev';

// ========== 自动选择 ==========
const API_BASE_URL = USE_LOCAL ? LOCAL_URL : REMOTE_URL;

// 控制台显示当前环境（方便调试）
console.log(`📡 当前API环境: ${USE_LOCAL ? '本地开发' : '远程生产'} (${API_BASE_URL})`);
