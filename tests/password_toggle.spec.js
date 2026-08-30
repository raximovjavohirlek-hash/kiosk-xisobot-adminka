/**
 * Playwright End-to-End (E2E) Test Suite
 * Test Feature: Password Visibility Toggle & Authentication Gate
 *
 * Runs headless browser interaction to verify:
 * 1. Initial state (input type="password", eye icon "fa-eye")
 * 2. Click eye button -> input type="text", eye-slash icon "fa-eye-slash", text visible
 * 3. Re-click eye button -> input type="password", eye icon "fa-eye", text hidden
 * 4. Child <i> element click propagation edge case handling
 */

const { test, expect } = require('@playwright/test');

test.describe('Password Visibility Toggle & Login Gate E2E Tests', () => {
    test.beforeEach(async ({ page }) => {
        // Navigate to the dashboard application
        await page.goto('http://127.0.0.1:5050/static/index.html');
    });

    test('Should verify login gate password toggle behavior (Hide -> Show -> Hide)', async ({ page }) => {
        const passwordInput = page.locator('#systemPasswordInput');
        const toggleButton = page.locator('#systemLoginForm .toggle-password-btn');
        const eyeIcon = toggleButton.locator('i');

        // 1. Initial State Assertions
        await expect(passwordInput).toBeVisible();
        await expect(passwordInput).toHaveAttribute('type', 'password');
        await expect(eyeIcon).toHaveClass(/fa-eye/);
        await expect(eyeIcon).not.toHaveClass(/fa-eye-slash/);

        // Type test password
        await passwordInput.fill('Javo!QAZ');
        await expect(passwordInput).toHaveValue('Javo!QAZ');

        // 2. Click Eye Button to Show Password
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'text');
        await expect(eyeIcon).toHaveClass(/fa-eye-slash/);

        // 3. Click Eye Button Again to Hide Password
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
        await expect(eyeIcon).toHaveClass(/fa-eye/);
    });

    test('Should handle child icon target click event delegation correctly', async ({ page }) => {
        const passwordInput = page.locator('#systemPasswordInput');
        const eyeIcon = page.locator('#systemLoginForm .toggle-password-btn i');

        // Click directly on the <i> tag inside the button
        await eyeIcon.click();
        await expect(passwordInput).toHaveAttribute('type', 'text');

        // Click again on the <i> tag
        await eyeIcon.click();
        await expect(passwordInput).toHaveAttribute('type', 'password');
    });

    test('Should submit login form cleanly regardless of password visibility state', async ({ page }) => {
        const usernameInput = page.locator('#systemUsernameInput');
        const passwordInput = page.locator('#systemPasswordInput');
        const toggleButton = page.locator('#systemLoginForm .toggle-password-btn');
        const submitBtn = page.locator('#systemLoginSubmitBtn');
        const loginGateModal = page.locator('#systemLoginGateModal');

        await usernameInput.fill('Javohir');
        await passwordInput.fill('Javo!QAZ');

        // Toggle password to text mode before submitting
        await toggleButton.click();
        await expect(passwordInput).toHaveAttribute('type', 'text');

        // Submit form
        await submitBtn.click();

        // Login gate modal should close after successful authentication
        await expect(loginGateModal).toBeHidden({ timeout: 5000 });
    });
});
