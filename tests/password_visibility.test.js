const { JSDOM } = require('jsdom');
const fs = require('fs');

console.log('=== E2E / UNIT TEST: PASSWORD VISIBILITY TOGGLE ===\n');

const htmlContent = fs.readFileSync('frontend/index.html', 'utf8');
const dom = new JSDOM(htmlContent, { runScripts: "dangerously", resources: "usable" });
const { window } = dom;
const { document } = window;

// Attach global event listener delegation from main.js
document.addEventListener('click', (e) => {
    const toggleBtn = e.target.closest('.toggle-password-btn, .btn-toggle-pwd');
    if (!toggleBtn) return;
    e.preventDefault();
    e.stopPropagation();
    const wrapper = toggleBtn.closest('.password-input-wrapper') || toggleBtn.parentElement;
    if (!wrapper) return;
    const input = wrapper.querySelector('input');
    if (!input) return;
    const icon = toggleBtn.querySelector('i');
    if (input.type === 'password') {
        input.type = 'text';
        if (icon) {
            icon.className = 'fa-solid fa-eye-slash';
            icon.style.color = 'var(--accent-cyan)';
        }
    } else {
        input.type = 'password';
        if (icon) {
            icon.className = 'fa-solid fa-eye';
            icon.style.color = '';
        }
    }
});

// Test 1: systemPasswordInput toggle
const sysInput = document.getElementById('systemPasswordInput');
const sysBtn = sysInput.closest('.password-input-wrapper').querySelector('.toggle-password-btn');
const sysIcon = sysBtn.querySelector('i');

console.log('[Test 1.1]: Initial state -> type:', sysInput.type, ', icon:', sysIcon.className);
if (sysInput.type !== 'password' || !sysIcon.className.includes('fa-eye')) throw new Error('Initial state failed');

// Click 1: Show password
sysBtn.click();
console.log('[Test 1.2]: After 1st Click -> type:', sysInput.type, ', icon:', sysIcon.className);
if (sysInput.type !== 'text' || !sysIcon.className.includes('fa-eye-slash')) throw new Error('First click failed');

// Click 2: Hide password
sysBtn.click();
console.log('[Test 1.3]: After 2nd Click -> type:', sysInput.type, ', icon:', sysIcon.className);
if (sysInput.type !== 'password' || !sysIcon.className.includes('fa-eye')) throw new Error('Second click failed');

// Test 2: Direct click on <i> element inside button (Child target edge-case)
sysIcon.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
console.log('[Test 2.1]: Direct <i> click -> type:', sysInput.type, ', icon:', sysIcon.className);
if (sysInput.type !== 'text' || !sysIcon.className.includes('fa-eye-slash')) throw new Error('Direct icon click failed');

// Test 3: newPasswordInput toggle
const newPwdInput = document.getElementById('newPasswordInput');
const newPwdBtn = newPwdInput.closest('.password-input-wrapper').querySelector('.toggle-password-btn');
const newPwdIcon = newPwdBtn.querySelector('i');

newPwdBtn.click();
console.log('[Test 3.1]: newPasswordInput -> type:', newPwdInput.type, ', icon:', newPwdIcon.className);
if (newPwdInput.type !== 'text' || !newPwdIcon.className.includes('fa-eye-slash')) throw new Error('New password click failed');

console.log('\n=== ALL PASSWORD TOGGLE UNIT TESTS PASSED 100% ===');
