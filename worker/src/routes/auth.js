/**
 * 认证相关 API
 * - 用户注册
 * - 用户登录
 * - 获取当前用户信息
 */

// JWT 密钥 - 从环境变量获取，如果没有则使用默认值（生产环境必须配置！）
let JWT_SECRET = null;

// 登录限制配置
const MAX_LOGIN_ATTEMPTS = 5;  // 最大失败次数
const LOCKOUT_DURATION = 10 * 60 * 1000;  // 锁定时间：10分钟（毫秒）

// 初始化密钥（需要在使用前调用）
export function initAuth(env) {
    JWT_SECRET = env.JWT_SECRET || 'default-secret-please-change-in-production';
}

// SHA-256 密码哈希
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// HMAC-SHA256 签名
async function signPayload(payload) {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign(
        'HMAC',
        key,
        encoder.encode(payload)
    );
    return Array.from(new Uint8Array(signature))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// 验证 HMAC 签名
async function verifySignature(payload, signature) {
    const expectedSignature = await signPayload(payload);
    return expectedSignature === signature;
}

// 生成带签名的 Token
async function generateToken(user) {
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
    };
    const payloadStr = JSON.stringify(payload);
    const payloadBase64 = btoa(payloadStr);
    const signature = await signPayload(payloadStr);
    // Token 格式: payload.signature
    return `${payloadBase64}.${signature}`;
}

// 验证 token（带签名验证）
async function verifyToken(token) {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) {
            return null; // 格式错误
        }

        const [payloadBase64, signature] = parts;
        const payloadStr = atob(payloadBase64);

        // 验证签名
        const isValid = await verifySignature(payloadStr, signature);
        if (!isValid) {
            return null; // 签名无效
        }

        const payload = JSON.parse(payloadStr);
        if (payload.exp < Date.now()) {
            return null; // token 过期
        }
        return payload;
    } catch {
        return null;
    }
}

// 获取客户端IP（用于登录限制）
function getClientIP(request) {
    return request.headers.get('CF-Connecting-IP') ||
           request.headers.get('X-Real-IP') ||
           request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
           'unknown';
}

// 检查登录限制
async function checkLoginLimit(env, identifier) {
    try {
        const record = await env.DB.prepare(
            'SELECT attempts, locked_until FROM login_attempts WHERE identifier = ?'
        ).bind(identifier).first();

        if (!record) {
            return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
        }

        const now = Date.now();

        // 检查是否仍在锁定期
        if (record.locked_until && record.locked_until > now) {
            const remainingSeconds = Math.ceil((record.locked_until - now) / 1000);
            const remainingMinutes = Math.ceil(remainingSeconds / 60);
            return {
                allowed: false,
                remainingAttempts: 0,
                lockedUntil: record.locked_until,
                message: `账号已被锁定，请${remainingMinutes}分钟后再试`
            };
        }

        // 如果锁定期已过，重置计数
        if (record.locked_until && record.locked_until <= now) {
            await env.DB.prepare(
                'UPDATE login_attempts SET attempts = 0, locked_until = NULL WHERE identifier = ?'
            ).bind(identifier).run();
            return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
        }

        return {
            allowed: true,
            remainingAttempts: MAX_LOGIN_ATTEMPTS - record.attempts
        };
    } catch (error) {
        // 如果表不存在，返回允许登录
        console.error('checkLoginLimit error:', error);
        return { allowed: true, remainingAttempts: MAX_LOGIN_ATTEMPTS };
    }
}

// 记录登录失败
async function recordLoginFailure(env, identifier) {
    try {
        const now = Date.now();

        // 尝试获取现有记录
        const record = await env.DB.prepare(
            'SELECT attempts FROM login_attempts WHERE identifier = ?'
        ).bind(identifier).first();

        if (!record) {
            // 创建新记录
            await env.DB.prepare(
                'INSERT INTO login_attempts (identifier, attempts, last_attempt) VALUES (?, 1, ?)'
            ).bind(identifier, now).run();
            return MAX_LOGIN_ATTEMPTS - 1;
        }

        const newAttempts = record.attempts + 1;

        if (newAttempts >= MAX_LOGIN_ATTEMPTS) {
            // 达到限制，锁定账号
            const lockedUntil = now + LOCKOUT_DURATION;
            await env.DB.prepare(
                'UPDATE login_attempts SET attempts = ?, last_attempt = ?, locked_until = ? WHERE identifier = ?'
            ).bind(newAttempts, now, lockedUntil, identifier).run();
            return 0;
        } else {
            // 增加失败次数
            await env.DB.prepare(
                'UPDATE login_attempts SET attempts = ?, last_attempt = ? WHERE identifier = ?'
            ).bind(newAttempts, now, identifier).run();
            return MAX_LOGIN_ATTEMPTS - newAttempts;
        }
    } catch (error) {
        console.error('recordLoginFailure error:', error);
        return MAX_LOGIN_ATTEMPTS;
    }
}

// 清除登录失败记录（登录成功时调用）
async function clearLoginFailure(env, identifier) {
    try {
        await env.DB.prepare(
            'DELETE FROM login_attempts WHERE identifier = ?'
        ).bind(identifier).run();
    } catch (error) {
        console.error('clearLoginFailure error:', error);
    }
}

// 注册
export async function handleRegister(request, env) {
    try {
        // 初始化认证模块
        initAuth(env);

        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (username.length < 2 || username.length > 20) {
            return new Response(JSON.stringify({ error: '用户名长度必须在2-20个字符之间' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        if (password.length < 6) {
            return new Response(JSON.stringify({ error: '密码长度至少6个字符' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 检查用户名是否已存在
        const existing = await env.DB.prepare(
            'SELECT id FROM users WHERE username = ?'
        ).bind(username).first();

        if (existing) {
            return new Response(JSON.stringify({ error: '用户名已被使用' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 哈希密码
        const passwordHash = await hashPassword(password);

        // 创建用户
        const result = await env.DB.prepare(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
        ).bind(username, passwordHash, 'user').run();

        const userId = result.meta.last_row_id;

        // 生成 token
        const user = { id: userId, username, role: 'user' };
        const token = await generateToken(user);

        return new Response(JSON.stringify({
            success: true,
            token,
            user: { id: userId, username, role: 'user' }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 登录
export async function handleLogin(request, env) {
    try {
        // 初始化认证模块
        initAuth(env);

        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 获取客户端标识（IP + 用户名组合，防止针对特定用户的暴力破解）
        const clientIP = getClientIP(request);
        const identifier = `${clientIP}:${username}`;

        // 检查登录限制
        const limitCheck = await checkLoginLimit(env, identifier);
        if (!limitCheck.allowed) {
            return new Response(JSON.stringify({
                error: limitCheck.message,
                locked: true,
                lockedUntil: limitCheck.lockedUntil
            }), {
                status: 429,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 硬编码管理员账号（请修改为你自己的用户名和密码）
        if (username === 'admin' && password === 'admin123') {
            // 登录成功，清除失败记录
            await clearLoginFailure(env, identifier);
            const token = await generateToken({ id: 0, username: 'admin', role: 'admin' });
            return new Response(JSON.stringify({
                success: true,
                token,
                user: { id: 0, username: 'admin', role: 'admin' }
            }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 查询用户
        const user = await env.DB.prepare(
            'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
            // 记录失败并返回剩余次数
            const remaining = await recordLoginFailure(env, identifier);
            const errorMsg = remaining > 0
                ? `用户名或密码错误，还剩${remaining}次机会`
                : `登录失败次数过多，账号已锁定10分钟`;
            return new Response(JSON.stringify({
                error: errorMsg,
                remainingAttempts: remaining
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 验证密码
        const passwordHash = await hashPassword(password);
        if (passwordHash !== user.password_hash) {
            // 记录失败并返回剩余次数
            const remaining = await recordLoginFailure(env, identifier);
            const errorMsg = remaining > 0
                ? `用户名或密码错误，还剩${remaining}次机会`
                : `登录失败次数过多，账号已锁定10分钟`;
            return new Response(JSON.stringify({
                error: errorMsg,
                remainingAttempts: remaining
            }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 登录成功，清除失败记录
        await clearLoginFailure(env, identifier);

        // 生成 token
        const token = await generateToken(user);

        return new Response(JSON.stringify({
            success: true,
            token,
            user: { id: user.id, username: user.username, role: user.role }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 获取当前用户信息
export async function handleGetMe(request, env) {
    try {
        // 初始化认证模块
        initAuth(env);

        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: '未授权' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const token = authHeader.substring(7);
        const payload = await verifyToken(token);

        if (!payload) {
            return new Response(JSON.stringify({ error: 'Token无效或已过期' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return new Response(JSON.stringify({
            success: true,
            user: { id: payload.id, username: payload.username, role: payload.role }
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 认证中间件 - 从 token 中提取用户信息（异步版本）
export async function authenticate(request, env) {
    // 初始化认证模块
    initAuth(env);

    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    return await verifyToken(token);
}
