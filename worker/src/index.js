/**
 * Cloudflare Worker 主入口
 * Account Manager Pro Backend
 */

import { handleImport } from './routes/import.js';
import { handleList } from './routes/list.js';
import { handleUpdate } from './routes/update.js';
import { handleRegister, handleLogin, handleGetMe, authenticate } from './routes/auth.js';
import { handleGetUsers, handleDeleteUser } from './routes/admin.js';
import { handleDeleteAccount } from './routes/delete.js';

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // CORS 处理
        if (request.method === 'OPTIONS') {
            return handleCORS();
        }

        // 路由分发
        try {
            // ===== 公开路由(无需认证) =====

            // 用户注册
            if (path === '/api/auth/register' && request.method === 'POST') {
                const response = await handleRegister(request, env);
                return addCORSHeaders(response);
            }

            // 用户登录
            if (path === '/api/auth/login' && request.method === 'POST') {
                const response = await handleLogin(request, env);
                return addCORSHeaders(response);
            }

            // ===== 需要认证的路由 =====

            // 认证检查
            const currentUser = authenticate(request);
            if (!currentUser) {
                const errorResponse = new Response(JSON.stringify({ error: '未授权,请先登录' }), {
                    status: 401,
                    headers: { 'Content-Type': 'application/json' }
                });
                return addCORSHeaders(errorResponse);
            }

            // 获取当前用户信息
            if (path === '/api/auth/me' && request.method === 'GET') {
                const response = await handleGetMe(request, env);
                return addCORSHeaders(response);
            }

            // 管理员 - 获取所有用户
            if (path === '/api/admin/users' && request.method === 'GET') {
                const response = await handleGetUsers(request, env, currentUser);
                return addCORSHeaders(response);
            }

            // 管理员 - 删除用户
            if (path.startsWith('/api/admin/users/') && request.method === 'DELETE') {
                const userId = parseInt(path.split('/')[4]);
                if (isNaN(userId)) {
                    const errorResponse = new Response(JSON.stringify({ error: '无效的用户 ID' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return addCORSHeaders(errorResponse);
                }
                const response = await handleDeleteUser(request, env, currentUser, userId);
                return addCORSHeaders(response);
            }

            // 导入接口
            if (path === '/api/import' && request.method === 'POST') {
                const response = await handleImport(request, env, currentUser);
                return addCORSHeaders(response);
            }

            // 列表查询接口
            if (path === '/api/accounts' && request.method === 'GET') {
                const response = await handleList(request, env, currentUser);
                return addCORSHeaders(response);
            }

            // 账号更新接口
            if (path.startsWith('/api/accounts/') && request.method === 'PATCH') {
                const accountId = parseInt(path.split('/')[3]);
                if (isNaN(accountId)) {
                    const errorResponse = new Response(JSON.stringify({ error: '无效的账号 ID' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return addCORSHeaders(errorResponse);
                }
                const response = await handleUpdate(request, env, accountId, currentUser);
                return addCORSHeaders(response);
            }

            // 删除账号接口
            if (path.startsWith('/api/accounts/') && request.method === 'DELETE') {
                const accountId = parseInt(path.split('/')[3]);
                if (isNaN(accountId)) {
                    const errorResponse = new Response(JSON.stringify({ error: '无效的账号 ID' }), {
                        status: 400,
                        headers: { 'Content-Type': 'application/json' }
                    });
                    return addCORSHeaders(errorResponse);
                }
                const response = await handleDeleteAccount(request, env, accountId, currentUser);
                return addCORSHeaders(response);
            }

            // 统计接口
            if (path === '/api/stats' && request.method === 'GET') {
                const response = await handleStats(env, currentUser);
                return addCORSHeaders(response);
            }

            // 获取到期通知
            if (path === '/api/notifications/expired' && request.method === 'GET') {
                const response = await handleExpiredNotifications(env, currentUser);
                return addCORSHeaders(response);
            }

            // 404
            const notFoundResponse = new Response(JSON.stringify({ error: '接口不存在' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
            return addCORSHeaders(notFoundResponse);

        } catch (error) {
            const errorResponse = new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { 'Content-Type': 'application/json' }
            });
            return addCORSHeaders(errorResponse);
        }
    }
};

// CORS 预检请求
function handleCORS() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400'
        }
    });
}

// 添加 CORS 头
function addCORSHeaders(response) {
    const newResponse = new Response(response.body, response);
    newResponse.headers.set('Access-Control-Allow-Origin', '*');
    newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return newResponse;
}

// 统计接口
async function handleStats(env, currentUser) {
    try {
        // 管理员可以看到所有数据,普通用户只能看到自己的
        const userFilter = currentUser.role === 'admin' ? '' : `WHERE user_id = ${currentUser.id}`;

        const stats = await env.DB.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN type = 'PERSONAL' AND status = 'ACTIVE' THEN 1 ELSE 0 END) as personalActive,
        SUM(CASE WHEN type = 'PERSONAL' AND status = 'SOLD' THEN 1 ELSE 0 END) as personalSold,
        SUM(CASE WHEN type = 'FAMILY' AND status = 'ACTIVE' THEN 1 ELSE 0 END) as familyActive,
        SUM(CASE WHEN status = 'BANNED' THEN 1 ELSE 0 END) as bannedCount,
        SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pendingCount
      FROM accounts ${userFilter}
    `).first();

        // 计算车位统计和收入
        const familyQuery = currentUser.role === 'admin'
            ? "SELECT slots FROM accounts WHERE type = 'FAMILY'"
            : "SELECT slots FROM accounts WHERE type = 'FAMILY' AND user_id = ?";

        const familyAccounts = currentUser.role === 'admin'
            ? await env.DB.prepare(familyQuery).all()
            : await env.DB.prepare(familyQuery).bind(currentUser.id).all();

        let totalSlots = 0;
        let usedSlots = 0;
        let slotRevenue = 0;

        familyAccounts.results.forEach(account => {
            const slots = JSON.parse(account.slots || '[]');
            totalSlots += 5;
            slots.forEach(slot => {
                if (slot !== null) {
                    usedSlots++;
                    // 累加车位收入
                    if (slot.price) {
                        const price = parseFloat(slot.price);
                        if (!isNaN(price)) {
                            slotRevenue += price;
                        }
                    }
                }
            });
        });

        // 计算个人号售出收入
        const soldQuery = currentUser.role === 'admin'
            ? "SELECT buyer_price FROM accounts WHERE type = 'PERSONAL' AND status = 'SOLD' AND buyer_price IS NOT NULL"
            : "SELECT buyer_price FROM accounts WHERE type = 'PERSONAL' AND status = 'SOLD' AND buyer_price IS NOT NULL AND user_id = ?";

        const soldAccounts = currentUser.role === 'admin'
            ? await env.DB.prepare(soldQuery).all()
            : await env.DB.prepare(soldQuery).bind(currentUser.id).all();

        let personalRevenue = 0;
        soldAccounts.results.forEach(account => {
            if (account.buyer_price) {
                const price = parseFloat(account.buyer_price);
                if (!isNaN(price)) {
                    personalRevenue += price;
                }
            }
        });

        const totalRevenue = slotRevenue + personalRevenue;

        return new Response(JSON.stringify({
            totalAccounts: stats.total,
            personalActive: stats.personalActive,
            personalSold: stats.personalSold,
            familyActive: stats.familyActive,
            bannedCount: stats.bannedCount,
            pendingCount: stats.pendingCount,
            totalSlots,
            usedSlots,
            availableSlots: totalSlots - usedSlots,
            totalRevenue: totalRevenue.toFixed(2),
            slotRevenue: slotRevenue.toFixed(2),
            personalRevenue: personalRevenue.toFixed(2)
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

// 获取到期通知
async function handleExpiredNotifications(env, currentUser) {
    try {
        // 查询家庭组账号
        const familyQuery = currentUser.role === 'admin'
            ? "SELECT id, email, slots FROM accounts WHERE type = 'FAMILY' AND status = 'ACTIVE'"
            : "SELECT id, email, slots FROM accounts WHERE type = 'FAMILY' AND status = 'ACTIVE' AND user_id = ?";

        const familyAccounts = currentUser.role === 'admin'
            ? await env.DB.prepare(familyQuery).all()
            : await env.DB.prepare(familyQuery).bind(currentUser.id).all();

        const now = new Date();
        // 提前1天提醒阈值
        const soonThreshold = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
        const notifications = [];

        familyAccounts.results.forEach(account => {
            const slots = JSON.parse(account.slots || '[]');
            slots.forEach((slot, index) => {
                if (slot !== null && slot.expiresAt) {
                    const expiresAt = new Date(slot.expiresAt);

                    // 已到期（过期时间 <= 当前时间）
                    if (expiresAt <= now) {
                        notifications.push({
                            accountId: account.id,
                            accountEmail: account.email,
                            slotIndex: index,
                            buyer: slot.buyer,
                            expireDays: slot.expireDays,
                            expiresAt: slot.expiresAt,
                            assignedAt: slot.assignedAt,
                            status: 'expired',  // 已到期
                            statusText: '已到期'
                        });
                    }
                    // 即将到期（1天内到期但还没到期）
                    else if (expiresAt <= soonThreshold) {
                        notifications.push({
                            accountId: account.id,
                            accountEmail: account.email,
                            slotIndex: index,
                            buyer: slot.buyer,
                            expireDays: slot.expireDays,
                            expiresAt: slot.expiresAt,
                            assignedAt: slot.assignedAt,
                            status: 'expiring',  // 即将到期
                            statusText: '即将到期'
                        });
                    }
                }
            });
        });

        return new Response(JSON.stringify({
            success: true,
            count: notifications.length,
            notifications: notifications
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
