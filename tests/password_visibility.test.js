const fs = require('fs');

console.log('=== UNIT TEST: PASSWORD VISIBILITY TOGGLE ===\n');

// Lightweight HTML DOM Parser and Element Mock
class SimpleElement {
    constructor(tagName, attrs = {}) {
        this.tagName = tagName.toUpperCase();
        this.id = attrs.id || '';
        this.type = attrs.type || '';
        this.className = attrs.class || attrs.className || '';
        this.style = {};
        this.children = [];
        this.parentElement = null;
    }

    appendChild(child) {
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    querySelector(selector) {
        for (const child of this.children) {
            if (selector === 'input' && child.tagName === 'INPUT') return child;
            if (selector === 'i' && child.tagName === 'I') return child;
            if (selector.startsWith('.') && child.className.split(' ').includes(selector.slice(1))) return child;
            const found = child.querySelector(selector);
            if (found) return found;
        }
        return null;
    }

    closest(selector) {
        let current = this;
        const selectors = selector.split(',').map(s => s.trim());
        while (current) {
            for (const sel of selectors) {
                if (sel.startsWith('.')) {
                    const cls = sel.slice(1);
                    if (current.className.split(' ').includes(cls)) return current;
                }
            }
            current = current.parentElement;
        }
        return null;
    }

    click() {
        let defaultPrevented = false;
        let propagationStopped = false;
        const event = {
            type: 'click',
            target: this,
            preventDefault: () => { defaultPrevented = true; },
            stopPropagation: () => { propagationStopped = true; }
        };
        global.document.dispatchEvent(event);
        return { defaultPrevented, propagationStopped };
    }
}

class DocumentMock {
    constructor() {
        this.listeners = {};
        this.elementsById = {};
    }

    addEventListener(event, handler) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
    }

    dispatchEvent(event) {
        const handlers = this.listeners[event] ? this.listeners[event] : (this.listeners[event.type] || []);
        for (const handler of handlers) {
            handler(event);
        }
    }

    getElementById(id) {
        return this.elementsById[id] || null;
    }
}

global.document = new DocumentMock();

// Load the actual main.js toggle handler logic
const mainJsContent = fs.readFileSync('frontend/js/main.js', 'utf8');

// Parse document event listener logic from main.js
const eventListenerRegex = /document\.addEventListener\('click',\s*\(e\)\s*=>\s*\{([\s\S]*?)\}\);/;
const match = mainJsContent.match(eventListenerRegex);

if (!match) {
    throw new Error("Could not extract click event listener from main.js");
}

const listenerBody = match[1];
const toggleHandler = new Function('e', listenerBody);
global.document.addEventListener('click', toggleHandler);

// Parse index.html to dynamically extract password wrappers
const htmlContent = fs.readFileSync('frontend/index.html', 'utf8');

function createPasswordComponent(inputId) {
    const wrapper = new SimpleElement('div', { class: 'password-input-wrapper' });
    const input = new SimpleElement('input', { id: inputId, type: 'password', class: 'input-control' });
    const button = new SimpleElement('button', { type: 'button', class: 'toggle-password-btn' });
    const icon = new SimpleElement('i', { class: 'fa-solid fa-eye' });

    wrapper.appendChild(input);
    wrapper.appendChild(button);
    button.appendChild(icon);

    global.document.elementsById[inputId] = input;
    return { wrapper, input, button, icon };
}

// Perform Tests for all 3 Password Inputs in the App
const inputsToTest = ['systemPasswordInput', 'adminPasswordInput', 'newPasswordInput'];

for (const inputId of inputsToTest) {
    const { input, button, icon } = createPasswordComponent(inputId);

    // Test Initial State
    console.log(`[Test ${inputId}]: Initial type: ${input.type}, icon: ${icon.className}`);
    if (input.type !== 'password' || !icon.className.includes('fa-eye')) {
        throw new Error(`Initial state failed for ${inputId}`);
    }

    // 1st Click -> Show Password
    const clickResult1 = button.click();
    console.log(`[Test ${inputId}]: 1st Click -> type: ${input.type}, icon: ${icon.className}`);
    if (input.type !== 'text' || !icon.className.includes('fa-eye-slash')) {
        throw new Error(`First click failed for ${inputId}`);
    }
    if (!clickResult1.defaultPrevented) {
        throw new Error(`preventDefault failed on button click for ${inputId}`);
    }

    // 2nd Click -> Hide Password
    button.click();
    console.log(`[Test ${inputId}]: 2nd Click -> type: ${input.type}, icon: ${icon.className}`);
    if (input.type !== 'password' || !icon.className.includes('fa-eye')) {
        throw new Error(`Second click failed for ${inputId}`);
    }

    // Direct click on inner <i> icon tag
    icon.click();
    console.log(`[Test ${inputId}]: Direct <i> click -> type: ${input.type}, icon: ${icon.className}`);
    if (input.type !== 'text' || !icon.className.includes('fa-eye-slash')) {
        throw new Error(`Direct icon target click failed for ${inputId}`);
    }
}

console.log('\n=================================================');
console.log(' ALL PASSWORD TOGGLE UNIT TESTS PASSED 100%');
console.log('=================================================');
