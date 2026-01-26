/**
 * Account Manager Pro - 前端主逻辑
 */

// API_BASE_URL 在 config.js 中定义，只需修改一次

// 全局状态
let currentSlotEdit = null;
let accounts = [];
let currentUser = null;
let authToken = null;
const totpTimers = {}; // 存储TOTP倒计时定时器
let currentBanAccountId = null; // 当前要封禁的账号ID

// ===== 认证检查 =====
function checkAuth() {
    authToken = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');

    if (!authToken || !userStr) {
        // 未登录,跳转到登录页
        window.location.href = 'login.html';
        return false;
    }

    try {
        currentUser = JSON.parse(userStr);

        // 如果是管理员,跳转到管理员页面
        if (currentUser.role === 'admin') {
            window.location.href = 'admin.html';
            return false;
        }

        return true;
    } catch (e) {
        // 解析失败,清除并跳转
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
        return false;
    }
}

// ===== 辅助函数:生成带认证的请求头 =====
function getAuthHeaders(additionalHeaders = {}) {
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`,
        ...additionalHeaders
    };
}

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
    // 先检查登录状态
    if (!checkAuth()) {
        return;
    }

    initNavigation();
    initImport();
    initList();
    initBatchControls();
    loadStats();
    initNotifications(); // 初始化到期通知检查

    // 默认显示账号列表视图
    document.getElementById('list-view').classList.add('active');

    // 退出登录
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
    });
});

// ===== 导航切换 =====
function initNavigation() {
    const navBtns = document.querySelectorAll('.nav-btn');
    const views = document.querySelectorAll('.view');

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const viewName = btn.dataset.view;

            // 更新按钮状态
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 切换视图
            views.forEach(v => v.classList.remove('active'));
            document.getElementById(`${viewName}-view`).classList.add('active');

            // 加载对应数据
            if (viewName === 'list') {
                loadAccounts();
            }
        });
    });
}

// ===== 导入功能 =====
function initImport() {
    const importBtn = document.getElementById('import-btn');
    const importText = document.getElementById('import-text');
    const batchTag = document.getElementById('batch-tag');
    const resultDiv = document.getElementById('import-result');

    importBtn.addEventListener('click', async () => {
        const text = importText.value.trim();
        if (!text) {
            showToast('请输入账号数据', 'error');
            return;
        }

        importBtn.disabled = true;
        importBtn.textContent = '导入中...';

        try {
            const response = await fetch(`${API_BASE_URL}/api/import`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    text,
                    batchTag: batchTag.value.trim()
                })
            });

            const data = await response.json();

            if (data.success) {
                let errorDetails = '';
                if (data.errors && data.errors.length > 0) {
                    errorDetails = '<div style="margin-top: 1rem; padding: 1rem; background: rgba(239, 68, 68, 0.1); border-radius: 8px;"><strong>错误详情:</strong><ul style="margin-top: 0.5rem; padding-left: 1.5rem;">';
                    data.errors.forEach(err => {
                        errorDetails += `<li style="margin-bottom: 0.5rem;"><strong>${err.email}</strong>: ${err.error}</li>`;
                    });
                    errorDetails += '</ul></div>';
                }

                resultDiv.innerHTML = `
          <div style="color: var(--color-success); font-size: 1.1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 8px;">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>
            导入成功!
          </div>
          <div style="color: var(--color-text-secondary); display: flex; flex-direction: column; gap: 6px;">
            <p style="display: flex; align-items: center; gap: 6px; margin: 0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="20" y2="10"/><line x1="18" x2="18" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="16"/></svg> 总计: ${data.total} 条</p>
            <p style="display: flex; align-items: center; gap: 6px; margin: 0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg> 成功: ${data.successCount} 条</p>
            <p style="display: flex; align-items: center; gap: 6px; margin: 0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-warning)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg> 跳过(重复): ${data.skipCount} 条</p>
            ${data.errors ? `<p style="color: var(--color-danger); display: flex; align-items: center; gap: 6px; margin: 0;"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg> 错误: ${data.errors.length} 条</p>` : ''}
          </div>
          ${errorDetails}
        `;
                importText.value = '';
                showToast(`成功导入 ${data.successCount} 个账号`, 'success');
                loadStats(); // 刷新统计
            } else {
                resultDiv.innerHTML = `<div style="color: var(--danger);">${data.error}</div>`;
                showToast(data.error, 'error');
            }
        } catch (error) {
            resultDiv.innerHTML = `<div style="color: var(--danger);">网络错误: ${error.message}</div>`;
            showToast('导入失败,请检查网络连接', 'error');
        } finally {
            importBtn.disabled = false;
            importBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg> 开始导入';
        }
    });
}

// ===== 列表功能 =====
let currentTab = 'personal'; // 当前激活的标签页

// 切换标签页（通过点击统计卡片）
function switchTab(tabName) {
    // 更新卡片状态
    document.querySelectorAll('.stat-card.clickable').forEach(card => {
        card.classList.remove('active');
    });
    const activeCard = document.querySelector(`.stat-card[data-tab="${tabName}"]`);
    if (activeCard) {
        activeCard.classList.add('active');
    }

    // 切换内容
    document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.remove('active');
    });
    document.getElementById(`${tabName}-tab-content`).classList.add('active');

    // 更新当前标签
    currentTab = tabName;

    // 清空选择状态
    selectedAccountIds.clear();
    document.getElementById('select-all-checkbox').checked = false;
    updateBatchUI();

    // 加载对应数据
    loadAccounts();
}

// 暴露到全局
window.switchTab = switchTab;

function initList() {
    const searchInput = document.getElementById('search-input');
    const refreshBtn = document.getElementById('refresh-btn');
    const tabBtns = document.querySelectorAll('.tab-btn');

    // 标签页切换
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;

            // 更新按钮状态
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // 切换内容
            document.querySelectorAll('.tab-content').forEach(content => {
                content.classList.remove('active');
            });
            document.getElementById(`${tabName}-tab-content`).classList.add('active');

            // 更新当前标签
            currentTab = tabName;

            // 清空选择状态
            selectedAccountIds.clear();
            document.getElementById('select-all-checkbox').checked = false;
            updateBatchUI();

            // 加载对应数据
            loadAccounts();
        });
    });

    // 搜索和筛选
    let searchTimeout;
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => loadAccounts(), 500);
    });

    refreshBtn.addEventListener('click', () => loadAccounts());

    // 初始加载
    loadAccounts();
}

// ===== 加载统计数据 =====
async function loadStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stats`, {
            headers: getAuthHeaders()
        });

        // 检查认证错误
        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return;
        }

        const data = await response.json();

        // 更新仪表盘统计
        document.getElementById('stat-revenue').textContent = `¥${data.totalRevenue || '0.00'}`;
        document.getElementById('stat-personal').textContent = data.personalActive || 0;
        document.getElementById('stat-sold').textContent = data.personalSold || 0;
        document.getElementById('stat-family').textContent = data.familyActive || 0;
        document.getElementById('stat-slots').textContent = data.availableSlots || 0;
        document.getElementById('stat-banned').textContent = data.bannedCount || 0;
    } catch (error) {
        console.error('Failed to load stats:', error);
        if (error.message !== 'Failed to fetch') {
            // 避免重复弹窗,仅非网络错误时提示
            showToast('统计数据加载失败', 'error');
        }
    }
}

// ===== 加载账号列表 =====
async function loadAccounts() {
    const searchInput = document.getElementById('search-input');

    // 根据当前标签页确定容器和过滤条件
    let containerType, typeFilter, statusFilterValue;

    if (currentTab === 'personal') {
        containerType = 'personal';
        typeFilter = 'PERSONAL';
        statusFilterValue = 'ACTIVE'; // 只显示未售出的
    } else if (currentTab === 'sold') {
        containerType = 'sold';
        typeFilter = 'PERSONAL';
        statusFilterValue = 'SOLD'; // 只显示已售出的
    } else if (currentTab === 'banned') {
        containerType = 'banned';
        typeFilter = ''; // 所有类型
        statusFilterValue = 'BANNED'; // 只显示异常的
    } else {
        containerType = 'family';
        typeFilter = 'FAMILY';
        statusFilterValue = 'ACTIVE'; // 家庭组只显示正常状态
    }

    const container = document.getElementById(`${containerType}-accounts-container`);
    const loading = document.getElementById(`${containerType}-loading`);
    const emptyState = document.getElementById(`${containerType}-empty`);

    // 构建查询参数
    const params = new URLSearchParams();
    if (typeFilter) params.append('type', typeFilter);

    // 根据标签页设置状态筛选
    params.append('status', statusFilterValue);

    if (searchInput.value.trim()) params.append('search', searchInput.value.trim());

    loading.classList.add('show');
    container.innerHTML = '';
    emptyState.classList.remove('show');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts?${params}`, {
            headers: getAuthHeaders()
        });

        // 检查认证错误
        if (response.status === 401) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            window.location.href = 'login.html';
            return;
        }

        const data = await response.json();

        accounts = data.accounts || [];

        if (accounts.length === 0) {
            emptyState.classList.add('show');
        } else {
            accounts.forEach(account => {
                container.appendChild(createAccountCard(account));
            });
        }

        // 更新计数
        loadStats();
    } catch (error) {
        console.error('Load Error:', error);
        alert(`数据加载失败!\nURL: ${API_BASE_URL}/api/accounts\n错误: ${error.message}\n请检查域名配置或截图联系开发。`);
        showToast('加载失败: ' + error.message, 'error');
    } finally {
        loading.classList.remove('show');

        // 自动加载所有2FA验证码
        accounts.forEach(account => {
            if (account.twofa_secret) {
                initTOTP(account.id);
            }
        });
    }
}

// ===== 创建账号卡片 =====
function createAccountCard(account) {
    const card = document.createElement('div');
    card.className = `account-card ${account.type.toLowerCase()} ${account.status.toLowerCase()}`;
    card.dataset.id = account.id;

    const statusMap = {
        'ACTIVE': '正常',
        'SOLD': '已售出',
        'INVALID': '异常',
        'BANNED': '异常号',
        'PENDING': '待审核'
    };

    card.innerHTML = `
    <div class="account-header">
      <div style="display: flex; align-items: center; gap: 8px;">
        <input type="checkbox" class="account-checkbox" data-id="${account.id}"
          onchange="toggleAccountSelection(${account.id}, this.checked)"
          style="width: 18px; height: 18px; cursor: pointer;">
        <span class="account-type-badge ${account.status === 'BANNED' ? 'badge-banned' : 'badge-' + account.type.toLowerCase()}">
          ${account.status === 'BANNED' ?
            '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg> 异常号' :
            (account.type === 'PERSONAL' ? '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> 个人号' : '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 家庭组')}
        </span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        ${account.status === 'BANNED' && account.ban_reason ? `
          <span class="account-status status-banned" style="font-size: 0.75rem; max-width: 120px; text-align: right; white-space: normal; line-height: 1.3;">
            ${account.ban_reason}
          </span>
        ` : ''}
      </div>
    </div>

    <div class="account-info">
      <div class="info-row">
        <span class="info-label">账号</span>
        <span class="info-value">
          ${account.email}
          <button class="copy-btn" onclick="copyAccountField(${account.id}, 'email')" title="复制"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">密码</span>
        <span class="info-value">
          ${maskPassword(account.password)}
          <button class="copy-btn" onclick="copyAccountField(${account.id}, 'password')" title="复制"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
        </span>
      </div>
      ${account.backup_email ? `
        <div class="info-row">
          <span class="info-label">辅邮</span>
          <span class="info-value">
            ${truncateEmail(account.backup_email)}
            <button class="copy-btn" onclick="copyAccountField(${account.id}, 'backup_email')" title="复制"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg></button>
          </span>
        </div>
      ` : ''}
      ${account.twofa_secret ? `
        <div class="info-row">
          <span class="info-label">2FA</span>
          <span class="info-value" id="totp-container-${account.id}">
            <span style="color: var(--text-muted); font-size: 0.9em;">加载中...</span>
          </span>
        </div>
      ` : ''}
      ${account.batch_tag ? `
        <div class="info-row">
          <span class="info-label">批次</span>
          <span class="info-value">${account.batch_tag}</span>
        </div>
      ` : ''}
    </div>

    ${account.type === 'FAMILY' ? createSlotsHTML(account) : ''}
    
    ${account.type === 'PERSONAL' && account.status === 'SOLD' && account.buyer_name ? `
      <div class="buyer-info">
        <div class="buyer-info-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> 售出信息</div>
        <div class="info-row">
          <span class="info-label">买家</span>
          <span class="info-value">${account.buyer_name}</span>
        </div>
        ${account.buyer_source ? `
          <div class="info-row">
            <span class="info-label">来源</span>
            <span class="info-value">${account.buyer_source}</span>
          </div>
        ` : ''}
        ${account.buyer_price ? `
          <div class="info-row">
            <span class="info-label">售价</span>
            <span class="info-value">${account.buyer_price}</span>
          </div>
        ` : ''}
        ${account.sold_at ? `
          <div class="info-row">
            <span class="info-label">售出时间</span>
            <span class="info-value">${new Date(account.sold_at).toLocaleString()}</span>
          </div>
        ` : ''}
      </div>
    ` : ''}

    <div class="account-actions${account.status === 'SOLD' ? ' sold-actions' : ''}${account.status === 'BANNED' ? ' banned-actions' : ''}">
      <button class="action-btn" onclick="copyFullAccount(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
        复制全部
      </button>
      ${account.status === 'SOLD' ? `
      <button class="action-btn" onclick="openEditSoldModal(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        编辑售出
      </button>
      <button class="action-btn warning" onclick="cancelSold(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        取消售出
      </button>
      <button class="action-btn danger" onclick="deleteAccount(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        删除账号
      </button>
      ` : `
      <button class="action-btn" onclick="openEditModal(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
        编辑账号
      </button>
      `}
      ${account.status !== 'BANNED' && account.type === 'PERSONAL' && account.status !== 'SOLD' ? `
        <button class="action-btn" onclick="convertToFamily(${account.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
          转家庭组
        </button>
        <button class="action-btn success" onclick="openSellModal(${account.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="12" y1="2" y2="22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
          售出账号
        </button>
        <button class="action-btn danger" onclick="markAsBanned(${account.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m4.9 4.9 14.2 14.2"/></svg>
          标记异常
        </button>
      ` : ''}
      ${account.status !== 'BANNED' && account.type === 'FAMILY' ? `
        <button class="action-btn" onclick="convertToPersonal(${account.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
          还原个人
        </button>
        <button class="action-btn success" onclick="enableFamilyGroup(${account.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          创建家庭
        </button>
        <button class="action-btn" onclick="deletePayment(${account.id})">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
          删除支付
        </button>
      ` : ''}
      ${account.status !== 'SOLD' ? `
      <button class="action-btn danger" onclick="deleteAccount(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
        删除账号
      </button>
      ` : ''}
      ${account.status === 'BANNED' ? `
      <button class="action-btn success" onclick="cancelBanned(${account.id})">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
        取消异常
      </button>
      ` : ''}
    </div>
  `;

    // 如果是已售出状态，添加取消售出的点击事件
    if (account.status === 'SOLD') {
        const statusElement = card.querySelector('.account-status[data-cancel-sold]');
        if (statusElement) {
            statusElement.addEventListener('click', () => {
                cancelSold(account.id);
            });
        }
    }

    return card;
}

// ===== 创建车位 HTML =====
function createSlotsHTML(account) {
    // 确保 slots 被正确解析（可能是字符串或数组）
    let slots = account.slots || [null, null, null, null, null];
    if (typeof slots === 'string') {
        try {
            slots = JSON.parse(slots);
        } catch (e) {
            slots = [null, null, null, null, null];
        }
    }

    let slotsHTML = '<div class="slots-container"><div class="slots-title"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg> 车位管理 (点击操作)</div><div class="slots-grid">';

    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1天后

    slots.forEach((slot, index) => {
        if (slot === null) {
            slotsHTML += `
        <div class="slot empty" onclick="assignSlot(${account.id}, ${index})">
          <div class="slot-icon"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/></svg></div>
          <div class="slot-label">空闲</div>
        </div>
      `;
        } else {
            // 检查到期状态
            let slotClass = 'occupied';
            let slotIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>';

            if (slot.expiresAt) {
                const expiresAt = new Date(slot.expiresAt);
                if (expiresAt <= now) {
                    // 已到期 - 红色
                    slotClass = 'occupied expired';
                    slotIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>';
                } else if (expiresAt <= soonThreshold) {
                    // 即将到期 - 黄色
                    slotClass = 'occupied expiring';
                    slotIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
                }
            }

            // 截断买家名字，最多显示2个字符
            const displayName = slot.buyer ? (slot.buyer.length > 2 ? slot.buyer.substring(0, 2) + '..' : slot.buyer) : '已用';

            slotsHTML += `
        <div class="slot ${slotClass}" onclick="viewSlotDetails(${account.id}, ${index})">
          <div class="slot-icon">${slotIcon}</div>
          <div class="slot-label">${displayName}</div>
        </div>
      `;
        }
    });

    slotsHTML += '</div></div>';
    return slotsHTML;
}

// 查看车位详情
function viewSlotDetails(accountId, slotIndex) {
    // 找到相应的账号
    const account = accounts.find(acc => acc.id === accountId);
    if (!account || !account.slots) return;

    // slots可能是字符串或已解析的数组对象
    const slots = typeof account.slots === 'string' ? JSON.parse(account.slots) : account.slots;
    const slot = slots[slotIndex];

    if (!slot) return;

    // 设置当前操作
    currentSlotEdit = { accountId, slotIndex, action: 'view', slot };

    // 设置模态框为查看模式
    document.getElementById('modal-title').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> 车位详情';

    // 显示买家信息（设置为只读）
    const buyerInput = document.getElementById('buyer-name');
    const buyerSourceInput = document.getElementById('buyer-source');
    const inviteEmailInput = document.getElementById('invite-email');
    const priceInput = document.getElementById('slot-price');
    const expireDaysInput = document.getElementById('expire-days');

    buyerInput.value = slot.buyer || '';
    buyerSourceInput.value = slot.buyerSource || '';
    inviteEmailInput.value = slot.order || '';  // order 字段现在存储邀请邮箱
    priceInput.value = slot.price || '';
    expireDaysInput.value = slot.expireDays || '';

    buyerInput.disabled = true;
    buyerSourceInput.disabled = true;
    inviteEmailInput.disabled = true;
    priceInput.disabled = true;
    expireDaysInput.disabled = true;

    // 隐藏服务期限输入框（查看模式）
    document.getElementById('expire-days-group').style.display = 'none';

    // 显示上车时间
    const timeGroup = document.getElementById('slot-time-group');
    const timeDisplay = document.getElementById('slot-assigned-time');
    if (slot.assignedAt) {
        timeDisplay.textContent = new Date(slot.assignedAt).toLocaleString();
        timeGroup.style.display = 'block';
    } else {
        timeGroup.style.display = 'none';
    }

    // 显示到期时间
    const expireInfoGroup = document.getElementById('slot-expire-info-group');
    const expireTimeDisplay = document.getElementById('slot-expire-time');
    if (slot.expiresAt) {
        const expiresAt = new Date(slot.expiresAt);
        const now = new Date();
        const isExpired = expiresAt <= now;
        expireTimeDisplay.textContent = expiresAt.toLocaleString() + (isExpired ? ' (已到期!)' : '');
        expireTimeDisplay.style.color = isExpired ? '#ef4444' : '#f59e0b';
        expireInfoGroup.style.display = 'block';
    } else {
        expireInfoGroup.style.display = 'none';
    }

    // 隐藏邀请状态
    document.getElementById('invite-status-group').style.display = 'none';

    // 显示下车按钮，隐藏确认按钮
    document.getElementById('slot-confirm-btn').style.display = 'none';
    document.getElementById('slot-release-btn').style.display = 'inline-block';

    // 显示编辑按钮
    document.getElementById('slot-edit-btn').style.display = 'inline-block';

    // 显示自动踢出按钮，隐藏自动邀请按钮
    document.getElementById('auto-invite-btn').style.display = 'none';
    document.getElementById('auto-remove-btn').style.display = 'inline-block';
    document.getElementById('slot-renew-btn').style.display = 'inline-block';

    // 显示模态框
    document.getElementById('slot-modal').classList.add('active');
}

function assignSlot(accountId, slotIndex) {
    currentSlotEdit = { accountId, slotIndex, action: 'assign' };
    document.getElementById('modal-title').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/></svg> 发车 - 分配车位';

    const buyerInput = document.getElementById('buyer-name');
    const buyerSourceInput = document.getElementById('buyer-source');
    const inviteEmailInput = document.getElementById('invite-email');
    const priceInput = document.getElementById('slot-price');
    const expireDaysInput = document.getElementById('expire-days');

    buyerInput.value = '';
    buyerSourceInput.value = '';
    inviteEmailInput.value = '';
    priceInput.value = '';
    expireDaysInput.value = '';

    buyerInput.disabled = false;
    buyerSourceInput.disabled = false;
    inviteEmailInput.disabled = false;
    priceInput.disabled = false;
    expireDaysInput.disabled = false;

    // 显示服务期限输入框（分配模式）
    document.getElementById('expire-days-group').style.display = 'block';
    // 隐藏上车时间、到期时间和下车按钮
    document.getElementById('slot-time-group').style.display = 'none';
    document.getElementById('slot-expire-info-group').style.display = 'none';
    document.getElementById('invite-status-group').style.display = 'none';
    document.getElementById('slot-confirm-btn').style.display = 'inline-block';
    document.getElementById('slot-release-btn').style.display = 'none';
    document.getElementById('slot-edit-btn').style.display = 'none';
    document.getElementById('auto-invite-btn').style.display = 'inline-block';
    document.getElementById('auto-remove-btn').style.display = 'none';
    document.getElementById('slot-renew-btn').style.display = 'none';

    document.getElementById('slot-modal').classList.add('active');
}

// 启用车位编辑模式
function enableSlotEdit() {
    if (!currentSlotEdit) return;

    // 切换为编辑模式
    currentSlotEdit.action = 'assign';

    // 更新标题
    document.getElementById('modal-title').innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg> 编辑车位';

    // 启用输入框
    document.getElementById('buyer-name').disabled = false;
    document.getElementById('buyer-source').disabled = false;
    document.getElementById('invite-email').disabled = false;
    document.getElementById('slot-price').disabled = false;
    document.getElementById('expire-days').disabled = false;

    // 显示服务期限输入框
    document.getElementById('expire-days-group').style.display = 'block';

    // 隐藏编辑按钮，显示确认按钮
    document.getElementById('slot-edit-btn').style.display = 'none';
    document.getElementById('slot-confirm-btn').style.display = 'inline-block';

    // 隐藏自动踢出和续费按钮
    document.getElementById('auto-remove-btn').style.display = 'none';
    document.getElementById('slot-renew-btn').style.display = 'none';
}

function releaseSlot(accountId, slotIndex) {
    console.log('releaseSlot called:', accountId, slotIndex);
    showToast('正在收回车位...', 'success');
    closeSlotModal();
    updateSlot(accountId, slotIndex, 'release');
}

function confirmRelease() {
    if (!currentSlotEdit) return;
    // 先保存数据，因为closeSlotModal会清空currentSlotEdit
    const { accountId, slotIndex } = currentSlotEdit;
    showToast('正在下车...', 'success');
    closeSlotModal();
    updateSlot(accountId, slotIndex, 'release');
}

function closeSlotModal() {
    document.getElementById('slot-modal').classList.remove('active');
    currentSlotEdit = null;
}

// 续费功能
function openRenewInput() {
    if (!currentSlotEdit) return;
    document.getElementById('renew-days').value = '31';
    document.getElementById('renew-modal').classList.add('active');
}

function closeRenewModal() {
    document.getElementById('renew-modal').classList.remove('active');
}

function confirmRenew() {
    if (!currentSlotEdit) return;

    const days = document.getElementById('renew-days').value.trim();
    const daysNum = parseInt(days);

    if (isNaN(daysNum) || daysNum <= 0) {
        showToast('请输入有效的天数', 'error');
        return;
    }

    closeRenewModal();
    renewSlot(currentSlotEdit.accountId, currentSlotEdit.slotIndex, daysNum);
}

async function renewSlot(accountId, slotIndex, days) {
    showToast('正在续费...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'renewSlot',
                slotIndex,
                renewDays: days
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(`续费成功！已延长 ${days} 天`, 'success');
            closeSlotModal();
            loadAccounts();
            loadStats();
            checkExpiredNotifications();
        } else {
            showToast('续费失败: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('网络错误: ' + error.message, 'error');
    }
}

async function confirmSlotAction() {
    if (!currentSlotEdit) return;

    const buyer = document.getElementById('buyer-name').value.trim();
    const buyerSource = document.getElementById('buyer-source').value.trim();
    const inviteEmail = document.getElementById('invite-email').value.trim();
    const price = document.getElementById('slot-price').value.trim();
    const expireDays = document.getElementById('expire-days').value.trim();

    if (!buyer && currentSlotEdit.action === 'assign') {
        showToast('请输入买家信息', 'error');
        return;
    }

    await updateSlot(currentSlotEdit.accountId, currentSlotEdit.slotIndex, currentSlotEdit.action, buyer, inviteEmail, price, expireDays, buyerSource);
    closeSlotModal();
}

async function updateSlot(accountId, slotIndex, action, buyer = '', order = '', price = '', expireDays = '', buyerSource = '') {
    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'updateSlot',
                slotIndex,
                slotAction: action,
                buyer,
                order,
                price,
                expireDays,
                buyerSource
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(action === 'assign' ? '车位分配成功' : '车位释放成功', 'success');
            await loadAccounts();
            await loadStats();
            checkExpiredNotifications(); // 刷新通知
        } else {
            showToast('操作失败: ' + data.error, 'error');
        }
    } catch (error) {
        showToast('网络错误: ' + error.message, 'error');
    }
}

// ===== 类型转换 =====
async function convertToFamily(accountId) {
    console.log('convertToFamily called:', accountId);

    // 显示处理中提示
    showToast('正在转换为家庭组...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ action: 'convertToFamily' })
        });

        const data = await response.json();
        console.log('convertToFamily response:', data);

        if (data.success) {
            showToast('已转换为家庭组!请切换到"家庭组"标签查看', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('转换失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('convertToFamily error:', error);
        showToast('网络错误: ' + error.message, 'error');
    }
}

async function convertToPersonal(accountId) {
    console.log('convertToPersonal called:', accountId);

    // 显示处理中提示
    showToast('正在还原为个人号...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ action: 'convertToPersonal' })
        });

        const data = await response.json();
        console.log('convertToPersonal response:', data);

        if (data.success) {
            showToast('已还原为个人号!', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('还原失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('convertToPersonal error:', error);
        showToast('网络错误: ' + error.message, 'error');
    }
}

// ===== 创建家庭组 =====
async function enableFamilyGroup(accountId) {
    console.log('enableFamilyGroup called:', accountId);

    // 获取账号信息
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
        showToast('未找到账号信息', 'error');
        return;
    }

    showToast('🔄 正在创建家庭组...', 'success');

    try {
        const localApiUrl = getLocalApiUrl();
        const response = await fetch(`${localApiUrl}/api/enable-family`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                family_account: account.email
            })
        });

        const data = await response.json();
        console.log('enableFamilyGroup response:', data);

        if (data.success) {
            showToast('家庭组创建成功！', 'success');
        } else {
            showToast('创建失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('enableFamilyGroup error:', error);
        showToast('网络错误: ' + error.message, 'error');
    }
}

// ===== 删除支付资料 =====
let currentDeletePaymentAccountId = null;

function deletePayment(accountId) {
    console.log('deletePayment called:', accountId);

    // 获取账号信息
    const account = accounts.find(acc => acc.id === accountId);
    if (!account) {
        showToast('未找到账号信息', 'error');
        return;
    }

    // 设置当前操作的账号
    currentDeletePaymentAccountId = accountId;

    // 显示邮箱
    document.getElementById('delete-payment-email').textContent = account.email;

    // 隐藏状态显示
    document.getElementById('delete-payment-status-group').style.display = 'none';

    // 重置确认按钮
    const confirmBtn = document.getElementById('delete-payment-confirm-btn');
    confirmBtn.disabled = false;
    confirmBtn.textContent = '确认删除';

    // 显示模态框
    document.getElementById('delete-payment-modal').classList.add('active');
}

function closeDeletePaymentModal() {
    document.getElementById('delete-payment-modal').classList.remove('active');
    currentDeletePaymentAccountId = null;
}

async function confirmDeletePayment() {
    if (!currentDeletePaymentAccountId) {
        return;
    }

    const account = accounts.find(acc => acc.id === currentDeletePaymentAccountId);
    if (!account) {
        showToast('未找到账号信息', 'error');
        closeDeletePaymentModal();
        return;
    }

    // 显示状态
    const statusGroup = document.getElementById('delete-payment-status-group');
    const statusDiv = document.getElementById('delete-payment-status');
    const confirmBtn = document.getElementById('delete-payment-confirm-btn');

    statusGroup.style.display = 'block';
    statusDiv.textContent = '⏳ 正在删除支付资料...';
    statusDiv.style.color = '#f59e0b';
    statusDiv.style.background = 'rgba(245, 158, 11, 0.1)';
    confirmBtn.disabled = true;
    confirmBtn.textContent = '处理中...';

    try {
        const localApiUrl = getLocalApiUrl();
        const response = await fetch(`${localApiUrl}/api/delete-payment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                family_account: account.email,
                password: account.password,
                totp_secret: account.twofa_secret || ''
            })
        });

        const data = await response.json();
        console.log('deletePayment response:', data);

        if (data.success) {
            statusDiv.textContent = '支付资料删除成功！';
            statusDiv.style.color = '#10b981';
            statusDiv.style.background = 'rgba(16, 185, 129, 0.1)';
            showToast('支付资料删除成功！', 'success');

            // 1.5秒后关闭弹窗
            setTimeout(() => {
                closeDeletePaymentModal();
            }, 1500);
        } else {
            statusDiv.textContent = '删除失败: ' + (data.error || '未知错误');
            statusDiv.style.color = '#ef4444';
            statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
            showToast('删除失败: ' + (data.error || '未知错误'), 'error');
            confirmBtn.disabled = false;
            confirmBtn.textContent = '重试';
        }
    } catch (error) {
        console.error('deletePayment error:', error);
        statusDiv.textContent = '网络错误: ' + error.message;
        statusDiv.style.color = '#ef4444';
        statusDiv.style.background = 'rgba(239, 68, 68, 0.1)';
        showToast('网络错误: ' + error.message, 'error');
        confirmBtn.disabled = false;
        confirmBtn.textContent = '重试';
    }
}

// ===== 标记异常 =====
function markAsBanned(accountId) {
    console.log('markAsBanned called:', accountId);
    openBanModal(accountId);
}

function openBanModal(accountId) {
    currentBanAccountId = accountId;
    document.getElementById('ban-reason').value = '';
    document.getElementById('ban-note').value = '';
    document.getElementById('ban-modal').classList.add('active');
}

function closeBanModal() {
    document.getElementById('ban-modal').classList.remove('active');
    currentBanAccountId = null;
}

async function confirmBan() {
    if (!currentBanAccountId) {
        console.error('No account selected for banning');
        return;
    }

    const banReason = document.getElementById('ban-reason').value.trim();
    const banNote = document.getElementById('ban-note').value.trim();

    if (!banReason) {
        showToast('请输入封禁原因', 'error');
        return;
    }

    // 合并原因和备注
    const fullReason = banNote ? `${banReason} (${banNote})` : banReason;

    showToast('正在标记为异常...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${currentBanAccountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'updateStatus',
                status: 'BANNED',
                banReason: fullReason
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('已标记为异常', 'success');
            closeBanModal();
            loadAccounts();
            loadStats();
        } else {
            showToast('操作失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('confirmBan error:', error);
        showToast('网络错误: ' + error.message, 'error');
    }
}

// ===== 取消异常 =====
function cancelBanned(accountId) {
    showConfirmModal('取消异常', '确定要取消异常状态吗？<br>账号将恢复为个人号库存。', async () => {
        showToast('正在取消异常...', 'success');
        try {
            const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    action: 'updateStatus',
                    status: 'ACTIVE',
                    banReason: null
                })
            });

            const data = await response.json();

            if (data.success) {
                showToast('已取消异常，账号已恢复为库存', 'success');
                loadAccounts();
                loadStats();
            } else {
                showToast('操作失败: ' + (data.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('cancelBanned error:', error);
            showToast('网络错误: ' + error.message, 'error');
        }
    });
}

// ===== 个人号售出功能 =====
let currentSellAccountId = null;

function openSellModal(accountId) {
    console.log('openSellModal called:', accountId);
    currentSellAccountId = accountId;

    try {
        document.getElementById('sell-buyer-name').value = '';
        document.getElementById('sell-buyer-source').value = '';
        document.getElementById('sell-order-number').value = '';
        document.getElementById('sell-price').value = '';
        document.getElementById('sell-modal').classList.add('active');
        console.log('Sell modal opened successfully');
    } catch (error) {
        console.error('Error opening sell modal:', error);
        showToast('打开售出弹窗失败', 'error');
    }
}

function closeSellModal() {
    document.getElementById('sell-modal').classList.remove('active');
    currentSellAccountId = null;
}

async function confirmSell() {
    if (!currentSellAccountId) {
        console.error('No account selected for selling');
        return;
    }

    const buyerName = document.getElementById('sell-buyer-name').value.trim();
    const buyerSource = document.getElementById('sell-buyer-source').value.trim();
    const buyerOrder = document.getElementById('sell-order-number').value.trim();
    const buyerPrice = document.getElementById('sell-price').value.trim();

    console.log('confirmSell called:', { accountId: currentSellAccountId, buyerName, buyerSource, buyerOrder, buyerPrice });

    if (!buyerName) {
        showToast('请输入买家昵称', 'error');
        return;
    }

    showToast('正在标记为已售出...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${currentSellAccountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'sellPersonal',
                buyerName,
                buyerSource,
                buyerOrder,
                buyerPrice
            })
        });

        const data = await response.json();
        console.log('confirmSell response:', data);

        if (data.success) {
            showToast('标记为已售出成功!', 'success');
            closeSellModal();
            loadAccounts();
            loadStats();
        } else {
            showToast('操作失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('confirmSell error:', error);
        showToast('网络错误: ' + error.message, 'error');
    }
}

// ===== 编辑售出信息 =====
let currentEditSoldAccountId = null;

function openEditSoldModal(accountId) {
    currentEditSoldAccountId = accountId;
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    document.getElementById('edit-sold-buyer-name').value = account.buyer_name || '';
    document.getElementById('edit-sold-buyer-source').value = account.buyer_source || '';
    document.getElementById('edit-sold-price').value = account.buyer_price || '';
    document.getElementById('edit-sold-modal').classList.add('active');
}

function closeEditSoldModal() {
    document.getElementById('edit-sold-modal').classList.remove('active');
    currentEditSoldAccountId = null;
}

async function confirmEditSold() {
    if (!currentEditSoldAccountId) return;

    const buyerName = document.getElementById('edit-sold-buyer-name').value.trim();
    const buyerSource = document.getElementById('edit-sold-buyer-source').value.trim();
    const buyerPrice = document.getElementById('edit-sold-price').value.trim();

    if (!buyerName) {
        showToast('请输入买家昵称', 'error');
        return;
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${currentEditSoldAccountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'updateSoldInfo',
                buyerName,
                buyerSource,
                buyerPrice
            })
        });

        const data = await response.json();
        if (data.success) {
            showToast('售出信息已更新', 'success');
            closeEditSoldModal();
            loadAccounts();
        } else {
            showToast('更新失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        showToast('网络错误: ' + error.message, 'error');
    }
}

// ===== 自定义确认弹窗 =====
let confirmCallback = null;

function showConfirmModal(title, message, callback) {
    document.getElementById('confirm-modal-title').innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
        ${title}
    `;
    document.getElementById('confirm-modal-message').innerHTML = message;
    confirmCallback = callback;
    document.getElementById('confirm-modal').classList.add('active');
}

function closeConfirmModal() {
    document.getElementById('confirm-modal').classList.remove('active');
    confirmCallback = null;
}

function executeConfirmAction() {
    const callback = confirmCallback;  // 先保存回调
    closeConfirmModal();  // 再关闭弹窗
    if (callback) {
        callback();  // 最后执行回调
    }
}

// ===== 取消售出 =====
async function cancelSold(accountId) {
    showConfirmModal('取消售出', '确定要取消售出吗？<br>账号将恢复为库存状态。', async () => {
        try {
            const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
                method: 'PATCH',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                    action: 'cancelSold'
                })
            });

            const data = await response.json();
            if (data.success) {
                showToast('已取消售出，账号已恢复为库存', 'success');
                loadAccounts();
                loadStats();
            } else {
                showToast('操作失败: ' + (data.error || '未知错误'), 'error');
            }
        } catch (error) {
            showToast('网络错误: ' + error.message, 'error');
        }
    });
}

// ===== 2FA 验证码 =====
async function initTOTP(accountId) {
    // 清除之前的定时器（如果存在）
    if (totpTimers[accountId]) {
        clearInterval(totpTimers[accountId]);
        delete totpTimers[accountId];
    }

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({ action: 'getTOTP' })
        });

        const data = await response.json();

        if (data.code) {
            updateTOTPDisplay(accountId, data.code, data.remaining);
            startTOTPCountdown(accountId, data.remaining);
        } else {
            showToast('无法生成验证码', 'error');
        }
    } catch (error) {
        showToast('获取验证码失败: ' + error.message, 'error');
    }
}

function updateTOTPDisplay(accountId, code, remaining) {
    const container = document.getElementById(`totp-container-${accountId}`);
    if (!container) return;

    container.innerHTML = `
        <span class="totp-code" onclick="copyText('${code}')" style="cursor: pointer; font-family: monospace; font-size: 1.1em; font-weight: 600; color: var(--primary); padding: 4px 8px; background: rgba(99, 102, 241, 0.1); border-radius: 4px;" title="点击复制">${code}</span>
        <span class="totp-timer" style="margin-left: 8px; color: var(--text-muted); font-size: 0.9em;">(${remaining}s)</span>
    `;
}

function startTOTPCountdown(accountId, initialRemaining) {
    let remaining = initialRemaining;

    // 清除旧定时器
    if (totpTimers[accountId]) {
        clearInterval(totpTimers[accountId]);
    }

    totpTimers[accountId] = setInterval(() => {
        remaining--;

        const timerElement = document.querySelector(`#totp-container-${accountId} .totp-timer`);

        // 检查元素是否还存在（用户可能切换了标签页）
        if (!timerElement) {
            clearInterval(totpTimers[accountId]);
            delete totpTimers[accountId];
            return;
        }

        if (remaining <= 0) {
            // 时间到了，自动刷新验证码
            clearInterval(totpTimers[accountId]);
            delete totpTimers[accountId];
            initTOTP(accountId);
        } else {
            // 更新倒计时显示
            timerElement.textContent = `(${remaining}s)`;

            // 最后5秒变红色提示
            if (remaining <= 5) {
                timerElement.style.color = '#ef4444';
                timerElement.style.fontWeight = '600';
            }
        }
    }, 1000);
}

// ===== 复制功能 =====
function copyText(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('已复制到剪贴板', 'success');
    }).catch(() => {
        showToast('复制失败', 'error');
    });
}

function copyFullAccount(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;

    const fullText = `${account.email}----${account.password}${account.backup_email ? '----' + account.backup_email : ''}${account.twofa_secret ? '----' + account.twofa_secret : ''}`;
    copyText(fullText);
}

// ===== 取消售出功能 =====
let currentCancelSoldAccountId = null;

function cancelSold(accountId) {
    currentCancelSoldAccountId = accountId;
    document.getElementById('cancel-sold-modal').classList.add('active');
}

function closeCancelSoldModal() {
    document.getElementById('cancel-sold-modal').classList.remove('active');
    currentCancelSoldAccountId = null;
}

async function confirmCancelSold() {
    if (!currentCancelSoldAccountId) {
        return;
    }

    const accountId = currentCancelSoldAccountId; // 先保存ID到局部变量
    closeCancelSoldModal(); // 关闭modal会清除全局变量
    showToast('正在取消售出...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, { // 使用局部变量
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'cancelSold'
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('已取消售出,账号已恢复为库存状态', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('取消失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('cancelSold error:', error);
        showToast('网络错误: ' + error.message, 'error');
    } finally {
        currentCancelSoldAccountId = null;
    }
}

// ===== 工具函数 =====
// 通过账号ID复制指定字段（避免在HTML中嵌入特殊字符）
function copyAccountField(accountId, field) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) {
        showToast('未找到账号', 'error');
        return;
    }
    const value = account[field];
    if (value) {
        copyText(value);
    } else {
        showToast('该字段为空', 'error');
    }
}

function maskPassword(password) {
    if (password.length <= 4) return '****';
    return password.substring(0, 2) + '****' + password.substring(password.length - 2);
}

function truncateEmail(email) {
    if (!email || email.length <= 20) return email;
    const atIndex = email.indexOf('@');
    if (atIndex === -1) return email;
    const localPart = email.substring(0, atIndex);
    const domainPart = email.substring(atIndex);
    if (localPart.length <= 6) return email;
    return localPart.substring(0, 3) + '...' + localPart.substring(localPart.length - 2) + domainPart;
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===== 删除账号功能 =====
async function deleteAccount(accountId) {
    showConfirmModal('删除账号', '确定要彻底删除这个账号吗？<br>此操作无法撤销！', async () => {
        showToast('正在删除账号...', 'success');

        try {
            const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
                method: 'DELETE',
                headers: getAuthHeaders()
            });

            const data = await response.json();

            if (data.success) {
                showToast('账号已删除', 'success');
                loadAccounts();
                loadStats();
            } else {
                showToast('删除失败: ' + (data.error || '未知错误'), 'error');
            }
        } catch (error) {
            console.error('deleteAccount error:', error);
            showToast('网络错误: ' + error.message, 'error');
        }
    });
}

// ===== 批量操作功能 =====
let selectedAccountIds = new Set();

function initBatchControls() {
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    const batchExportBtn = document.getElementById('batch-export-btn');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');

    if (!selectAllCheckbox) return; // 防止元素不存在时报错

    // 全选/取消全选
    selectAllCheckbox.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        // 只选择当前活跃标签页内的复选框
        const activeContainer = document.getElementById(`${currentTab}-accounts-container`);
        const checkboxes = activeContainer ? activeContainer.querySelectorAll('.account-checkbox') : [];

        // 先清空之前的选择，确保只选中当前页面的账号
        selectedAccountIds.clear();

        checkboxes.forEach(cb => {
            cb.checked = isChecked;
            const id = parseInt(cb.dataset.id);
            if (isChecked) {
                selectedAccountIds.add(id);
            }
        });

        updateBatchUI();
    });

    // 批量导出
    batchExportBtn.addEventListener('click', () => {
        if (selectedAccountIds.size === 0) return;

        let exportText = '';
        selectedAccountIds.forEach(id => {
            const account = accounts.find(a => a.id === id);
            if (account) {
                // 格式: 账号----密码----辅邮----2FA
                let line = `${account.email}----${account.password}`;
                if (account.backup_email) line += `----${account.backup_email}`;
                if (account.twofa_secret) line += `----${account.twofa_secret}`;
                exportText += line + '\n';
            }
        });

        copyText(exportText.trim());
        showToast(`已复制 ${selectedAccountIds.size} 个账号到剪贴板`, 'success');
    });

    // 批量删除
    batchDeleteBtn.addEventListener('click', async () => {
        if (selectedAccountIds.size === 0) return;

        const count = selectedAccountIds.size;
        showConfirmModal('批量删除', `确定要删除选中的 ${count} 个账号吗？<br>此操作无法撤销！`, async () => {
            showToast('正在批量删除...', 'success');

            let successCount = 0;
            let failCount = 0;

            const deletePromises = Array.from(selectedAccountIds).map(async (id) => {
                try {
                    const response = await fetch(`${API_BASE_URL}/api/accounts/${id}`, {
                        method: 'DELETE',
                        headers: getAuthHeaders()
                    });
                    const data = await response.json();
                    if (data.success) successCount++;
                    else failCount++;
                } catch (e) {
                    failCount++;
                }
            });

            await Promise.all(deletePromises);

            showToast(`批量删除完成: 成功 ${successCount} 个, 失败 ${failCount} 个`, successCount > 0 ? 'success' : 'error');

            // 重置选择
            selectedAccountIds.clear();
            document.getElementById('select-all-checkbox').checked = false;
            updateBatchUI();

            // 刷新列表
            loadAccounts();
            loadStats();
        });
    });
}

function updateBatchUI() {
    const batchExportBtn = document.getElementById('batch-export-btn');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');

    if (!batchExportBtn || !batchDeleteBtn) return;

    if (selectedAccountIds.size > 0) {
        batchExportBtn.style.display = 'inline-flex';
        batchDeleteBtn.style.display = 'inline-flex';
        batchExportBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg> 批量导出 (${selectedAccountIds.size})`;
        batchDeleteBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg> 批量删除 (${selectedAccountIds.size})`;
    } else {
        batchExportBtn.style.display = 'none';
        batchDeleteBtn.style.display = 'none';
        if (selectAllCheckbox) selectAllCheckbox.checked = false;
    }
}

function toggleAccountSelection(id, checked) {
    if (checked) {
        selectedAccountIds.add(id);
    } else {
        selectedAccountIds.delete(id);
    }
    updateBatchUI();

    // 检查当前标签页是否全部选中
    const activeContainer = document.getElementById(`${currentTab}-accounts-container`);
    const allCheckboxes = activeContainer ? activeContainer.querySelectorAll('.account-checkbox') : [];
    const allChecked = allCheckboxes.length > 0 && Array.from(allCheckboxes).every(cb => cb.checked);
    const selectAllCheckbox = document.getElementById('select-all-checkbox');
    if (selectAllCheckbox) selectAllCheckbox.checked = allChecked;
}

// ===== 到期通知功能 =====
let expiredNotifications = [];

// ===== 本地 API 自动邀请功能 =====
// 用户可以在 localStorage 中配置自己的本地 API 地址
function getLocalApiUrl() {
    try {
        const stored = localStorage.getItem('localApiUrl');
        console.log('[DEBUG] localStorage localApiUrl =', stored);
        return stored || 'http://localhost:8090';
    } catch (e) {
        console.error('[DEBUG] localStorage 读取失败:', e);
        return 'http://localhost:8090';
    }
}

// 设置本地 API 地址
function setLocalApiUrl(url) {
    try {
        console.log('[DEBUG] 正在保存 API 地址:', url);
        localStorage.setItem('localApiUrl', url);
        console.log('[DEBUG] 保存成功，验证:', localStorage.getItem('localApiUrl'));
        showToast('本地 API 地址已保存', 'success');
    } catch (e) {
        console.error('[DEBUG] localStorage 保存失败:', e);
        showToast('保存失败: ' + e.message, 'error');
    }
}

// 自动发送邀请
async function autoSendInvite() {
    if (!currentSlotEdit) {
        showToast('请先选择一个车位', 'error');
        return;
    }

    const inviteEmail = document.getElementById('invite-email').value.trim();
    if (!inviteEmail) {
        showToast('请输入邀请邮箱', 'error');
        return;
    }

    // 验证邮箱格式
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(inviteEmail)) {
        showToast('请输入有效的邮箱地址', 'error');
        return;
    }

    // 获取当前家庭组账号信息
    const account = accounts.find(acc => acc.id === currentSlotEdit.accountId);
    if (!account) {
        showToast('未找到账号信息', 'error');
        return;
    }

    const familyAccount = account.email;
    const localApiUrl = getLocalApiUrl();

    // 显示状态
    const statusGroup = document.getElementById('invite-status-group');
    const statusDiv = document.getElementById('invite-status');
    const autoInviteBtn = document.getElementById('auto-invite-btn');

    statusGroup.style.display = 'block';
    statusDiv.textContent = '⏳ 正在发送邀请...';
    statusDiv.style.color = '#f59e0b';
    autoInviteBtn.disabled = true;
    autoInviteBtn.textContent = '⏳ 发送中...';

    try {
        console.log(`调用本地 API: ${localApiUrl}/api/send-invite`);
        console.log(`家庭组账号: ${familyAccount}`);
        console.log(`邀请邮箱: ${inviteEmail}`);

        const response = await fetch(`${localApiUrl}/api/send-invite`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                family_account: familyAccount,
                invite_email: inviteEmail
            })
        });

        const result = await response.json();
        console.log('API 响应:', result);

        if (result.success) {
            statusDiv.textContent = `${result.message || '邀请发送成功!'}`;
            statusDiv.style.color = '#10b981';
            showToast('邀请发送成功!', 'success');

            // 自动填写买家信息（如果为空）
            const buyerInput = document.getElementById('buyer-name');
            if (!buyerInput.value.trim()) {
                buyerInput.value = inviteEmail.split('@')[0];
            }
        } else {
            statusDiv.textContent = `${result.error || '发送失败'}`;
            statusDiv.style.color = '#ef4444';
            showToast(`发送失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('自动邀请错误:', error);
        let errorMessage = error.message;
        if (error.message.includes('Failed to fetch')) {
            errorMessage = '无法连接本地 API 服务，请确保服务已启动';
        }
        statusDiv.textContent = `${errorMessage}`;
        statusDiv.style.color = '#ef4444';
        showToast(`连接失败: ${errorMessage}`, 'error');
    } finally {
        autoInviteBtn.disabled = false;
        autoInviteBtn.textContent = '发送邀请';
    }
}

// 自动踢出成员
async function autoRemoveMember() {
    console.log('[DEBUG autoRemoveMember] 函数被调用');
    console.log('[DEBUG autoRemoveMember] currentSlotEdit =', currentSlotEdit);

    if (!currentSlotEdit) {
        showToast('请先选择一个车位', 'error');
        return;
    }

    const memberEmail = document.getElementById('invite-email').value.trim();
    console.log('[DEBUG autoRemoveMember] memberEmail =', memberEmail);
    console.log('[DEBUG autoRemoveMember] slot.order =', currentSlotEdit.slot?.order);

    if (!memberEmail) {
        showToast('没有成员邮箱信息', 'error');
        return;
    }

    // 获取当前家庭组账号信息
    const account = accounts.find(acc => acc.id === currentSlotEdit.accountId);
    if (!account) {
        showToast('未找到账号信息', 'error');
        return;
    }

    const familyAccount = account.email;
    const localApiUrl = getLocalApiUrl();

    // 显示状态
    const statusGroup = document.getElementById('invite-status-group');
    const statusDiv = document.getElementById('invite-status');
    const autoRemoveBtn = document.getElementById('auto-remove-btn');

    statusGroup.style.display = 'block';
    statusDiv.textContent = '⏳ 正在踢出成员...';
    statusDiv.style.color = '#f59e0b';
    if (autoRemoveBtn) {
        autoRemoveBtn.disabled = true;
        autoRemoveBtn.textContent = '⏳ 踢出中...';
    }

    try {
        console.log(`调用本地 API: ${localApiUrl}/api/remove-member`);
        console.log(`家庭组账号: ${familyAccount}`);
        console.log(`踢出成员: ${memberEmail}`);

        const response = await fetch(`${localApiUrl}/api/remove-member`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                family_account: familyAccount,
                member_email: memberEmail,
                password: account.password || ''  // 传递密码用于验证
            })
        });

        const result = await response.json();
        console.log('API 响应:', result);

        if (result.success) {
            statusDiv.textContent = `${result.message || '踢出成功!'}`;
            statusDiv.style.color = '#10b981';
            showToast('踢出成功!', 'success');
        } else {
            statusDiv.textContent = `${result.error || '踢出失败'}`;
            statusDiv.style.color = '#ef4444';
            showToast(`踢出失败: ${result.error}`, 'error');
        }
    } catch (error) {
        console.error('自动踢出错误:', error);
        let errorMessage = error.message;
        if (error.message.includes('Failed to fetch')) {
            errorMessage = '无法连接本地 API 服务，请确保服务已启动';
        }
        statusDiv.textContent = `${errorMessage}`;
        statusDiv.style.color = '#ef4444';
        showToast(`连接失败: ${errorMessage}`, 'error');
    } finally {
        if (autoRemoveBtn) {
            autoRemoveBtn.disabled = false;
            autoRemoveBtn.textContent = '踢出';
        }
    }
}

// 暴露设置函数到全局
window.setLocalApiUrl = setLocalApiUrl;
window.getLocalApiUrl = getLocalApiUrl;
window.autoSendInvite = autoSendInvite;
window.autoRemoveMember = autoRemoveMember;

// ===== API 设置弹窗功能 =====
function openApiSettingModal() {
    const modal = document.getElementById('api-setting-modal');
    const input = document.getElementById('api-url-input');
    const status = document.getElementById('api-status');

    // 加载当前配置
    const currentUrl = getLocalApiUrl();
    input.value = currentUrl === 'http://localhost:8090' ? '' : currentUrl;

    // 更新状态显示
    if (currentUrl && currentUrl !== 'http://localhost:8090') {
        status.textContent = `已配置: ${currentUrl}`;
        status.style.color = '#10b981';
        status.style.background = 'rgba(16, 185, 129, 0.1)';
    } else {
        status.textContent = '未配置，使用默认本地地址 (localhost:8090)';
        status.style.color = '#f59e0b';
        status.style.background = 'rgba(245, 158, 11, 0.1)';
    }

    modal.classList.add('active');
}

function closeApiSettingModal() {
    document.getElementById('api-setting-modal').classList.remove('active');
}

function saveApiSetting() {
    const input = document.getElementById('api-url-input');
    let url = input.value.trim();

    if (!url) {
        url = 'http://localhost:8090';
    }

    // 移除末尾的斜杠
    url = url.replace(/\/+$/, '');

    setLocalApiUrl(url);
    closeApiSettingModal();

    // 刷新页面
    location.reload();
}

async function testApiConnection() {
    const input = document.getElementById('api-url-input');
    const status = document.getElementById('api-status');
    let url = input.value.trim() || 'http://localhost:8090';
    url = url.replace(/\/+$/, '');

    status.textContent = '正在测试连接...';
    status.style.color = '#f59e0b';

    try {
        const response = await fetch(`${url}/api/health`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' }
        });

        const data = await response.json();

        if (data.status === 'ok') {
            status.textContent = `连接成功! ${data.message || ''}`;
            status.style.color = '#10b981';
            showToast('API 连接成功!', 'success');
        } else {
            status.textContent = '连接失败: 无效响应';
            status.style.color = '#ef4444';
        }
    } catch (error) {
        status.textContent = `连接失败: ${error.message}`;
        status.style.color = '#ef4444';
        showToast('API 连接失败', 'error');
    }
}

// 暴露弹窗函数到全局
window.openApiSettingModal = openApiSettingModal;
window.closeApiSettingModal = closeApiSettingModal;
window.saveApiSetting = saveApiSetting;
window.testApiConnection = testApiConnection;

// ===== 编辑账号功能 =====
let currentEditAccountId = null;

function openEditModal(accountId) {
    const account = accounts.find(a => a.id === accountId);
    if (!account) {
        showToast('未找到账号信息', 'error');
        return;
    }

    currentEditAccountId = accountId;

    // 填充表单
    document.getElementById('edit-email').value = account.email;
    document.getElementById('edit-password').value = account.password;
    document.getElementById('edit-backup-email').value = account.backup_email || '';
    document.getElementById('edit-twofa').value = account.twofa_secret || '';
    document.getElementById('edit-batch-tag').value = account.batch_tag || '';

    document.getElementById('edit-modal').classList.add('active');
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('active');
    currentEditAccountId = null;
}

async function confirmEdit() {
    if (!currentEditAccountId) return;

    const password = document.getElementById('edit-password').value.trim();
    const backupEmail = document.getElementById('edit-backup-email').value.trim();
    const twofaSecret = document.getElementById('edit-twofa').value.trim();
    const batchTag = document.getElementById('edit-batch-tag').value.trim();

    if (!password) {
        showToast('密码不能为空', 'error');
        return;
    }

    showToast('正在保存...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${currentEditAccountId}`, {
            method: 'PATCH',
            headers: getAuthHeaders(),
            body: JSON.stringify({
                action: 'editAccount',
                password,
                backupEmail,
                twofaSecret,
                batchTag
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast('保存成功', 'success');
            closeEditModal();
            loadAccounts();
        } else {
            showToast('保存失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        showToast('网络错误: ' + error.message, 'error');
    }
}

// 暴露编辑函数到全局
window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.confirmEdit = confirmEdit;

function initNotifications() {
    // 初始检查
    checkExpiredNotifications();

    // 每30分钟检查一次（节省API调用）
    setInterval(checkExpiredNotifications, 30 * 60 * 1000);
}

async function checkExpiredNotifications() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/notifications/expired`, {
            headers: getAuthHeaders()
        });

        if (response.status === 401) {
            return; // 未登录,不处理
        }

        const data = await response.json();

        if (data.success) {
            expiredNotifications = data.notifications || [];
            updateNotificationBadge(data.count);
        }
    } catch (error) {
        console.error('检查到期通知失败:', error);
    }
}

function updateNotificationBadge(count) {
    const badge = document.getElementById('notification-badge');
    if (!badge) return;

    if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.add('show');
    } else {
        badge.classList.remove('show');
    }
}

function openNotificationModal() {
    const listContainer = document.getElementById('notification-list');
    const emptyState = document.getElementById('notification-empty');

    if (expiredNotifications.length === 0) {
        listContainer.style.display = 'none';
        emptyState.style.display = 'block';
    } else {
        listContainer.style.display = 'block';
        emptyState.style.display = 'none';

        let html = '';
        expiredNotifications.forEach(notification => {
            const expiresAt = new Date(notification.expiresAt);
            const assignedAt = new Date(notification.assignedAt);
            const isExpired = notification.status === 'expired';
            const statusClass = isExpired ? 'expired' : 'expiring';
            const statusText = notification.statusText || (isExpired ? '已到期' : '即将到期');

            html += `
                <div class="notification-item ${statusClass}">
                    <div class="notification-item-header">
                        <span class="notification-item-account">${notification.accountEmail}</span>
                        <span class="notification-status-badge ${statusClass}">${statusText}</span>
                    </div>
                    <div class="notification-item-slot">车位 ${notification.slotIndex + 1}</div>
                    <div class="notification-item-buyer">买家: ${notification.buyer}</div>
                    <div class="notification-item-time">
                        到期时间: ${expiresAt.toLocaleString()}
                        ${notification.expireDays ? ` (${notification.expireDays}天)` : ''}<br>
                        上车时间: ${assignedAt.toLocaleString()}
                    </div>
                </div>
            `;
        });
        listContainer.innerHTML = html;
    }

    document.getElementById('notification-modal').classList.add('active');
}

function closeNotificationModal() {
    document.getElementById('notification-modal').classList.remove('active');
}

// 标记所有通知为已读（清除角标）
function markAllNotificationsRead() {
    // 清除角标显示
    updateNotificationBadge(0);
    showToast('已全部标记为已读', 'success');
    closeNotificationModal();
}
