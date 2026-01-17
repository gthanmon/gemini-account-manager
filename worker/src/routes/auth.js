/**
 * 认证相关 API
 * - 用户注册
 * - 用户登录
 * - 获取当前用户信息
 */

// SHA-256 密码哈希
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

// 生成简单的 JWT token (base64编码的用户信息)
function generateToken(user) {
    const payload = {
        id: user.id,
        username: user.username,
        role: user.role,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7天过期
    };
    return btoa(JSON.stringify(payload));
}

// 验证 token
function verifyToken(token) {
    try {
        const payload = JSON.parse(atob(token));
        if (payload.exp < Date.now()) {
            return null; // token 过期
        }
        return payload;
    } catch {
        return null;
    }
}

// 注册
export async function handleRegister(request, env) {
    try {
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
        const token = generateToken(user);

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
        const { username, password } = await request.json();

        if (!username || !password) {
            return new Response(JSON.stringify({ error: '用户名和密码不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 硬编码管理员账号 (TODO: 建议修改此处默认密码)
        if (username === 'admin' && password === 'admin123') {
            const token = generateToken({ id: 0, username: 'admin', role: 'admin' });
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
            return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 验证密码
        const passwordHash = await hashPassword(password);
        if (passwordHash !== user.password_hash) {
            return new Response(JSON.stringify({ error: '用户名或密码错误' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 生成 token
        const token = generateToken(user);

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
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: '未授权' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        const token = authHeader.substring(7);
        const payload = verifyToken(token);

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

// 认证中间件 - 从 token 中提取用户信息
export function authenticate(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }

    const token = authHeader.substring(7);
    return verifyToken(token);
}
