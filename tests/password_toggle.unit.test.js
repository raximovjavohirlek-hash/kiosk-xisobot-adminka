/**
 * Jest / Vitest Unit Test Suite
 * Component: Password Visibility Toggle Handler
 */

describe("Password Visibility Toggle Unit Tests", () => {
    beforeEach(() => {
        document.body.innerHTML = `
            <div class="password-input-wrapper" style="position: relative;">
                <input type="password" id="testPasswordInput" class="input-control" value="Secret123!">
                <button type="button" class="toggle-password-btn">
                    <i class="fa-solid fa-eye"></i>
                </button>
            </div>
        `;

        document.addEventListener("click", (e) => {
            const toggleBtn = e.target.closest(".toggle-password-btn, .btn-toggle-pwd");
            if (!toggleBtn) return;
            e.preventDefault();
            e.stopPropagation();
            const wrapper = toggleBtn.closest(".password-input-wrapper") || toggleBtn.parentElement;
            if (!wrapper) return;
            const input = wrapper.querySelector("input");
            if (!input) return;
            const icon = toggleBtn.querySelector("i");
            if (input.type === "password") {
                input.type = "text";
                if (icon) {
                    icon.className = "fa-solid fa-eye-slash";
                    icon.style.color = "var(--accent-cyan)";
                }
            } else {
                input.type = "password";
                if (icon) {
                    icon.className = "fa-solid fa-eye";
                    icon.style.color = "";
                }
            }
        });
    });

    test("Initial input state should be password with fa-eye icon", () => {
        const input = document.getElementById("testPasswordInput");
        const icon = document.querySelector(".toggle-password-btn i");
        expect(input.type).toBe("password");
        expect(icon.className).toContain("fa-eye");
    });

    test("Clicking toggle button should switch input to text and icon to fa-eye-slash", () => {
        const input = document.getElementById("testPasswordInput");
        const btn = document.querySelector(".toggle-password-btn");
        const icon = btn.querySelector("i");

        btn.click();

        expect(input.type).toBe("text");
        expect(icon.className).toContain("fa-eye-slash");
    });

    test("Clicking toggle button twice should revert input back to password", () => {
        const input = document.getElementById("testPasswordInput");
        const btn = document.querySelector(".toggle-password-btn");
        const icon = btn.querySelector("i");

        btn.click(); // 1st click -> text
        btn.click(); // 2nd click -> password

        expect(input.type).toBe("password");
        expect(icon.className).toContain("fa-eye");
    });

    test("Clicking directly on inner icon element should correctly bubble and toggle visibility", () => {
        const input = document.getElementById("testPasswordInput");
        const icon = document.querySelector(".toggle-password-btn i");

        icon.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

        expect(input.type).toBe("text");
        expect(icon.className).toContain("fa-eye-slash");
    });
});
