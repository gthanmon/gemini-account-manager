/**
 * 账号列表查询接口
 * GET /api/accounts
 */

export async function handleList(request, env, currentUser) {
    try {
        const url = new URL(request.url);
        const type = url.searchParams.get('type');
        const status = url.searchParams.get('status');
        const search = url.searchParams.get('search');

        // 构建查询条件
        let query = 'SELECT * FROM accounts WHERE 1=1';
        const params = [];

        // 用户隔离:普通用户只能看到自己的账号,管理员可以看到所有
        if (currentUser.role !== 'admin') {
            query += ' AND user_id = ?';
            params.push(currentUser.id);
        }

        if (type) {
            query += ' AND type = ?';
            params.push(type);
        }

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        if (search) {
            query += ' AND (email LIKE ? OR backup_email LIKE ? OR batch_tag LIKE ? OR slots LIKE ? OR buyer_name LIKE ? OR buyer_order LIKE ?)';
            const searchPattern = `%${search}%`;
            params.push(searchPattern, searchPattern, searchPattern, searchPattern, searchPattern, searchPattern);
        }

        query += ' ORDER BY created_at DESC';

        // 执行查询
        const stmt = env.DB.prepare(query).bind(...params);
        const { results } = await stmt.all();

        // 解析 slots JSON
        const accounts = results.map(account => ({
            ...account,
            slots: JSON.parse(account.slots || '[]')
        }));

        return new Response(JSON.stringify({
            accounts
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
