// 在浏览器控制台运行这个脚本来诊断弹窗问题

console.log('=== 弹窗诊断开始 ===');

// 1. 检查弹窗元素是否存在
const modal = document.getElementById('sell-modal');
console.log('1. 弹窗元素存在?', modal !== null);

if (modal) {
    // 2. 检查当前类名
    console.log('2. 当前类名:', modal.className);

    // 3. 检查计算后的样式
    const styles = window.getComputedStyle(modal);
    console.log('3. display 属性:', styles.display);
    console.log('   position 属性:', styles.position);
    console.log('   z-index 属性:', styles.zIndex);
    console.log('   visibility 属性:', styles.visibility);
    console.log('   opacity 属性:', styles.opacity);

    // 4. 检查是否有 active 类
    console.log('4. 有 active 类?', modal.classList.contains('active'));

    // 5. 手动添加 active 类并检查
    console.log('5. 手动添加 active 类...');
    modal.classList.add('active');
    const stylesAfter = window.getComputedStyle(modal);
    console.log('   添加后 display:', stylesAfter.display);

    // 6. 检查弹窗内容
    const modalContent = modal.querySelector('.modal-content');
    console.log('6. 弹窗内容存在?', modalContent !== null);

    // 7. 检查所有输入框
    const inputs = modal.querySelectorAll('input');
    console.log('7. 输入框数量:', inputs.length);

    // 8. 尝试强制显示
    console.log('8. 尝试强制显示...');
    modal.style.display = 'flex';
    console.log('   强制设置后可见?', modal.offsetHeight > 0);
}

console.log('=== 弹窗诊断结束 ===');
console.log('\n如果弹窗仍然不可见,请截图控制台输出');
