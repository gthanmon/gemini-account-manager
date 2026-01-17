/**
 * 账号更新接口
 * PATCH /api/accounts/:id
 */

import { getCurrentTOTP } from '../utils/otp.js';

export async function handleUpdate(request, env, accountId, currentUser) {
    try {
        const data = await request.json();
        const { action } = data;

        // 验证账号所有权(管理员除外)
        if (currentUser.role !== 'admin') {
            const account = await env.DB.prepare(
                'SELECT user_id FROM accounts WHERE id = ?'
            ).bind(accountId).first();

            if (!account) {
                return new Response(JSON.stringify({ error: '账号不存在' }), {
                    status: 404,
                    headers: { 'Content-Type': 'application/json' }
                });
            }

            if (account.user_id !== currentUser.id) {
                return new Response(JSON.stringify({ error: '无权操作此账号' }), {
                    status: 403,
                    headers: { 'Content-Type': 'application/json' }
                });
            }
        }

        // 处理不同的更新操作
        switch (action) {
            case 'convertToFamily':
                return await convertToFamily(env, accountId);

            case 'convertToPersonal':
                return await convertToPersonal(env, accountId);

            case 'updateSlot':
                return await updateSlot(env, accountId, data);

            case 'updateStatus':
                return await updateStatus(env, accountId, data.status, data.banReason);

            case 'sellPersonal':
                return await sellPersonal(env, accountId, data);

            case 'cancelSold':
                return await cancelSold(env, accountId);

            case 'getTOTP':
                return await getTOTP(env, accountId);

            default:
                return new Response(JSON.stringify({ error: '未知的操作类型' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
        }

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

// 转换为家庭组
async function convertToFamily(env, accountId) {
    const slots = JSON.stringify([null, null, null, null, null]);

    await env.DB.prepare(
        'UPDATE accounts SET type = ?, slots = ? WHERE id = ?'
    ).bind('FAMILY', slots, accountId).run();

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 还原为个人号
async function convertToPersonal(env, accountId) {
    // 获取账号信息
    const account = await env.DB.prepare(
        'SELECT * FROM accounts WHERE id = ?'
    ).bind(accountId).first();

    if (!account) {
        return new Response(JSON.stringify({ error: '账号不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 检查是否有已售出的车位
    const slots = JSON.parse(account.slots || '[]');
    const hasOccupiedSlots = slots.some(slot => slot !== null);

    if (hasOccupiedSlots) {
        return new Response(JSON.stringify({
            success: false,
            error: '该家庭组还有已售出的车位,无法转回个人号。请先收回所有车位。'
        }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    await env.DB.prepare(
        "UPDATE accounts SET type = 'PERSONAL', slots = '[]' WHERE id = ?"
    ).bind(accountId).run();

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 更新车位
async function updateSlot(env, accountId, data) {
    const { slotIndex, slotAction, buyer, order, price } = data;

    // 获取当前账号
    const account = await env.DB.prepare(
        'SELECT * FROM accounts WHERE id = ?'
    ).bind(accountId).first();

    if (!account) {
        return new Response(JSON.stringify({ error: '账号不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const slots = JSON.parse(account.slots || '[]');

    if (slotIndex < 0 || slotIndex >= 5) {
        return new Response(JSON.stringify({ error: '车位索引无效' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 执行操作
    if (slotAction === 'assign') {
        slots[slotIndex] = {
            buyer,
            order: order || null,
            price: price || null,
            assignedAt: new Date().toISOString()
        };
    } else if (slotAction === 'release') {
        slots[slotIndex] = null;
    }

    // 更新数据库
    await env.DB.prepare(
        'UPDATE accounts SET slots = ? WHERE id = ?'
    ).bind(JSON.stringify(slots), accountId).run();

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 更新状态
async function updateStatus(env, accountId, status, banReason = null) {
    const validStatuses = ['ACTIVE', 'SOLD', 'INVALID', 'BANNED', 'PENDING'];

    if (!validStatuses.includes(status)) {
        return new Response(JSON.stringify({ error: '无效的状态' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 如果是标记为BANNED，需要封禁原因
    if (status === 'BANNED') {
        if (!banReason) {
            return new Response(JSON.stringify({ error: '封禁原因不能为空' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        await env.DB.prepare(
            'UPDATE accounts SET status = ?, ban_reason = ?, banned_at = CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(status, banReason, accountId).run();
    } else {
        await env.DB.prepare(
            'UPDATE accounts SET status = ? WHERE id = ?'
        ).bind(status, accountId).run();
    }

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 标记个人号为已售出
async function sellPersonal(env, accountId, data) {
    const { buyerName, buyerOrder, buyerPrice } = data;

    if (!buyerName) {
        return new Response(JSON.stringify({ error: '买家昵称不能为空' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 检查是否为个人号
    const account = await env.DB.prepare(
        'SELECT type FROM accounts WHERE id = ?'
    ).bind(accountId).first();

    if (!account) {
        return new Response(JSON.stringify({ error: '账号不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (account.type !== 'PERSONAL') {
        return new Response(JSON.stringify({ error: '只能售出个人号' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 更新为已售出状态并保存买家信息
    const soldAt = new Date().toISOString();
    await env.DB.prepare(
        'UPDATE accounts SET status = ?, buyer_name = ?, buyer_order = ?, buyer_price = ?, sold_at = ? WHERE id = ?'
    ).bind('SOLD', buyerName, buyerOrder || null, buyerPrice || null, soldAt, accountId).run();

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 获取 TOTP 验证码
async function getTOTP(env, accountId) {
    const account = await env.DB.prepare(
        'SELECT twofa_secret FROM accounts WHERE id = ?'
    ).bind(accountId).first();

    if (!account || !account.twofa_secret) {
        return new Response(JSON.stringify({ error: '该账号没有配置 2FA' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const totp = await getCurrentTOTP(account.twofa_secret);

    return new Response(JSON.stringify(totp), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}

// 取消售出
async function cancelSold(env, accountId) {
    // 检查账号是否存在且为已售出状态
    const account = await env.DB.prepare(
        'SELECT status, type FROM accounts WHERE id = ?'
    ).bind(accountId).first();

    if (!account) {
        return new Response(JSON.stringify({ error: '账号不存在' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (account.status !== 'SOLD') {
        return new Response(JSON.stringify({ error: '该账号未处于已售出状态' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    if (account.type !== 'PERSONAL') {
        return new Response(JSON.stringify({ error: '只能取消个人号的售出状态' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // 恢复为ACTIVE状态，清除买家信息
    await env.DB.prepare(
        'UPDATE accounts SET status = ?, buyer_name = NULL, buyer_order = NULL, buyer_price = NULL, sold_at = NULL WHERE id = ?'
    ).bind('ACTIVE', accountId).run();

    return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });
}
