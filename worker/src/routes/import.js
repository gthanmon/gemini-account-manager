/**
 * 导入账号接口
 * POST /api/import
 */

import { parseMultipleLines } from '../utils/parser.js';

export async function handleImport(request, env, currentUser) {
    try {
        const { text, batchTag } = await request.json();

        if (!text || typeof text !== 'string') {
            return new Response(JSON.stringify({ error: '请提供有效的文本内容' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 解析文本
        const accounts = parseMultipleLines(text);

        if (accounts.length === 0) {
            return new Response(JSON.stringify({ error: '未能解析出有效的账号信息' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 批量插入数据库
        let successCount = 0;
        let skipCount = 0;
        const errors = [];

        for (const account of accounts) {
            try {
                await env.DB.prepare(
                    `INSERT INTO accounts (email, password, backup_email, twofa_secret, batch_tag, type, status, slots, user_id)
           VALUES (?, ?, ?, ?, ?, 'PERSONAL', 'ACTIVE', '[]', ?)`
                ).bind(
                    account.email,
                    account.password,
                    account.backup_email,
                    account.twofa_secret,
                    batchTag || null,
                    currentUser.id
                ).run();

                successCount++;
            } catch (error) {
                // UNIQUE 约束冲突,说明邮箱已存在
                if (error.message.includes('UNIQUE')) {
                    skipCount++;
                } else {
                    errors.push({ email: account.email, error: error.message });
                }
            }
        }

        return new Response(JSON.stringify({
            success: true,
            total: accounts.length,
            successCount,
            skipCount,
            errors: errors.length > 0 ? errors : undefined
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
