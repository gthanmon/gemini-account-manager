/**
 * 管理员 API
 * - 获取所有用户及其统计信息
 */

export async function handleGetUsers(request, env, currentUser) {
    try {
        // 验证管理员权限
        if (!currentUser || currentUser.role !== 'admin') {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 获取所有用户
        const users = await env.DB.prepare(
            'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
        ).all();

        // 为每个用户获取统计信息
        const usersWithStats = await Promise.all(users.results.map(async (user) => {
            const stats = await env.DB.prepare(`
                SELECT 
                    COUNT(*) as total,
                    SUM(CASE WHEN type = 'PERSONAL' AND status = 'ACTIVE' THEN 1 ELSE 0 END) as personalActive,
                    SUM(CASE WHEN type = 'PERSONAL' AND status = 'SOLD' THEN 1 ELSE 0 END) as personalSold,
                    SUM(CASE WHEN type = 'FAMILY' THEN 1 ELSE 0 END) as familyCount
                FROM accounts WHERE user_id = ?
            `).bind(user.id).first();

            // 计算收入
            const soldAccounts = await env.DB.prepare(
                'SELECT buyer_price FROM accounts WHERE user_id = ? AND status = "SOLD" AND buyer_price IS NOT NULL'
            ).bind(user.id).all();

            let revenue = 0;
            soldAccounts.results.forEach(acc => {
                if (acc.buyer_price) {
                    const price = parseFloat(acc.buyer_price);
                    if (!isNaN(price)) revenue += price;
                }
            });

            // 计算车位收入
            const familyAccounts = await env.DB.prepare(
                'SELECT slots FROM accounts WHERE user_id = ? AND type = "FAMILY"'
            ).bind(user.id).all();

            let slotRevenue = 0;
            familyAccounts.results.forEach(acc => {
                const slots = JSON.parse(acc.slots || '[]');
                slots.forEach(slot => {
                    if (slot && slot.price) {
                        const price = parseFloat(slot.price);
                        if (!isNaN(price)) slotRevenue += price;
                    }
                });
            });

            return {
                ...user,
                stats: {
                    total: stats.total || 0,
                    personalActive: stats.personalActive || 0,
                    personalSold: stats.personalSold || 0,
                    familyCount: stats.familyCount || 0,
                    revenue: (revenue + slotRevenue).toFixed(2)
                }
            };
        }));

        return new Response(JSON.stringify({
            success: true,
            users: usersWithStats
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

// 删除用户
export async function handleDeleteUser(request, env, currentUser, userId) {
    try {
        // 验证管理员权限
        if (!currentUser || currentUser.role !== 'admin') {
            return new Response(JSON.stringify({ error: '需要管理员权限' }), {
                status: 403,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 不能删除管理员账号
        if (userId === 0) {
            return new Response(JSON.stringify({ error: '不能删除管理员账号' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 检查用户是否存在
        const user = await env.DB.prepare(
            'SELECT id, username FROM users WHERE id = ?'
        ).bind(userId).first();

        if (!user) {
            return new Response(JSON.stringify({ error: '用户不存在' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 删除用户(由于外键约束,相关的 accounts 也会被删除)
        await env.DB.prepare(
            'DELETE FROM users WHERE id = ?'
        ).bind(userId).run();

        return new Response(JSON.stringify({
            success: true,
            message: `用户 ${user.username} 已删除`
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
