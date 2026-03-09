// ==UserScript==
// @name         Mob Wars City - Start Public Fight
// @namespace    mobwarscity
// @author       Asemov/mtxve
// @version      1.0.1
// @description  Adds a faster "Start Public Group" fight button
// @match        https://mobwarscity.com/boss.php*
// @match        https://mobwarscity.com/attack.php*
// @download     https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/PublicBoss.user.js
// @update       https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/PublicBoss.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ORIGIN = 'https://mobwarscity.com';
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

    function absoluteUrl(url) {
        return new URL(url, location.origin).href;
    }

    function getBossFightIdFromUrl(url) {
        try {
            const u = new URL(url, location.origin);
            return u.searchParams.get('bossFight');
        } catch {
            return null;
        }
    }

    async function startPublicFight(bossFightId) {
        const fightUrl = `${ORIGIN}/attack.php?bossFight=${bossFightId}`;

        const response = await fetch(fightUrl, {
            method: 'GET',
            credentials: 'include'
        });

        const html = await response.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');

        const anchors = Array.from(doc.querySelectorAll('a[href]'));
        for (const a of anchors) {
            const href = a.getAttribute('href');
            if (href && href.includes('action=public') && href.includes('fight=')) {
                location.href = absoluteUrl(href);
                return;
            }
        }

        location.href = fightUrl;
    }

    function normalizeText(text) {
        return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
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

    function getReferenceStateElements(referenceBtn) {
        if (!referenceBtn) return [];

        const elements = [referenceBtn];
        const wrapper = referenceBtn.closest(REFERENCE_STATE_SELECTOR);
        if (wrapper && wrapper !== referenceBtn) {
            elements.push(wrapper);
        }

        return elements;
    }

    function isReferenceDisabled(referenceBtn) {
        return getReferenceStateElements(referenceBtn).some((el) => {
            if (!el) return false;
            if ('disabled' in el && el.disabled) return true;
            if (typeof el.matches === 'function' && el.matches(':disabled')) return true;
            if (el.hasAttribute?.('disabled')) return true;
            if (el.getAttribute?.('aria-disabled') === 'true') return true;
            return Array.from(el.classList || []).some(className => STATE_CLASS_NAMES.has(className));
        });
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

    function findReferenceButton(container, ignoredElement) {
        if (!container) return null;

        const candidates = Array.from(container.querySelectorAll(REFERENCE_BUTTON_SELECTOR));
        const usableCandidates = candidates.filter(el => el !== ignoredElement);
        return usableCandidates.find(el => getElementLabel(el).includes('create group'))
            || usableCandidates[0]
            || null;
    }

    function findStateReferenceButton(container) {
        return container?.querySelector('button, a') || null;
    }

    function getReferenceClassName(referenceBtn) {
        if (!referenceBtn?.classList) return '';
        return Array.from(referenceBtn.classList)
            .filter(className => !STATE_CLASS_NAMES.has(className))
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

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (btn.disabled) return;

            btn.disabled = true;
            setButtonContent(btn, 'Starting...', STARTING_BUTTON_ICON);

            try {
                await startPublicFight(bossFightId);
            } catch (err) {
                console.error(err);
                btn.disabled = false;
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

        bossLinks.forEach(link => {

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

    function autoClickMakePublic() {

        const params = new URLSearchParams(location.search);
        if (!params.has('bossFight')) return;

        const links = Array.from(document.querySelectorAll('a[href*="action=public"]'));

        for (const link of links) {
            if (link.href.includes('fight=')) {
                location.href = link.href;
                return;
            }
        }

        const buttons = Array.from(document.querySelectorAll('button,input'));

        for (const el of buttons) {
            const text = (el.textContent || el.value || '').toLowerCase();
            if (text.includes('make public')) {
                el.click();
                return;
            }
        }
    }

    function observeBossPage() {

        injectButtons();

        const observer = new MutationObserver(() => {
            injectButtons();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (location.pathname.includes('boss.php')) {
        observeBossPage();
    }

    if (location.pathname.includes('attack.php')) {
        autoClickMakePublic();
    }

})();
