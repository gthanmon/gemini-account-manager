
export async function handleDeleteAccount(request, env, accountId, currentUser) {
    try {
        // 1. 检查账号是否存在以及权限
        // 如果是管理员，可以删除任何账号
        // 如果是普通用户，只能删除自己的账号
        const userFilter = currentUser.role === 'admin' ? '' : `AND user_id = ${currentUser.id}`;
        
        const account = await env.DB.prepare(`
            SELECT id FROM accounts WHERE id = ? ${userFilter}
        `).bind(accountId).first();

        if (!account) {
            const errorMsg = currentUser.role === 'admin' ? '账号不存在' : '账号不存在或无权删除';
            return new Response(JSON.stringify({ error: errorMsg }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        // 2. 执行删除
        await env.DB.prepare(`
            DELETE FROM accounts WHERE id = ?
        `).bind(accountId).run();

        return new Response(JSON.stringify({ success: true, message: '账号已删除' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Delete User Account Error:', error);
        return new Response(JSON.stringify({ error: '删除失败: ' + error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}
