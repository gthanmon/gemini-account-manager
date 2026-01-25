-- Account Manager Pro - D1 数据库表结构
-- 创建时间: 2024-01-16

-- 用户表
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'user' CHECK(role IN ('user', 'admin')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 账号表
CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    backup_email TEXT,
    twofa_secret TEXT,
    type TEXT DEFAULT 'PERSONAL' CHECK(type IN ('PERSONAL', 'FAMILY')),
    status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'PENDING', 'BANNED', 'SOLD')),
    slots TEXT DEFAULT '[]',
    batch_tag TEXT,
    user_id INTEGER NOT NULL,
    buyer_name TEXT,
    buyer_source TEXT,
    buyer_order TEXT,
    buyer_price TEXT,
    sold_at DATETIME,
    ban_reason TEXT,
    banned_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 创建索引
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_status ON accounts(status);
CREATE INDEX IF NOT EXISTS idx_batch_tag ON accounts(batch_tag);

-- 更新时间触发器
CREATE TRIGGER IF NOT EXISTS update_timestamp 
AFTER UPDATE ON accounts
BEGIN
  UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
