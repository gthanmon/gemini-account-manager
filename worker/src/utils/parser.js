/**
 * 文本解析工具 - 智能识别账号格式
 * 支持多种分隔符: ----, :, |
 */

/**
 * 解析单行账号文本
 * @param {string} line - 单行文本
 * @returns {Object|null} 解析后的账号对象
 */
export function parseLine(line) {
  if (!line || !line.trim()) return null;

  // 尝试不同的分隔符,支持 --- 和 ----
  const separators = ['----', '---', '|', ':'];
  let parts = null;

  for (const sep of separators) {
    if (line.includes(sep)) {
      parts = line.split(sep).map(p => p.trim());
      break;
    }
  }

  // 如果没有找到分隔符,跳过这行
  if (!parts || parts.length < 2) {
    return null;
  }

  // 解析字段: 账号----密码----辅邮----2FA
  const [email, password, backupEmail = '', twofaSecret = ''] = parts;

  // 验证邮箱格式
  if (!email || !email.includes('@')) {
    return null;
  }

  return {
    email: email.trim(),
    password: password.trim(),
    backup_email: backupEmail.trim() || null,
    twofa_secret: twofaSecret.trim() || null
  };
}

/**
 * 批量解析多行文本
 * @param {string} text - 多行文本
 * @returns {Array} 解析后的账号数组
 */
export function parseMultipleLines(text) {
  const lines = text.split('\n');
  const accounts = [];

  for (const line of lines) {
    const account = parseLine(line);
    if (account) {
      accounts.push(account);
    }
  }

  return accounts;
}

/**
 * 解析单个账号块(支持多行格式)
 * @param {string} block - 账号文本块
 * @returns {Object|null} 解析后的账号对象
 */
function parseSingleAccount(block) {
  const lines = block.split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length === 0) return null;

  // 尝试解析第一行
  return parseLine(lines[0]);
}
