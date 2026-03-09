// ==UserScript==
// @name         Mob Wars City - Start Public Fight
// @namespace    mobwarscity
// @author       Asemov/mtxve
// @version      1.0
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

    function syncButtonState(startBtn, createBtn) {

        function update() {
            if (createBtn.disabled || createBtn.classList.contains('disabled')) {
                startBtn.disabled = true;
                startBtn.style.opacity = '0.5';
                startBtn.style.cursor = 'not-allowed';
            } else {
                startBtn.disabled = false;
                startBtn.style.opacity = '1';
                startBtn.style.cursor = 'pointer';
            }
        }

        update();

        const observer = new MutationObserver(update);
        observer.observe(createBtn, {
            attributes: true,
            attributeFilter: ['disabled', 'class']
        });
    }

    function createButton(bossFightId, createGroupBtn) {
        const btn = document.createElement('button');
        btn.textContent = 'Start Public Fight';
        btn.type = 'button';
        btn.style.marginLeft = '6px';
        btn.style.padding = '4px 8px';

        btn.addEventListener('click', async (e) => {
            e.preventDefault();
            if (btn.disabled) return;

            btn.disabled = true;
            btn.textContent = 'Starting...';

            try {
                await startPublicFight(bossFightId);
            } catch (err) {
                console.error(err);
                btn.disabled = false;
                btn.textContent = 'Start Public Fight';
            }
        });

        if (createGroupBtn) {
            syncButtonState(btn, createGroupBtn);
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

            const createGroupBtn = container?.querySelector(
                'button, a'
            );

            const startBtn = createButton(bossFightId, createGroupBtn);

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
