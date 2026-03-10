// ==UserScript==
// @name         Mob Wars City - Start Public Fight
// @namespace    mobwarscity
// @author       Asemov/mtxve
// @version      1.1.1
// @description  Adds quick public-fight controls and a floating helper UI
// @match        https://mobwarscity.com/boss.php*
// @match        https://mobwarscity.com/boss/*
// @match        https://mobwarscity.com/attack.php*
// @download     https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/PublicBoss.user.js
// @update       https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/PublicBoss.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ORIGIN = 'https://mobwarscity.com';
    const PUBLIC_BOSS_LIST_URL = `${ORIGIN}/boss/viewPublic/1`;
    const PREVIOUS_FIGHTS_TEXT = 'view your previous fights';
    const HELPER_BUTTON_LABEL = 'Public Fight Helper';
    const START_BUTTON_LABEL = 'Start Public Fight';
    const START_BUTTON_ICON = 'fa-solid fa-robot';
    const STARTING_BUTTON_ICON = 'fa-solid fa-spinner fa-spin';
    const REFERENCE_BUTTON_SELECTOR = [
        'button',
        'input[type="submit"]',
        'input[type="button"]',
        'a.button',
        'a.btn',
        '[role="button"]'
    ].join(', ');
    const REFERENCE_SIZE_PROPERTIES = [
        'height',
        'min-height',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'font-size',
        'font-weight',
        'line-height',
        'border-radius'
    ];
    const REFERENCE_STATE_SELECTOR = '.button, .btn, [role="button"]';
    const REFERENCE_STATE_ATTRIBUTES = ['disabled', 'class', 'aria-disabled', 'style'];
    const STATE_CLASS_NAMES = new Set(['disabled', 'cooldown']);
    const DEFAULTS = {
        returnAfterStart: false,
        panelOpen: false
    };
    const STORE = {
        returnAfterStart: 'mw_public_boss_return_after_start',
        panelOpen: 'mw_public_boss_panel_open',
        panelLeft: 'mw_public_boss_panel_left',
        panelTop: 'mw_public_boss_panel_top'
    };
    const SESSION = {
        pendingReturn: 'mw_public_boss_pending_return'
    };
    const ID = {
        style: 'mw-pb-style',
        toggleButton: 'mw-pb-toggle-button',
        panel: 'mw-pb-panel',
        titlebar: 'mw-pb-titlebar',
        close: 'mw-pb-close',
        returnToggle: 'mw-pb-return-toggle',
        status: 'mw-pb-status'
    };
    const RUNTIME_STATE = {
        initialized: false,
        returnAfterStart: DEFAULTS.returnAfterStart,
        panelOpen: DEFAULTS.panelOpen
    };

    let statusRef = null;

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    }

    function parseIntSafe(value) {
        const n = parseInt(value, 10);
        return Number.isInteger(n) ? n : null;
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getStored(key, fallback, normalizeFn) {
        try {
            const raw = localStorage.getItem(key);
            if (raw === null) return fallback;
            return normalizeFn(raw);
        } catch (_) {
            return fallback;
        }
    }

    function setStored(key, value) {
        try {
            localStorage.setItem(key, String(value));
        } catch (_) {}
    }

    function getSession(key) {
        try {
            return sessionStorage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    function setSession(key, value) {
        try {
            sessionStorage.setItem(key, String(value));
        } catch (_) {}
    }

    function removeSession(key) {
        try {
            sessionStorage.removeItem(key);
        } catch (_) {}
    }

    function loadRuntimeState() {
        if (RUNTIME_STATE.initialized) return;
        RUNTIME_STATE.returnAfterStart = getStored(
            STORE.returnAfterStart,
            DEFAULTS.returnAfterStart,
            (value) => value === '1'
        );
        RUNTIME_STATE.panelOpen = getStored(
            STORE.panelOpen,
            DEFAULTS.panelOpen,
            (value) => value === '1'
        );
        RUNTIME_STATE.initialized = true;
    }

    function setReturnAfterStart(enabled) {
        RUNTIME_STATE.returnAfterStart = Boolean(enabled);
        setStored(STORE.returnAfterStart, enabled ? 1 : 0);
    }

    function setPanelOpen(open) {
        RUNTIME_STATE.panelOpen = Boolean(open);
        setStored(STORE.panelOpen, open ? 1 : 0);
    }

    function hasPendingReturn() {
        return getSession(SESSION.pendingReturn) === '1';
    }

    function setPendingReturn(enabled) {
        if (enabled) {
            setSession(SESSION.pendingReturn, '1');
            return;
        }
        removeSession(SESSION.pendingReturn);
    }

    function absoluteUrl(url) {
        return new URL(url, location.origin).href;
    }

    function getBossFightIdFromUrl(url) {
        try {
            const u = new URL(url, location.origin);
            const searchValue = u.searchParams.get('bossFight');
            if (searchValue) return searchValue;
            const pathMatch = u.pathname.match(/(?:^|\/)bossFight\/(\d+)(?:\/|$)/i);
            return pathMatch ? pathMatch[1] : null;
        } catch {
            return null;
        }
    }

    function isCurrentUrl(targetUrl) {
        try {
            return new URL(targetUrl, location.origin).href === location.href;
        } catch {
            return false;
        }
    }

    function isReferenceDisabled(referenceBtn) {
        return getReferenceStateElements(referenceBtn).some((el) => {
            if (!el) return false;
            if ('disabled' in el && el.disabled) return true;
            if (typeof el.matches === 'function' && el.matches(':disabled')) return true;
            if (el.hasAttribute?.('disabled')) return true;
            if (el.getAttribute?.('aria-disabled') === 'true') return true;
            return Array.from(el.classList || []).some((className) => STATE_CLASS_NAMES.has(className));
        });
    }

    function getReferenceStateElements(referenceBtn) {
        if (!referenceBtn) return [];

        const elements = [referenceBtn];
        const wrapper = referenceBtn.closest(REFERENCE_STATE_SELECTOR);
        if (wrapper && wrapper !== referenceBtn) {
            elements.push(wrapper);
        }

        return elements;
    }

    function getElementLabel(el) {
        if (!el) return '';
        return normalizeText(
            el.textContent ||
            el.value ||
            el.getAttribute?.('aria-label') ||
            el.getAttribute?.('title') ||
            ''
        );
    }

    function applyButtonDisabledState(btn, disabled) {
        btn.disabled = disabled;
        btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        btn.classList.toggle('disabled', disabled);
        btn.style.opacity = disabled ? '0.5' : '1';
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
    }

    function syncButtonState(startBtn, createBtn) {
        function update() {
            applyButtonDisabledState(startBtn, isReferenceDisabled(createBtn));
        }

        update();

        const observer = new MutationObserver(update);
        for (const el of getReferenceStateElements(createBtn)) {
            observer.observe(el, {
                attributes: true,
                attributeFilter: REFERENCE_STATE_ATTRIBUTES
            });
        }
    }

    function setButtonContent(btn, label, iconClassName) {
        btn.replaceChildren();

        const icon = document.createElement('i');
        icon.className = iconClassName;
        icon.setAttribute('aria-hidden', 'true');

        const text = document.createElement('span');
        text.textContent = label;

        btn.append(icon, text);
        btn.setAttribute('aria-label', label);
        btn.title = label;
    }

    function setIconButtonContent(btn, label, iconClassName) {
        const currentIcon = btn.firstElementChild;
        if (
            btn.dataset.mwPbIconLabel === label &&
            btn.dataset.mwPbIconClass === iconClassName &&
            btn.childElementCount === 1 &&
            currentIcon &&
            currentIcon.tagName === 'I' &&
            currentIcon.className === iconClassName
        ) {
            btn.setAttribute('aria-label', label);
            btn.title = label;
            return;
        }

        btn.replaceChildren();

        const icon = document.createElement('i');
        icon.className = iconClassName;
        icon.setAttribute('aria-hidden', 'true');

        btn.appendChild(icon);
        btn.dataset.mwPbIconLabel = label;
        btn.dataset.mwPbIconClass = iconClassName;
        btn.setAttribute('aria-label', label);
        btn.title = label;
    }

    function findReferenceButton(container, ignoredElement) {
        if (!container) return null;

        const candidates = Array.from(container.querySelectorAll(REFERENCE_BUTTON_SELECTOR));
        const usableCandidates = candidates.filter((el) => el !== ignoredElement);
        return usableCandidates.find((el) => getElementLabel(el).includes('create group'))
            || usableCandidates[0]
            || null;
    }

    function findStateReferenceButton(container) {
        return container?.querySelector('button, a') || null;
    }

    function getReferenceClassName(referenceBtn) {
        if (!referenceBtn?.classList) return '';
        return Array.from(referenceBtn.classList)
            .filter((className) => !STATE_CLASS_NAMES.has(className))
            .join(' ');
    }

    function applyReferenceButtonSizing(btn, referenceBtn) {
        const referenceClassName = getReferenceClassName(referenceBtn);
        if (referenceClassName) {
            btn.className = referenceClassName;
        }

        if (!btn.className) {
            btn.className = 'button';
        }

        if (!referenceBtn) return;

        const computed = window.getComputedStyle(referenceBtn);
        for (const property of REFERENCE_SIZE_PROPERTIES) {
            const value = computed.getPropertyValue(property);
            if (value) {
                btn.style.setProperty(property, value, 'important');
            }
        }
    }

    function clickElement(el) {
        if (!el) return false;
        if (typeof el.click === 'function') {
            el.click();
            return true;
        }
        return false;
    }

    function getViewportPositionLimits(el) {
        const maxLeft = Math.max(0, Math.floor(window.innerWidth - el.offsetWidth));
        const maxTop = Math.max(0, Math.floor(window.innerHeight - el.offsetHeight));
        return { maxLeft, maxTop };
    }

    function clampPanelPosition(el, left, top) {
        const { maxLeft, maxTop } = getViewportPositionLimits(el);
        return {
            left: clamp(Math.round(left), 0, maxLeft),
            top: clamp(Math.round(top), 0, maxTop)
        };
    }

    function applyPanelPosition(el, left, top) {
        const safe = clampPanelPosition(el, left, top);
        el.style.left = `${safe.left}px`;
        el.style.top = `${safe.top}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        return safe;
    }

    function savePanelPosition(el) {
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const safe = clampPanelPosition(el, rect.left, rect.top);
        setStored(STORE.panelLeft, safe.left);
        setStored(STORE.panelTop, safe.top);
    }

    function restorePanelPosition(el) {
        if (!el) return false;
        const left = getStored(STORE.panelLeft, null, (value) => parseIntSafe(value));
        const top = getStored(STORE.panelTop, null, (value) => parseIntSafe(value));
        if (left === null || top === null) return false;
        applyPanelPosition(el, left, top);
        return true;
    }

    function setStatus(message, isError) {
        if (!statusRef) return;
        const text = String(message || '').trim();
        statusRef.textContent = text;
        statusRef.hidden = !text;
        statusRef.style.display = text ? 'block' : 'none';
        statusRef.style.color = isError ? '#d14f4f' : 'inherit';
    }

    function findPreviousFightsButton(root) {
        const scope = root || document;
        const selector = `${REFERENCE_BUTTON_SELECTOR}, .button, .btn, a[href]`;
        const candidates = Array.from(scope.querySelectorAll(selector));
        return candidates.find((el) => getElementLabel(el).includes(PREVIOUS_FIGHTS_TEXT)) || null;
    }

    function getButtonHost(referenceBtn) {
        if (!referenceBtn) return null;
        const wrapper = referenceBtn.closest(REFERENCE_STATE_SELECTOR);
        if (wrapper && getElementLabel(wrapper).includes(PREVIOUS_FIGHTS_TEXT)) {
            return wrapper;
        }
        return wrapper || referenceBtn;
    }

    function ensureUiStyle() {
        if (document.getElementById(ID.style)) return;

        const style = document.createElement('style');
        style.id = ID.style;
        style.textContent = `
            #${ID.panel} {
                position: fixed;
                right: 16px;
                bottom: 72px;
                z-index: 2147483646;
                width: 270px;
            }
            #${ID.panel}[hidden] {
                display: none !important;
            }
            #${ID.panel} .inner-body_menu-box {
                overflow: hidden;
                box-shadow: 0 14px 28px rgba(20, 26, 38, 0.18);
            }
            #${ID.panel} .mw-pb-content {
                position: relative;
                z-index: 1;
                min-height: 320px;
                padding: 14px 14px 16px;
            }
            #${ID.titlebar} {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin: 0 0 12px;
                cursor: move;
            }
            #${ID.titlebar} .inner-body_title {
                margin: 0;
            }
            #${ID.close} {
                border: 0;
                background: transparent;
                color: #8d8877;
                font-size: 12px;
                font-weight: 700;
                cursor: pointer;
                padding: 0;
            }
            #${ID.panel} .mw-pb-switch-row {
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 12px;
                margin: 0 0 10px;
            }
            #${ID.panel} .mw-pb-switch-copy {
                display: block;
                font-size: 12px;
                font-weight: 700;
                line-height: 1.35;
                color: inherit;
            }
            #${ID.panel} .mw-pb-switch {
                position: relative;
                display: inline-flex;
                flex: 0 0 auto;
                width: 42px;
                height: 24px;
                cursor: pointer;
            }
            #${ID.panel} .mw-pb-switch input {
                position: absolute;
                opacity: 0;
                pointer-events: none;
            }
            #${ID.panel} .mw-pb-switch-track {
                width: 100%;
                height: 100%;
                border-radius: 999px;
                background: #51483e;
                transition: background 120ms ease;
            }
            #${ID.panel} .mw-pb-switch-track::after {
                content: '';
                position: absolute;
                top: 3px;
                left: 3px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #f6f0dc;
                transition: transform 120ms ease;
            }
            #${ID.panel} .mw-pb-switch input:checked + .mw-pb-switch-track {
                background: #6d8f58;
            }
            #${ID.panel} .mw-pb-switch input:checked + .mw-pb-switch-track::after {
                transform: translateX(18px);
            }
            #${ID.panel} #${ID.status} {
                margin-top: 12px;
                font-size: 12px;
                font-weight: 700;
            }
        `;
        document.head.appendChild(style);
    }

    function updatePanelVisibility(panel, toggleButton) {
        if (panel) {
            panel.hidden = !RUNTIME_STATE.panelOpen;
        }
        if (toggleButton) {
            toggleButton.setAttribute('aria-expanded', RUNTIME_STATE.panelOpen ? 'true' : 'false');
            toggleButton.setAttribute('aria-pressed', RUNTIME_STATE.panelOpen ? 'true' : 'false');
            toggleButton.title = RUNTIME_STATE.panelOpen ? 'Hide Public Fight Helper' : 'Show Public Fight Helper';
        }
    }

    function makeDraggable(panel, handle) {
        if (!panel || !handle || handle.dataset.mwPbDragBound === '1') return;
        handle.dataset.mwPbDragBound = '1';

        let dragging = false;
        let offsetX = 0;
        let offsetY = 0;

        const stop = () => {
            if (!dragging) return;
            dragging = false;
            savePanelPosition(panel);
            window.removeEventListener('mousemove', onMove, true);
            window.removeEventListener('mouseup', stop, true);
        };

        const onMove = (event) => {
            if (!dragging) return;
            applyPanelPosition(panel, event.clientX - offsetX, event.clientY - offsetY);
        };

        handle.addEventListener('mousedown', (event) => {
            if (event.button !== 0) return;
            if (event.target && event.target.closest(`#${ID.close}`)) return;

            const rect = panel.getBoundingClientRect();
            offsetX = event.clientX - rect.left;
            offsetY = event.clientY - rect.top;
            dragging = true;
            event.preventDefault();

            window.addEventListener('mousemove', onMove, true);
            window.addEventListener('mouseup', stop, true);
        });
    }

    function buildHelperUi() {
        loadRuntimeState();
        ensureUiStyle();
        const existingPanel = document.getElementById(ID.panel);
        const existingToggleButton = ensureHelperToggleButton();
        if (existingPanel) {
            updatePanelVisibility(existingPanel, existingToggleButton);
            return;
        }

        const panel = document.createElement('div');
        panel.id = ID.panel;
        panel.className = 'inner-body_menu-box_wrap';

        const box = document.createElement('div');
        box.className = 'inner-body_menu-box';

        const content = document.createElement('div');
        content.className = 'mw-pb-content';

        const titlebar = document.createElement('div');
        titlebar.id = ID.titlebar;

        const title = document.createElement('h3');
        title.className = 'inner-body_title';
        title.textContent = 'Public Fight Helper';

        const closeButton = document.createElement('button');
        closeButton.id = ID.close;
        closeButton.type = 'button';
        closeButton.textContent = 'Hide';
        closeButton.addEventListener('click', () => {
            setPanelOpen(false);
            updatePanelVisibility(panel, document.getElementById(ID.toggleButton));
        });

        titlebar.append(title, closeButton);

        const switchRow = document.createElement('label');
        switchRow.className = 'mw-pb-switch-row';
        switchRow.htmlFor = ID.returnToggle;

        const switchCopy = document.createElement('span');
        switchCopy.className = 'mw-pb-switch-copy';
        switchCopy.textContent = 'Return to Public Bosses after start';

        const switchWrap = document.createElement('span');
        switchWrap.className = 'mw-pb-switch';

        const toggle = document.createElement('input');
        toggle.id = ID.returnToggle;
        toggle.type = 'checkbox';
        toggle.checked = RUNTIME_STATE.returnAfterStart;
        toggle.addEventListener('change', () => {
            setReturnAfterStart(toggle.checked);
            setStatus('', false);
        });

        const switchTrack = document.createElement('span');
        switchTrack.className = 'mw-pb-switch-track';
        switchWrap.append(toggle, switchTrack);
        switchRow.append(switchCopy, switchWrap);

        const status = document.createElement('div');
        status.id = ID.status;
        status.hidden = true;
        status.style.display = 'none';

        const bgTop = document.createElement('div');
        bgTop.className = 'inner-body_bg-top';
        bgTop.innerHTML =
            '<img class="bg-stretch" src="img/img-05-top.png" alt="background decor" srcset="img/img-05-top@2x.png 2x">';

        const bgBottom = document.createElement('div');
        bgBottom.className = 'inner-body_bg-bottom';
        bgBottom.innerHTML =
            '<img class="bg-stretch" src="img/img-05-bottom.png" alt="background decor" srcset="img/img-05-bottom@2x.png 2x">';

        content.append(titlebar, switchRow, status);
        box.append(content, bgTop, bgBottom);
        panel.appendChild(box);
        document.body.appendChild(panel);

        statusRef = status;

        restorePanelPosition(panel);
        updatePanelVisibility(panel, ensureHelperToggleButton());
        makeDraggable(panel, titlebar);
    }

    function createHelperToggleButton(referenceBtn) {
        const tagName = String(referenceBtn?.tagName || '').toLowerCase();
        const btn = tagName && tagName !== 'input'
            ? referenceBtn.cloneNode(false)
            : document.createElement('button');

        btn.id = ID.toggleButton;
        btn.removeAttribute('name');
        btn.removeAttribute('value');
        btn.removeAttribute('onclick');
        btn.removeAttribute('onmousedown');
        btn.removeAttribute('onmouseup');

        if (btn instanceof HTMLAnchorElement) {
            btn.href = '#';
            btn.removeAttribute('target');
            btn.setAttribute('role', 'button');
        } else if (btn instanceof HTMLButtonElement) {
            btn.type = 'button';
        } else {
            btn.setAttribute('role', 'button');
            btn.tabIndex = 0;
        }

        btn.style.marginLeft = '6px';
        btn.style.marginRight = '0';
        btn.style.setProperty('min-width', '34px', 'important');
        applyReferenceButtonSizing(btn, referenceBtn);
        setIconButtonContent(btn, HELPER_BUTTON_LABEL, START_BUTTON_ICON);

        const togglePanel = (event) => {
            event.preventDefault();
            setPanelOpen(!RUNTIME_STATE.panelOpen);
            updatePanelVisibility(document.getElementById(ID.panel), btn);
        };

        btn.addEventListener('click', togglePanel);
        if (!(btn instanceof HTMLButtonElement) && !(btn instanceof HTMLInputElement)) {
            btn.addEventListener('keydown', (event) => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                togglePanel(event);
            });
        }
        return btn;
    }

    function ensureHelperToggleButton() {
        const previousFightsBtn = findPreviousFightsButton(document);
        const previousFightsHost = getButtonHost(previousFightsBtn);
        let button = document.getElementById(ID.toggleButton);

        if (!previousFightsHost) return button || null;

        const host = previousFightsHost.parentElement;
        if (!host) return button || null;

        if (button && button.parentElement !== host) {
            button.remove();
            button = null;
        }

        if (!button) {
            button = createHelperToggleButton(previousFightsHost);
        }

        applyReferenceButtonSizing(button, previousFightsHost);
        setIconButtonContent(button, HELPER_BUTTON_LABEL, START_BUTTON_ICON);

        if (button !== previousFightsHost.nextElementSibling) {
            previousFightsHost.insertAdjacentElement('afterend', button);
        }

        updatePanelVisibility(document.getElementById(ID.panel), button);
        return button;
    }

    async function fetchPageDocument(url) {
        const response = await fetch(url, {
            method: 'GET',
            credentials: 'include'
        });
        const html = await response.text();
        return new DOMParser().parseFromString(html, 'text/html');
    }

    async function fetchPublicActionAndReturn(publicUrl) {
        setPendingReturn(true);

        try {
            const response = await fetch(publicUrl, {
                method: 'GET',
                credentials: 'include'
            });
            if (!response.ok) {
                throw new Error(`Public fight request failed with status ${response.status}`);
            }
            setPendingReturn(false);
            location.href = PUBLIC_BOSS_LIST_URL;
        } catch (error) {
            console.error(error);
            location.href = publicUrl;
        }
    }

    async function submitPublicFormAndReturn(submitter) {
        const form = submitter?.form || submitter?.closest?.('form');
        if (!form) {
            setPendingReturn(true);
            clickElement(submitter);
            return;
        }

        setPendingReturn(true);

        const method = normalizeText(form.getAttribute('method') || 'GET').toUpperCase();
        const actionUrl = absoluteUrl(form.getAttribute('action') || location.href);
        const formData = new FormData(form);
        const submitterName = submitter?.getAttribute?.('name');
        if (submitterName) {
            formData.set(submitterName, submitter.value || '');
        }

        try {
            let response;
            if (method === 'GET') {
                const target = new URL(actionUrl);
                const params = new URLSearchParams(target.search);
                for (const [key, value] of formData.entries()) {
                    if (typeof value === 'string') {
                        params.set(key, value);
                    }
                }
                target.search = params.toString();
                response = await fetch(target.href, {
                    method: 'GET',
                    credentials: 'include'
                });
            } else {
                response = await fetch(actionUrl, {
                    method,
                    body: formData,
                    credentials: 'include'
                });
            }

            if (!response.ok) {
                throw new Error(`Public fight submit failed with status ${response.status}`);
            }

            setPendingReturn(false);
            location.href = PUBLIC_BOSS_LIST_URL;
        } catch (error) {
            console.error(error);
            if (typeof form.requestSubmit === 'function') {
                form.requestSubmit(submitter);
            } else {
                clickElement(submitter);
            }
        }
    }

    async function startPublicFight(bossFightId) {
        const fightUrl = `${ORIGIN}/attack.php?bossFight=${bossFightId}`;
        const returnAfterStart = RUNTIME_STATE.returnAfterStart;

        if (returnAfterStart) {
            setPendingReturn(true);
        } else {
            setPendingReturn(false);
        }

        const doc = await fetchPageDocument(fightUrl);
        const anchors = Array.from(doc.querySelectorAll('a[href]'));
        const publicAnchor = anchors.find((anchor) => {
            const href = anchor.getAttribute('href');
            return href && href.includes('action=public') && href.includes('fight=');
        });

        if (publicAnchor) {
            const publicUrl = absoluteUrl(publicAnchor.getAttribute('href'));
            if (returnAfterStart) {
                await fetchPublicActionAndReturn(publicUrl);
                return;
            }
            location.href = publicUrl;
            return;
        }

        location.href = fightUrl;
    }

    function createButton(bossFightId, sizeReferenceBtn, stateReferenceBtn) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.style.marginLeft = '6px';
        btn.style.setProperty('display', 'inline-flex', 'important');
        btn.style.setProperty('align-items', 'center', 'important');
        btn.style.setProperty('justify-content', 'center', 'important');
        btn.style.setProperty('gap', '4px', 'important');
        btn.style.setProperty('white-space', 'nowrap', 'important');
        btn.style.setProperty('vertical-align', 'middle', 'important');
        applyReferenceButtonSizing(btn, sizeReferenceBtn || stateReferenceBtn);
        setButtonContent(btn, START_BUTTON_LABEL, START_BUTTON_ICON);

        btn.addEventListener('click', async (event) => {
            event.preventDefault();
            if (btn.disabled) return;

            applyButtonDisabledState(btn, true);
            setButtonContent(btn, 'Starting...', STARTING_BUTTON_ICON);
            setStatus('Starting public fight...', false);

            try {
                await startPublicFight(bossFightId);
            } catch (error) {
                console.error(error);
                setPendingReturn(false);
                setStatus('Failed to start public fight', true);
                applyButtonDisabledState(btn, false);
                setButtonContent(btn, START_BUTTON_LABEL, START_BUTTON_ICON);
            }
        });

        if (stateReferenceBtn) {
            syncButtonState(btn, stateReferenceBtn);
        }

        return btn;
    }

    function injectButtons() {
        const bossLinks = document.querySelectorAll('a[href*="bossFight="]');

        bossLinks.forEach((link) => {
            if (link.dataset.publicFightInjected) return;
            link.dataset.publicFightInjected = '1';

            const bossFightId = getBossFightIdFromUrl(link.href);
            if (!bossFightId) return;

            const container = link.closest('div') || link.parentElement;
            const createGroupBtn = findStateReferenceButton(container);
            const sizeReferenceBtn = findReferenceButton(container, link) || createGroupBtn;
            const startBtn = createButton(bossFightId, sizeReferenceBtn, createGroupBtn);
            link.insertAdjacentElement('afterend', startBtn);
        });
    }

    async function autoClickMakePublic() {
        const params = new URLSearchParams(location.search);
        if (!params.has('bossFight')) return;

        const returnAfterStart = hasPendingReturn() || RUNTIME_STATE.returnAfterStart;
        const links = Array.from(document.querySelectorAll('a[href*="action=public"]'));

        for (const link of links) {
            const href = link.getAttribute('href');
            if (!href || !href.includes('fight=')) continue;

            const publicUrl = absoluteUrl(href);
            if (returnAfterStart) {
                await fetchPublicActionAndReturn(publicUrl);
            } else {
                location.href = publicUrl;
            }
            return;
        }

        const buttons = Array.from(document.querySelectorAll('button,input[type="submit"],input[type="button"]'));
        for (const el of buttons) {
            if (!getElementLabel(el).includes('make public')) continue;

            if (returnAfterStart) {
                await submitPublicFormAndReturn(el);
            } else {
                clickElement(el);
            }
            return;
        }
    }

    function shouldObserveBossPage() {
        if (location.pathname === '/boss.php') return true;
        return location.pathname.startsWith('/boss/');
    }

    function observeBossPage() {
        injectButtons();
        buildHelperUi();

        const observer = new MutationObserver(() => {
            injectButtons();
            buildHelperUi();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function maybeRedirectAfterPublicStart() {
        if (!hasPendingReturn()) return false;
        if (isCurrentUrl(PUBLIC_BOSS_LIST_URL)) {
            setPendingReturn(false);
            return false;
        }

        const href = location.href.toLowerCase();
        if (href.includes('action=public') && href.includes('fight=')) {
            setPendingReturn(false);
            location.href = PUBLIC_BOSS_LIST_URL;
            return true;
        }

        return false;
    }

    loadRuntimeState();

    if (maybeRedirectAfterPublicStart()) {
        return;
    }

    if (shouldObserveBossPage()) {
        observeBossPage();
    }

    if (location.pathname.includes('attack.php')) {
        autoClickMakePublic().catch((error) => {
            console.error(error);
            setStatus('Public fight helper hit an error', true);
        });
    }
})();
