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
          <div style="color: var(--secondary); font-size: 1.1rem; margin-bottom: 1rem;">
            ✅ 导入成功!
          </div>
          <div style="color: var(--text-secondary);">
            <p>📊 总计: ${data.total} 条</p>
            <p>✅ 成功: ${data.successCount} 条</p>
            <p>⏭️ 跳过(重复): ${data.skipCount} 条</p>
            ${data.errors ? `<p style="color: var(--danger);">❌ 错误: ${data.errors.length} 条</p>` : ''}
          </div>
          ${errorDetails}
        `;
                importText.value = '';
                showToast(`成功导入 ${data.successCount} 个账号`, 'success');
                loadStats(); // 刷新统计
            } else {
                resultDiv.innerHTML = `<div style="color: var(--danger);">❌ ${data.error}</div>`;
                showToast(data.error, 'error');
            }
        } catch (error) {
            resultDiv.innerHTML = `<div style="color: var(--danger);">❌ 网络错误: ${error.message}</div>`;
            showToast('导入失败,请检查网络连接', 'error');
        } finally {
            importBtn.disabled = false;
            importBtn.innerHTML = '<span class="btn-icon">⬆️</span>开始导入';
        }
    });
}

// ===== 列表功能 =====
let currentTab = 'personal'; // 当前激活的标签页

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

        // 更新标签页计数
        document.getElementById('personal-count').textContent = data.personalActive || 0;
        document.getElementById('sold-count').textContent = data.personalSold || 0;
        document.getElementById('family-count').textContent = data.familyActive || 0;
        document.getElementById('banned-count').textContent = data.bannedCount || 0;
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
        <span class="account-type-badge badge-${account.type.toLowerCase()}">
          ${account.type === 'PERSONAL' ? '👤 个人号' : '👨‍👩‍👧‍👦 家庭组'}
        </span>
      </div>
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
        <span class="account-status status-${account.status.toLowerCase()}" 
          ${account.status === 'SOLD' ? 'data-cancel-sold="true" style="cursor: pointer;" title="点击取消售出"' : ''}>
          ${statusMap[account.status]}
        </span>
        ${account.status === 'BANNED' && account.ban_reason ? `
          <span style="font-size: 0.75rem; color: #ef4444; text-align: right;">
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
          <button class="copy-btn" onclick="copyText('${account.email}')" title="复制">📋</button>
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">密码</span>
        <span class="info-value">
          ${maskPassword(account.password)}
          <button class="copy-btn" onclick="copyText('${account.password}')" title="复制">📋</button>
        </span>
      </div>
      ${account.backup_email ? `
        <div class="info-row">
          <span class="info-label">辅邮</span>
          <span class="info-value">
            ${account.backup_email}
            <button class="copy-btn" onclick="copyText('${account.backup_email}')" title="复制">📋</button>
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
        <div class="buyer-info-title">💰 售出信息</div>
        <div class="info-row">
          <span class="info-label">买家</span>
          <span class="info-value">${account.buyer_name}</span>
        </div>
        ${account.buyer_order ? `
          <div class="info-row">
            <span class="info-label">订单号</span>
            <span class="info-value">${account.buyer_order}</span>
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

    <div class="account-actions">
      <button class="action-btn" onclick="copyFullAccount(${account.id})">
        📄 复制全部
      </button>
      ${account.status !== 'BANNED' && account.type === 'PERSONAL' && account.status !== 'SOLD' ? `
        <button class="action-btn" onclick="convertToFamily(${account.id})">
          🔄 转家庭组
        </button>
        <button class="action-btn success" onclick="openSellModal(${account.id})">
          💰 售出
        </button>
      ` : ''}
      ${account.status !== 'BANNED' && account.type === 'FAMILY' ? `
        <button class="action-btn" onclick="convertToPersonal(${account.id})">
          ↩️ 还原个人号
        </button>
      ` : ''}
      ${account.status !== 'BANNED' && account.status !== 'SOLD' ? `
        <button class="action-btn danger" onclick="markAsBanned(${account.id})">
          🚫 标记异常
        </button>
      ` : ''}
      <button class="action-btn danger" onclick="deleteAccount(${account.id})">
        🗑️ 删除
      </button>
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
    const slots = account.slots || [null, null, null, null, null];

    let slotsHTML = '<div class="slots-container"><div class="slots-title">🎫 车位管理 (点击操作)</div><div class="slots-grid">';

    const now = new Date();
    const soonThreshold = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000); // 1天后

    slots.forEach((slot, index) => {
        if (slot === null) {
            slotsHTML += `
        <div class="slot empty" onclick="assignSlot(${account.id}, ${index})">
          <div class="slot-icon">⭕</div>
          <div class="slot-label">空闲</div>
        </div>
      `;
        } else {
            // 检查到期状态
            let slotClass = 'occupied';
            let slotIcon = '✅';

            if (slot.expiresAt) {
                const expiresAt = new Date(slot.expiresAt);
                if (expiresAt <= now) {
                    // 已到期 - 红色
                    slotClass = 'occupied expired';
                    slotIcon = '🔴';
                } else if (expiresAt <= soonThreshold) {
                    // 即将到期 - 黄色
                    slotClass = 'occupied expiring';
                    slotIcon = '🟡';
                }
            }

            slotsHTML += `
        <div class="slot ${slotClass}" onclick="viewSlotDetails(${account.id}, ${index})">
          <div class="slot-icon">${slotIcon}</div>
          <div class="slot-label">${slot.buyer || '已用'}</div>
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
    document.getElementById('modal-title').textContent = '👥 车位详情';

    // 显示买家信息（设置为只读）
    const buyerInput = document.getElementById('buyer-name');
    const orderInput = document.getElementById('order-number');
    const priceInput = document.getElementById('slot-price');
    const expireDaysInput = document.getElementById('expire-days');

    buyerInput.value = slot.buyer || '';
    orderInput.value = slot.order || '';
    priceInput.value = slot.price || '';
    expireDaysInput.value = slot.expireDays || '';

    buyerInput.disabled = true;
    orderInput.disabled = true;
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

    // 显示下车按钮，隐藏确认按钮
    document.getElementById('slot-confirm-btn').style.display = 'none';
    document.getElementById('slot-release-btn').style.display = 'inline-block';

    // 显示模态框
    document.getElementById('slot-modal').classList.add('active');
}

function assignSlot(accountId, slotIndex) {
    currentSlotEdit = { accountId, slotIndex, action: 'assign' };
    document.getElementById('modal-title').textContent = '🚗 发车 - 分配车位';

    const buyerInput = document.getElementById('buyer-name');
    const orderInput = document.getElementById('order-number');
    const priceInput = document.getElementById('slot-price');
    const expireDaysInput = document.getElementById('expire-days');

    buyerInput.value = '';
    orderInput.value = '';
    priceInput.value = '';
    expireDaysInput.value = '';

    buyerInput.disabled = false;
    orderInput.disabled = false;
    priceInput.disabled = false;
    expireDaysInput.disabled = false;

    // 显示服务期限输入框（分配模式）
    document.getElementById('expire-days-group').style.display = 'block';
    // 隐藏上车时间、到期时间和下车按钮
    document.getElementById('slot-time-group').style.display = 'none';
    document.getElementById('slot-expire-info-group').style.display = 'none';
    document.getElementById('slot-confirm-btn').style.display = 'inline-block';
    document.getElementById('slot-release-btn').style.display = 'none';

    document.getElementById('slot-modal').classList.add('active');
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

async function confirmSlotAction() {
    if (!currentSlotEdit) return;

    const buyer = document.getElementById('buyer-name').value.trim();
    const order = document.getElementById('order-number').value.trim();
    const price = document.getElementById('slot-price').value.trim();
    const expireDays = document.getElementById('expire-days').value.trim();

    if (!buyer && currentSlotEdit.action === 'assign') {
        showToast('请输入买家信息', 'error');
        return;
    }

    await updateSlot(currentSlotEdit.accountId, currentSlotEdit.slotIndex, currentSlotEdit.action, buyer, order, price, expireDays);
    closeSlotModal();
}

async function updateSlot(accountId, slotIndex, action, buyer = '', order = '', price = '', expireDays = '') {
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
                expireDays
            })
        });

        const data = await response.json();

        if (data.success) {
            showToast(action === 'assign' ? '车位分配成功' : '车位释放成功', 'success');
            loadAccounts();
            loadStats();
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
            showToast('✅ 已转换为家庭组!请切换到"家庭组"标签查看', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('❌ 转换失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('convertToFamily error:', error);
        showToast('❌ 网络错误: ' + error.message, 'error');
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
            showToast('✅ 已还原为个人号!请切换到"个人号库存"标签查看', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('❌ 还原失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('convertToPersonal error:', error);
        showToast('❌ 网络错误: ' + error.message, 'error');
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
        showToast('❌ 请输入封禁原因', 'error');
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
            showToast('✅ 已标记为异常', 'success');
            closeBanModal();
            loadAccounts();
            loadStats();
        } else {
            showToast('❌ 操作失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('confirmBan error:', error);
        showToast('❌ 网络错误: ' + error.message, 'error');
    }
}

// ===== 个人号售出功能 =====
let currentSellAccountId = null;

function openSellModal(accountId) {
    console.log('openSellModal called:', accountId);
    currentSellAccountId = accountId;

    try {
        document.getElementById('sell-buyer-name').value = '';
        document.getElementById('sell-order-number').value = '';
        document.getElementById('sell-price').value = '';
        document.getElementById('sell-modal').classList.add('active');
        console.log('Sell modal opened successfully');
    } catch (error) {
        console.error('Error opening sell modal:', error);
        showToast('❌ 打开售出弹窗失败', 'error');
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
    const buyerOrder = document.getElementById('sell-order-number').value.trim();
    const buyerPrice = document.getElementById('sell-price').value.trim();

    console.log('confirmSell called:', { accountId: currentSellAccountId, buyerName, buyerOrder, buyerPrice });

    if (!buyerName) {
        showToast('❌ 请输入买家昵称', 'error');
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
                buyerOrder,
                buyerPrice
            })
        });

        const data = await response.json();
        console.log('confirmSell response:', data);

        if (data.success) {
            showToast('✅ 标记为已售出成功!', 'success');
            closeSellModal();
            loadAccounts();
            loadStats();
        } else {
            showToast('❌ 操作失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('confirmSell error:', error);
        showToast('❌ 网络错误: ' + error.message, 'error');
    }
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
            showToast('✅ 已取消售出,账号已恢复为库存状态', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('❌ 取消失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('cancelSold error:', error);
        showToast('❌ 网络错误: ' + error.message, 'error');
    } finally {
        currentCancelSoldAccountId = null;
    }
}

// ===== 工具函数 =====
function maskPassword(password) {
    if (password.length <= 4) return '****';
    return password.substring(0, 2) + '****' + password.substring(password.length - 2);
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
    if (!confirm('确定要彻底删除这个账号吗？此操作无法撤销！')) {
        return;
    }

    showToast('正在删除账号...', 'success');

    try {
        const response = await fetch(`${API_BASE_URL}/api/accounts/${accountId}`, {
            method: 'DELETE',
            headers: getAuthHeaders()
        });

        const data = await response.json();

        if (data.success) {
            showToast('✅ 账号已删除', 'success');
            loadAccounts();
            loadStats();
        } else {
            showToast('❌ 删除失败: ' + (data.error || '未知错误'), 'error');
        }
    } catch (error) {
        console.error('deleteAccount error:', error);
        showToast('❌ 网络错误: ' + error.message, 'error');
    }
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
        showToast(`✅ 已复制 ${selectedAccountIds.size} 个账号到剪贴板`, 'success');
    });

    // 批量删除
    batchDeleteBtn.addEventListener('click', async () => {
        if (selectedAccountIds.size === 0) return;

        if (!confirm(`确定要删除选中的 ${selectedAccountIds.size} 个账号吗？此操作不可逆！`)) {
            return;
        }

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
}

function updateBatchUI() {
    const batchExportBtn = document.getElementById('batch-export-btn');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');
    const selectAllCheckbox = document.getElementById('select-all-checkbox');

    if (!batchExportBtn || !batchDeleteBtn) return;

    if (selectedAccountIds.size > 0) {
        batchExportBtn.style.display = 'inline-flex';
        batchDeleteBtn.style.display = 'inline-flex';
        batchExportBtn.innerHTML = `<span class="btn-icon">📤</span> 批量导出 (${selectedAccountIds.size})`;
        batchDeleteBtn.innerHTML = `<span class="btn-icon">🗑️</span> 批量删除 (${selectedAccountIds.size})`;
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

function initNotifications() {
    // 初始检查
    checkExpiredNotifications();

    // 每5分钟检查一次
    setInterval(checkExpiredNotifications, 5 * 60 * 1000);
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
            const statusIcon = isExpired ? '🔴' : '🟡';

            html += `
                <div class="notification-item ${statusClass}">
                    <div class="notification-item-header">
                        <span class="notification-item-account">📧 ${notification.accountEmail}</span>
                        <span class="notification-status-badge ${statusClass}">${statusIcon} ${statusText}</span>
                    </div>
                    <div class="notification-item-slot">🚗 车位 ${notification.slotIndex + 1}</div>
                    <div class="notification-item-buyer">👤 买家: ${notification.buyer}</div>
                    <div class="notification-item-time">
                        ⏰ 到期时间: ${expiresAt.toLocaleString()}
                        ${notification.expireDays ? ` (${notification.expireDays}天)` : ''}<br>
                        📅 上车时间: ${assignedAt.toLocaleString()}
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
    showToast('✓ 已全部标记为已读', 'success');
    closeNotificationModal();
}
