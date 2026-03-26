// ==UserScript==
// @name         Mobwars Crime Helper
// @namespace    mobwarscity
// @author       Asemov/mtxe
// @version      1.6.2
// @description  QOL Helper to lessen necessary actions.
// @download     https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/MobwarsCrime.js
// @update       https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/MobwarsCrime.js
// @match        https://mobwarscity.com/crime.php
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const SELECTORS = {
    nerveBar: '.progress_hold[data-tippy-content*="Nerve"]',
    staminaBar: '.progress_hold[data-tippy-content*="Stamina"]',
    commitButton: '',
    crimeButtons:
      '.crimeGrid .crime-action .crime-commit-btn, .crimeGrid .crime-action input[type="submit"], .crimeGrid .split .splitHeading .current.button button, .crimeGrid .split .splitHeading .current.button input[type="submit"]'
  };

  const DEFAULTS = {
    crimeIndex: 1,
    nerveSlot: 1,
    staminaSlot: 2,
    nerveThreshold: 0,
    staminaThreshold: 70,
    commitText: 'Commit'
  };

  const SLOTS = [1, 2, 3, 4, 5];
  const CRIMES = [1, 2];
  const STORE = {
    crimeIndex: 'mw_quick_crime_index',
    nerveSlot: 'mw_quick_crime_slot_nerve',
    staminaSlot: 'mw_quick_crime_slot_stamina',
    thresholdNerve: 'mw_quick_crime_nerve_threshold',
    thresholdStamina: 'mw_quick_crime_stamina_threshold',
    panelHidden: 'mw_quick_crime_panel_hidden',
    panelLeft: 'mw_quick_crime_panel_left',
    panelTop: 'mw_quick_crime_panel_top'
  };

  const PRESENCE = {
    minClicks: 100,
    maxClicks: 500,
    minDistance: 140,
    countKey: 'mw_quick_crime_presence_count',
    targetKey: 'mw_quick_crime_presence_target',
    overlayId: 'mw-qc-presence-overlay'
  };
  const CHEEKY_MISSED_CONTINUE_THRESHOLD = 100;
  const CHEEKY_TARGET_USER_ID = '2';
  const CHEEKY_MESSAGE = 'I am doing something silly';
  const PRESENCE_CHECK_ENABLED = false;
  const POST_CLICK_DEADLOCK_SCAN_ENABLED = false;
  const CLICK_LOCK = {
    windowMs: 500,
    key: 'mw_quick_crime_click_lock_until'
  };

  const ID = {
    panel: 'mw-qc-panel',
    style: 'mw-qc-style',
    toolbar: 'mw-qc-toolbar',
    toggleButton: 'mw-qc-toggle-button',
    crimeIndex: 'mw-qc-crime-index',
    nerveSlot: 'mw-qc-nerve-slot',
    staminaSlot: 'mw-qc-stamina-slot',
    thresholdNerve: 'mw-qc-threshold-nerve',
    thresholdStamina: 'mw-qc-threshold-stamina',
    button: 'mw-qc-button',
    status: 'mw-qc-status'
  };
  const BLOCKED_FEEDBACK = {
    windowMs: 150
  };
  const RUNTIME_STATE = {
    initialized: false,
    crimeIndex: DEFAULTS.crimeIndex,
    nerveSlot: DEFAULTS.nerveSlot,
    staminaSlot: DEFAULTS.staminaSlot,
    nerveThreshold: DEFAULTS.nerveThreshold,
    staminaThreshold: DEFAULTS.staminaThreshold,
    panelHidden: false,
    blockedUntil: 0
  };

  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  let presencePromptActive = false;
  let missedPresenceClicks = 0;
  let cheekyReportSent = false;
  let cheekyReportInFlight = false;
  let clickLockUntilMemory = 0;
  let buttonUnlockTimer = 0;
  let runInFlight = false;
  let buttonRef = null;
  let statusRef = null;

  function normalize(text) {
    return String(text || '').replace(/\s+/g, ' ').trim().toLowerCase();
  }

  function parseIntSafe(value) {
    const n = parseInt(value, 10);
    return Number.isInteger(n) ? n : null;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function isDigitCode(code) {
    return code >= 48 && code <= 57;
  }

  function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function toFiniteNumber(value) {
    return Number.isFinite(value) ? value : null;
  }

  function canonicalSlot(value, fallback) {
    const slot = parseIntSafe(value);
    return SLOTS.includes(slot) ? slot : fallback;
  }

  function canonicalThreshold(value, fallback) {
    const n = parseIntSafe(value);
    if (n === null) return fallback;
    return clamp(n, 0, 100);
  }

  function canonicalCrimeIndex(value, fallback) {
    const n = parseIntSafe(value);
    return CRIMES.includes(n) ? n : fallback;
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

  function loadRuntimeState() {
    if (RUNTIME_STATE.initialized) return;
    RUNTIME_STATE.crimeIndex = getStored(STORE.crimeIndex, DEFAULTS.crimeIndex, (v) =>
      canonicalCrimeIndex(v, DEFAULTS.crimeIndex)
    );
    RUNTIME_STATE.nerveSlot = getStored(STORE.nerveSlot, DEFAULTS.nerveSlot, (v) =>
      canonicalSlot(v, DEFAULTS.nerveSlot)
    );
    RUNTIME_STATE.staminaSlot = getStored(STORE.staminaSlot, DEFAULTS.staminaSlot, (v) =>
      canonicalSlot(v, DEFAULTS.staminaSlot)
    );
    RUNTIME_STATE.nerveThreshold = getStored(
      STORE.thresholdNerve,
      DEFAULTS.nerveThreshold,
      (v) => canonicalThreshold(v, DEFAULTS.nerveThreshold)
    );
    RUNTIME_STATE.staminaThreshold = getStored(
      STORE.thresholdStamina,
      DEFAULTS.staminaThreshold,
      (v) => canonicalThreshold(v, DEFAULTS.staminaThreshold)
    );
    RUNTIME_STATE.panelHidden = getStored(STORE.panelHidden, 0, (value) => value === '1');
    RUNTIME_STATE.initialized = true;
  }

  function setClickLockUntil(value) {
    clickLockUntilMemory = value;
    setStored(CLICK_LOCK.key, value);
  }

  function getClickLockUntil() {
    if (clickLockUntilMemory > 0) return clickLockUntilMemory;
    return getStored(CLICK_LOCK.key, 0, (value) => {
      const n = parseIntSafe(value);
      clickLockUntilMemory = n !== null && n > 0 ? n : 0;
      return clickLockUntilMemory;
    });
  }

  function getClickLockRemainingMs(now = Date.now()) {
    const lockUntil = getClickLockUntil();
    return lockUntil > now ? lockUntil - now : 0;
  }

  function tryAcquireClickLock() {
    const now = Date.now();
    const remainingMs = getClickLockRemainingMs(now);
    if (remainingMs > 0) return remainingMs;
    setClickLockUntil(now + CLICK_LOCK.windowMs);
    return 0;
  }

  function getCrimeButtons(doc) {
    const scopedRoot = doc.querySelector('#crimeForm') || doc.querySelector('.crimeGrid') || doc;
    return Array.from(scopedRoot.querySelectorAll(SELECTORS.crimeButtons)).filter(isVisible);
  }

  function getResourceBarElement(doc, type) {
    return doc.querySelector(type === 'nerve' ? SELECTORS.nerveBar : SELECTORS.staminaBar);
  }

  function getSlotButton(doc, slot) {
    return doc.querySelector(`button.quickbar-slot[data-slot="${slot}"]`);
  }

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function sanitizeCrimeName(text, crimeIndex) {
    let label = compactText(text);
    if (!label) return '';

    label = label
      .replace(new RegExp(`\\bCrime\\s*${crimeIndex}\\b\\s*[:|-]?\\s*`, 'gi'), '')
      .replace(/\bCommit\b/gi, '')
      .replace(/\bQuick\s*C[12]\b/gi, '')
      .replace(/\bHelper\s*Settings\b/gi, '')
      .replace(/\bCrime\s*Helper\b/gi, '')
      .replace(/\bNerve\b/gi, '')
      .replace(/\bStamina\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .replace(/^[\s:|\-]+|[\s:|\-]+$/g, '')
      .trim();

    const normalized = normalize(label);
    if (
      !normalized ||
      normalized === String(crimeIndex) ||
      normalized === 'crime' ||
      normalized === 'commit' ||
      label.length > 80 ||
      !/[A-Za-z]/.test(label) ||
      /(?:\$|\/|\b\d[\d,.]*\b|%)/.test(label) ||
      /\b(?:cost|current|chance|success|reward|heat|required|available|nerve|stamina|slot|threshold)\b/i.test(label)
    ) {
      return '';
    }

    return label;
  }

  function pushCrimeNameCandidate(list, text, crimeIndex) {
    const label = sanitizeCrimeName(text, crimeIndex);
    if (!label) return;
    if (list.some((entry) => normalize(entry) === normalize(label))) return;
    list.push(label);
  }

  function parseCrimeNameFromButton(button) {
    const onclick = button?.getAttribute('onclick') || '';
    if (!onclick) return '';
    const match =
      onclick.match(/#crimeName['"]?\)\.value\s*=\s*'([^']+)'/i) ||
      onclick.match(/crimeName[^;]*?\.value\s*=\s*'([^']+)'/i);
    if (!match || !match[1]) return '';
    return match[1].replace(/\\'/g, "'").replace(/\\\\/g, '\\');
  }

  function getOwnText(node) {
    if (!node) return '';
    let text = '';
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text += `${child.textContent || ''} `;
      }
    }
    return compactText(text);
  }

  function getCrimeHeadingText(splitHeading) {
    if (!splitHeading) return '';
    const clone = splitHeading.cloneNode(true);
    clone
      .querySelectorAll(
        '.current, [class*="current"], .button, button, input, select, textarea, .mw-qc-action, .mw-qc-row, .mw-qc-label'
      )
      .forEach((node) => node.remove());
    return compactText(clone.textContent);
  }

  function getCrimeNameCandidates(button, crimeIndex) {
    if (!button) return [];

    const candidates = [];
    const splitHeading = button.closest('.splitHeading');
    const split = button.closest('.split');
    const titleNode = splitHeading?.querySelector('.title') || split?.querySelector('.splitHeading .title');

    pushCrimeNameCandidate(candidates, parseCrimeNameFromButton(button), crimeIndex);
    pushCrimeNameCandidate(candidates, getOwnText(titleNode), crimeIndex);
    pushCrimeNameCandidate(candidates, getCrimeHeadingText(splitHeading), crimeIndex);

    const roots = [split, splitHeading].filter(Boolean);
    const candidateSelectors = [
      '[data-crime-name]',
      '[class*="crimeName"]',
      '[class*="crime-name"]',
      '.splitHeading .title',
      '.splitTitle',
      '.splitHeadingTitle',
      '[class*="splitTitle"]'
    ];

    const seenRoots = new Set();
    for (const root of roots) {
      if (!root || seenRoots.has(root)) continue;
      seenRoots.add(root);

      for (const selector of candidateSelectors) {
        for (const node of root.querySelectorAll(selector)) {
          if (!isVisible(node)) continue;
          pushCrimeNameCandidate(candidates, getOwnText(node), crimeIndex);
          pushCrimeNameCandidate(candidates, node.textContent, crimeIndex);
        }
      }
    }

    return candidates;
  }

  function getCrimeDisplayLabel(doc, crimeIndex) {
    const targetIndex = canonicalCrimeIndex(crimeIndex, DEFAULTS.crimeIndex);
    const button = getCrimeButtons(doc)[targetIndex - 1] || null;
    const name = getCrimeNameCandidates(button, targetIndex)[0] || '';
    return name ? `${targetIndex} - ${name}` : String(targetIndex);
  }

  function refreshCrimeOptions(selectEl) {
    if (!selectEl) return;
    const gameDoc = getGameDocument();
    for (const crime of CRIMES) {
      const option = selectEl.querySelector(`option[value="${crime}"]`);
      if (!option) continue;
      option.textContent = getCrimeDisplayLabel(gameDoc, crime);
    }
  }

  function showBlockedStatus(message) {
    const now = Date.now();
    if (now < RUNTIME_STATE.blockedUntil) return;
    RUNTIME_STATE.blockedUntil = now + BLOCKED_FEEDBACK.windowMs;
    setStatus(message, true);
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

  function setPanelHidden(hidden) {
    RUNTIME_STATE.panelHidden = Boolean(hidden);
    setStored(STORE.panelHidden, hidden ? 1 : 0);
  }

  function restorePanelPosition(el) {
    if (!el) return false;
    const left = getStored(STORE.panelLeft, null, (value) => parseIntSafe(value));
    const top = getStored(STORE.panelTop, null, (value) => parseIntSafe(value));
    if (left === null || top === null) return false;
    applyPanelPosition(el, left, top);
    return true;
  }

  function randomPresenceTarget() {
    return randomInt(PRESENCE.minClicks, PRESENCE.maxClicks);
  }

  function getPresenceCount() {
    return getStored(PRESENCE.countKey, 0, (value) => {
      const n = parseIntSafe(value);
      return n !== null && n >= 0 ? n : 0;
    });
  }

  function getPresenceTarget() {
    const fallback = randomPresenceTarget();
    return getStored(PRESENCE.targetKey, fallback, (value) => {
      const n = parseIntSafe(value);
      if (n === null) return fallback;
      return clamp(n, PRESENCE.minClicks, PRESENCE.maxClicks);
    });
  }

  function initPresenceState() {
    if (!PRESENCE_CHECK_ENABLED) return;
    const count = getPresenceCount();
    const target = getPresenceTarget();
    setStored(PRESENCE.countKey, count);
    setStored(PRESENCE.targetKey, target);
  }

  function removePresenceOverlay() {
    const existing = document.getElementById(PRESENCE.overlayId);
    if (existing) existing.remove();
  }

  function pickPresenceButtonPosition(buttonWidth, buttonHeight, sourceX, sourceY, avoidX, avoidY) {
    const margin = 20;
    const maxX = Math.max(margin, Math.floor(window.innerWidth - buttonWidth - margin));
    const maxY = Math.max(margin, Math.floor(window.innerHeight - buttonHeight - margin));

    const originX = toFiniteNumber(sourceX);
    const originY = toFiniteNumber(sourceY);
    const cursorX = toFiniteNumber(avoidX);
    const cursorY = toFiniteNumber(avoidY);
    const minCursorDistance = Math.max(PRESENCE.minDistance + 40, 180);
    let fallback = null;
    let fallbackScore = -1;

    for (let i = 0; i < 48; i += 1) {
      const x = randomInt(margin, maxX);
      const y = randomInt(margin, maxY);
      const centerX = x + buttonWidth / 2;
      const centerY = y + buttonHeight / 2;
      const sourceDistance =
        originX === null || originY === null
          ? Infinity
          : Math.hypot(centerX - originX, centerY - originY);
      const cursorDistance =
        cursorX === null || cursorY === null
          ? Infinity
          : Math.hypot(centerX - cursorX, centerY - cursorY);

      const farFromSource = sourceDistance >= PRESENCE.minDistance;
      const farFromCursor = cursorDistance >= minCursorDistance;
      if (farFromSource && farFromCursor) {
        return { x, y };
      }

      const score = Math.min(sourceDistance, cursorDistance);
      if (score > fallbackScore) {
        fallbackScore = score;
        fallback = { x, y };
      }
    }

    return fallback || { x: randomInt(margin, maxX), y: randomInt(margin, maxY) };
  }

  function maybeTriggerCheekyReport() {
    if (
      missedPresenceClicks < CHEEKY_MISSED_CONTINUE_THRESHOLD ||
      cheekyReportSent ||
      cheekyReportInFlight
    ) {
      return;
    }
    cheekyReportInFlight = true;
    void runCheekyChatSequence()
      .then((sent) => {
        if (sent) cheekyReportSent = true;
      })
      .finally(() => {
        cheekyReportInFlight = false;
      });
  }

  function requestPresenceConfirmation(sourceX, sourceY) {
    return new Promise((resolve) => {
      removePresenceOverlay();

      const overlay = document.createElement('div');
      overlay.id = PRESENCE.overlayId;
      overlay.style.position = 'fixed';
      overlay.style.inset = '0';
      overlay.style.zIndex = '2147483647';
      overlay.style.background = 'rgba(0, 0, 0, 0.18)';

      const prompt = document.createElement('div');
      prompt.textContent = 'Presence check: click Continue';
      prompt.style.position = 'fixed';
      prompt.style.left = '50%';
      prompt.style.top = '42%';
      prompt.style.transform = 'translate(-50%, -50%)';
      prompt.style.padding = '10px 12px';
      prompt.style.background = '#f2f2f2';
      prompt.style.border = '1px solid #666';
      prompt.style.borderRadius = '4px';
      prompt.style.font = '700 13px Verdana, Arial, sans-serif';
      prompt.style.color = '#111';

      const confirm = document.createElement('button');
      confirm.type = 'button';
      confirm.textContent = 'Continue';
      confirm.style.position = 'fixed';
      confirm.style.width = '124px';
      confirm.style.height = '40px';
      confirm.style.font = '700 13px Verdana, Arial, sans-serif';
      confirm.style.cursor = 'pointer';
      confirm.style.zIndex = '2147483647';

      const placeButton = (avoidX, avoidY) => {
        const pos = pickPresenceButtonPosition(124, 40, sourceX, sourceY, avoidX, avoidY);
        confirm.style.left = `${pos.x}px`;
        confirm.style.top = `${pos.y}px`;
      };

      const cleanup = (result) => {
        window.removeEventListener('resize', placeButton, true);
        overlay.remove();
        resolve(result);
      };

      window.addEventListener('resize', placeButton, true);
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) {
          missedPresenceClicks += 1;
          maybeTriggerCheekyReport();
          placeButton(event.clientX, event.clientY);
        }
      });
      confirm.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        cleanup(true);
      });

      overlay.appendChild(prompt);
      overlay.appendChild(confirm);
      document.body.appendChild(overlay);
      placeButton(sourceX, sourceY);
      confirm.focus();
    });
  }

  async function maybeRequirePresence(event) {
    if (!PRESENCE_CHECK_ENABLED) return true;
    if (presencePromptActive) {
      missedPresenceClicks += 1;
      maybeTriggerCheekyReport();
      return false;
    }

    const count = getPresenceCount() + 1;
    const target = getPresenceTarget();
    setStored(PRESENCE.countKey, count);

    if (count < target) return true;

    presencePromptActive = true;
    setStatus(`Presence check ${count}/${target}`, false);
    try {
      const confirmed = await requestPresenceConfirmation(event?.clientX, event?.clientY);
      if (!confirmed) {
        missedPresenceClicks += 1;
        maybeTriggerCheekyReport();
        return false;
      }
      const nextTarget = randomPresenceTarget();
      setStored(PRESENCE.countKey, 0);
      setStored(PRESENCE.targetKey, nextTarget);
      missedPresenceClicks = 0;
      cheekyReportSent = false;
      cheekyReportInFlight = false;
      setStatus(`Confirmed. Next check in ${nextTarget} clicks`, false);
      return true;
    } finally {
      presencePromptActive = false;
    }
  }

  function getChatHostWindow() {
    try {
      if (
        window.top &&
        window.top.location &&
        window.top.location.origin === window.location.origin
      ) {
        return window.top;
      }
    } catch (_) {}
    return window;
  }

  async function waitForElement(doc, selector, timeoutMs = 6000, intervalMs = 120) {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      const node = doc.querySelector(selector);
      if (node) return node;
      await wait(intervalMs);
    }
    return null;
  }

  async function requestJson(url, params, method) {
    try {
      const upper = String(method || 'GET').toUpperCase();
      if (upper === 'GET') {
        const qs = new URLSearchParams(params).toString();
        const response = await fetch(`${url}?${qs}`, {
          method: 'GET',
          credentials: 'include'
        });
        const text = await response.text();
        return JSON.parse(text);
      }
      const body = new URLSearchParams(params).toString();
      const response = await fetch(url, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
        },
        body
      });
      const text = await response.text();
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
  }

  async function openDeveloperDmAndSend(hostWindow) {
    const endpoint = 'https://mobwarscity.com/pusher_chat.php';
    const $ = hostWindow.jQuery || hostWindow.$;
    let dmData = await requestJson(
      endpoint,
      { action: 'openDMChat', targetUserID: CHEEKY_TARGET_USER_ID },
      'GET'
    );

    if ((!dmData || dmData.status === 'error') && $) {
      dmData = await new Promise((resolve) => {
        try {
          $.get(
            endpoint,
            { action: 'openDMChat', targetUserID: CHEEKY_TARGET_USER_ID },
            (data) => resolve(data || null)
          ).fail(() => resolve(null));
        } catch (_) {
          resolve(null);
        }
      });
    }

    if (!dmData || dmData.status === 'error' || !dmData.channel || !dmData.channelID) return false;

    if (typeof hostWindow.openChat === 'function') {
      try {
        hostWindow.openChat(
          dmData.channel,
          dmData.channelID,
          dmData.channelName || `Mobster [${CHEEKY_TARGET_USER_ID}]`,
          false
        );
      } catch (_) {}
    }

    await wait(250);

    let sendData = await requestJson(
      endpoint,
      {
        message: CHEEKY_MESSAGE,
        channel: dmData.channel,
        channelID: dmData.channelID
      },
      'POST'
    );

    if ((!sendData || sendData.status === 'error') && $) {
      sendData = await new Promise((resolve) => {
        try {
          $.post(
            endpoint,
            {
              message: CHEEKY_MESSAGE,
              channel: dmData.channel,
              channelID: dmData.channelID
            },
            (data) => resolve(data || null)
          ).fail(() => resolve(null));
        } catch (_) {
          resolve(null);
        }
      });
    }

    return Boolean(sendData && sendData.status !== 'error');
  }

  async function runCheekyChatSequence() {
    try {
      const hostWindow = getChatHostWindow();
      const hostDocument = hostWindow.document;
      if (!hostDocument) return false;

      const chatWindow = hostDocument.querySelector('.chatWindowBg');
      if (chatWindow && !chatWindow.classList.contains('open')) {
        if (typeof hostWindow.toggleWindow === 'function') {
          hostWindow.toggleWindow();
        } else {
          const openAnchor = hostDocument.querySelector('.overlayIcon.open-chat a');
          if (openAnchor) openAnchor.click();
        }
      }

      await wait(200);

      const sentByApi = await openDeveloperDmAndSend(hostWindow);
      if (sentByApi) {
        setStatus('Self-report sent to developer', false);
        return true;
      }

      if (typeof hostWindow.createChat === 'function') {
        hostWindow.createChat();
      } else {
        const openButton = hostDocument.querySelector('.chatTabs a.openButton[onclick*="createChat"]');
        if (openButton) openButton.click();
      }

      const targetInput = await waitForElement(hostDocument, '.jconfirm.jconfirm-open #chatUserID', 5000);
      if (!targetInput) return false;
      targetInput.value = CHEEKY_TARGET_USER_ID;
      targetInput.dispatchEvent(new Event('input', { bubbles: true }));
      targetInput.dispatchEvent(new Event('change', { bubbles: true }));

      const submit = hostDocument.querySelector('.jconfirm.jconfirm-open .jconfirm-buttons .btn.btn-blue');
      if (!submit) return false;
      submit.click();

      const activeDirectTab = await waitForElement(
        hostDocument,
        '.chatTabs .openButton.active[data-channel*="presence-chat-direct-"]',
        7000
      );
      if (!activeDirectTab) return false;

      const channel = activeDirectTab.getAttribute('data-channel');
      if (!channel) return false;
      const messageInput = await waitForElement(
        hostDocument,
        `#${channel}ChatForm input[name="msg"]`,
        7000
      );
      if (!messageInput) return false;

      messageInput.value = CHEEKY_MESSAGE;
      messageInput.dispatchEvent(new Event('input', { bubbles: true }));
      messageInput.dispatchEvent(new Event('change', { bubbles: true }));

      const form = messageInput.closest('form');
      if (form && typeof form.requestSubmit === 'function') {
        form.requestSubmit();
      } else if (form) {
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      }
      setStatus('Self-report sent to developer', false);
      return true;
    } catch (_) {
      return false;
    }
  }

  function getSelectedSlot(kind) {
    loadRuntimeState();
    return kind === 'nerve' ? RUNTIME_STATE.nerveSlot : RUNTIME_STATE.staminaSlot;
  }

  function getSelectedCrimeIndex() {
    loadRuntimeState();
    return RUNTIME_STATE.crimeIndex;
  }

  function getThreshold(kind) {
    loadRuntimeState();
    return kind === 'nerve' ? RUNTIME_STATE.nerveThreshold : RUNTIME_STATE.staminaThreshold;
  }

  function getGameDocument() {
    const frame = document.querySelector('#game');
    if (frame && frame.contentDocument && frame.contentDocument.body) {
      return frame.contentDocument;
    }
    return document;
  }

  function isVisible(el) {
    return Boolean(
      el &&
      el.isConnected &&
      !el.hidden &&
      el.getAttribute('aria-hidden') !== 'true' &&
      !el.disabled &&
      (el.offsetParent !== null || el.getClientRects().length > 0)
    );
  }

  function clickElement(el) {
    if (!el) return false;
    if (typeof el.click === 'function') {
      el.click();
      return true;
    }
    const view = el.ownerDocument.defaultView || window;
    const MouseEvt = view.MouseEvent || MouseEvent;
    el.dispatchEvent(new MouseEvt('click', { bubbles: true, cancelable: true }));
    return true;
  }

  function getGameLocationHref(doc) {
    try {
      return doc?.defaultView?.location?.href || location.href;
    } catch (_) {
      return location.href;
    }
  }

  function absoluteGameUrl(doc, url) {
    return new URL(url || getGameLocationHref(doc), getGameLocationHref(doc)).href;
  }

  function updateCrimeActionAvailability(doc, stats) {
    const currentNerve = parseIntSafe(stats?.nerve?.current);
    if (currentNerve === null) return;

    for (const wrapper of doc.querySelectorAll('.crime-action')) {
      const cost = parseIntSafe(wrapper.getAttribute('data-nerve-cost'));
      const button = wrapper.querySelector('.crime-commit-btn');
      const disabled = wrapper.querySelector('.crime-commit-disabled');
      if (!button || !disabled || cost === null) continue;
      button.style.display = currentNerve >= cost ? '' : 'none';
      disabled.style.display = currentNerve >= cost ? 'none' : '';
    }
  }

  function updateProgressBar(doc, selector, label, stats) {
    const bar = doc.querySelector(selector);
    if (!bar || !stats) return;

    const current = parseIntSafe(stats.current);
    const max = parseIntSafe(stats.max);
    if (current === null || max === null || max <= 0) return;

    const percent =
      toFiniteNumber(Number(stats.barPerc)) ?? Math.round((current / max) * 100);
    bar.style.setProperty('--progress', String(percent));
    bar.setAttribute('data-tippy-content', `<b>${label}</b><br/>${stats.formatted || `${current} / ${max}`}`);

    const value = bar.querySelector('.progress_value');
    if (value) value.textContent = stats.simple || `${current}/${max}`;

    const fill = bar.querySelector('.progress_box-img');
    if (fill) {
      const isFull = typeof stats.isFull === 'boolean' ? stats.isFull : current >= max;
      fill.classList.toggle('_full', isFull);
    }
  }

  function applyUpdatedStats(doc, stats) {
    if (!stats) return;
    const view = doc?.defaultView || window;

    if (typeof view.updateStatBars === 'function') {
      view.updateStatBars(stats);
    } else {
      updateProgressBar(doc, SELECTORS.staminaBar, 'Stamina', stats.awake);
      updateProgressBar(doc, SELECTORS.nerveBar, 'Nerve', stats.nerve);

      const CustomEvt = view.CustomEvent || CustomEvent;
      doc.dispatchEvent(new CustomEvt('statsUpdated', { detail: stats }));
    }

    updateCrimeActionAvailability(doc, stats);
  }

  function readQuickbarSlots(doc) {
    const view = doc?.defaultView || window;
    try {
      const parsed = JSON.parse(view.localStorage.getItem('quickbar_slots') || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }

  function writeQuickbarSlots(doc, slots) {
    const view = doc?.defaultView || window;
    try {
      view.localStorage.setItem('quickbar_slots', JSON.stringify(slots || {}));
    } catch (_) {}
  }

  function updateQuickbarSlotDom(doc, slot, item) {
    const slotButton = getSlotButton(doc, slot);
    if (!slotButton) return;

    const empty = slotButton.querySelector('.quickbar-slot-empty');
    const itemWrap = slotButton.querySelector('.quickbar-slot-item');
    const image = slotButton.querySelector('.quickbar-item-img');
    const quantity = slotButton.querySelector('.quickbar-item-qty');

    if (empty) empty.style.display = 'none';
    if (itemWrap) itemWrap.style.display = '';
    if (image) {
      if (item.image) image.setAttribute('src', item.image);
      image.setAttribute('alt', item.name || '');
    }
    if (quantity) quantity.textContent = String(item.quantity ?? 0);

    slotButton.setAttribute('data-item-id', String(item.id));
    if (item.name) {
      slotButton.setAttribute('data-tippy-content', item.name);
    }
  }

  function clearQuickbarSlotDom(doc, slot) {
    const slotButton = getSlotButton(doc, slot);
    if (!slotButton) return;

    const empty = slotButton.querySelector('.quickbar-slot-empty');
    const itemWrap = slotButton.querySelector('.quickbar-slot-item');
    const quantity = slotButton.querySelector('.quickbar-item-qty');

    if (empty) empty.style.display = '';
    if (itemWrap) itemWrap.style.display = 'none';
    if (quantity) quantity.textContent = '0';

    slotButton.removeAttribute('data-item-id');
    slotButton.removeAttribute('data-tippy-content');
  }

  function syncQuickbarQuantity(doc, slot, itemId, nextQuantity, slotButton) {
    if (typeof nextQuantity === 'undefined') return;

    const view = doc?.defaultView || window;
    const normalizedSlot = String(slot);
    const normalizedQuantity = Number(nextQuantity);
    const existingButton = slotButton || getSlotButton(doc, slot);
    const slots = readQuickbarSlots(doc);
    const stored = slots[slot] || slots[normalizedSlot] || {};

    if (normalizedQuantity > 0) {
      const nextItem = {
        ...stored,
        id: itemId,
        name:
          stored.name ||
          existingButton?.getAttribute('data-tippy-content') ||
          existingButton?.querySelector('.quickbar-item-img')?.getAttribute('alt') ||
          '',
        image:
          stored.image ||
          existingButton?.querySelector('.quickbar-item-img')?.getAttribute('src') ||
          '',
        quantity: normalizedQuantity
      };

      if (typeof view.updateQuickbarSlot === 'function') {
        view.updateQuickbarSlot(slot, nextItem);
      } else {
        updateQuickbarSlotDom(doc, slot, nextItem);
      }

      slots[slot] = nextItem;
      slots[normalizedSlot] = nextItem;
    } else {
      if (typeof view.clearQuickbarSlotByNumber === 'function') {
        view.clearQuickbarSlotByNumber(slot);
      } else {
        clearQuickbarSlotDom(doc, slot);
      }

      delete slots[slot];
      delete slots[normalizedSlot];
    }

    writeQuickbarSlots(doc, slots);
  }

  function renderCrimeResult(doc, response) {
    const area = doc.querySelector('#crimeResultArea');
    if (!area || !response) return;

    const success = response.success === true;
    const title = success ? 'Success!' : 'Failed!';
    const message = success
      ? response.message || 'Crime successful.'
      : response.error || response.message || 'Crime failed.';
    const icon = success ? 'check-circle' : 'exclamation-triangle';
    const className = success ? 'successMessage' : 'errorMessage';

    area.innerHTML =
      `<div class="message ${className}">` +
      `<i class="fas fa-${icon}"></i>` +
      '<div class="errorMessageText">' +
      `<span class="messageTitle">${title}</span><br />` +
      `${message}` +
      '</div>' +
      '</div>';

    try {
      area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (_) {}
  }

  async function postJson(doc, path, payload, label) {
    const response = await fetch(absoluteGameUrl(doc, path), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: new URLSearchParams(payload).toString()
    });

    let data = null;
    try {
      data = await response.json();
    } catch (_) {}

    if (!response.ok) {
      throw new Error(`${label} failed (${response.status})`);
    }
    if (!data || typeof data !== 'object') {
      throw new Error(`${label} returned invalid data`);
    }

    return data;
  }

  function parseResourceBar(doc, type) {
    const bar = getResourceBarElement(doc, type);
    if (!bar) return null;

    const parseFractionText = (text) => {
      const source = String(text || '');
      const slashIndex = source.indexOf('/');
      if (slashIndex === -1) return null;

      let leftEnd = slashIndex - 1;
      while (leftEnd >= 0 && !isDigitCode(source.charCodeAt(leftEnd))) {
        leftEnd -= 1;
      }
      if (leftEnd < 0) return null;

      let leftStart = leftEnd;
      while (leftStart >= 0 && isDigitCode(source.charCodeAt(leftStart))) {
        leftStart -= 1;
      }

      let rightStart = slashIndex + 1;
      while (rightStart < source.length && !isDigitCode(source.charCodeAt(rightStart))) {
        rightStart += 1;
      }
      if (rightStart >= source.length) return null;

      let rightEnd = rightStart;
      while (rightEnd < source.length && isDigitCode(source.charCodeAt(rightEnd))) {
        rightEnd += 1;
      }

      const current = parseIntSafe(source.slice(leftStart + 1, leftEnd + 1));
      const max = parseIntSafe(source.slice(rightStart, rightEnd));
      if (current === null || max === null) return null;
      return { current, max };
    };

    const parsed =
      parseFractionText(bar.querySelector('.progress_value')?.textContent) ||
      parseFractionText(bar.getAttribute('data-tippy-content'));
    if (!parsed) return null;

    const { current, max } = parsed;
    if (current === null || max === null || max <= 0) return null;

    return {
      current,
      max,
      percent: (current / max) * 100
    };
  }

  function isSlotEmpty(slotBtn) {
    if (!slotBtn) return true;
    const itemId = slotBtn.getAttribute('data-item-id');
    if (!itemId || itemId === '0') return true;
    const emptyIcon = slotBtn.querySelector('.quickbar-slot-empty');
    if (emptyIcon && isVisible(emptyIcon)) return true;
    return false;
  }

  async function useSlot(doc, kind, slot) {
    const btn = getSlotButton(doc, slot);
    if (!btn) throw new Error(`${kind}: slot ${slot} not found`);
    if (isSlotEmpty(btn)) throw new Error(`${kind}: slot ${slot} is empty`);
    const itemId = btn.getAttribute('data-item-id');
    if (!itemId) throw new Error(`${kind}: slot ${slot} has no item id`);

    const response = await postJson(
      doc,
      'quickbarAjax.php',
      {
        action: 'useItem',
        itemId
      },
      `${kind}: quick slot request`
    );

    if (!response.success) {
      throw new Error(response.error || `${kind}: failed to use slot ${slot}`);
    }

    applyUpdatedStats(doc, response.stats);
    syncQuickbarQuantity(doc, slot, itemId, response.newQuantity, btn);
  }

  function getButtonText(el) {
    if (!el) return '';
    if (el instanceof HTMLInputElement) return el.value || '';
    return el.textContent || '';
  }

  function findSubmitInContainer(container) {
    if (!container) return null;
    const submit = container.querySelector(
      'input[type="submit"], button[type="submit"], button, .button, [role="button"]'
    );
    if (submit && isVisible(submit)) return submit;
    return null;
  }

  function findCrimeAction(doc, crimeIndex) {
    const targetIndex = canonicalCrimeIndex(crimeIndex, DEFAULTS.crimeIndex);

    if (SELECTORS.commitButton) {
      const forced = doc.querySelector(SELECTORS.commitButton);
      if (forced && isVisible(forced)) return forced;
    }

    const orderedButtons = getCrimeButtons(doc);
    if (orderedButtons.length > 0) {
      const picked = orderedButtons[targetIndex - 1] || orderedButtons[0];
      if (picked && isVisible(picked)) return picked;
    }

    return null;
  }

  async function submitCrimeAction(doc, action) {
    const crimeId = action?.getAttribute('data-crime-id') || action?.dataset?.crimeId;
    const crimeName =
      action?.getAttribute('data-crime-name') ||
      action?.dataset?.crimeName ||
      parseCrimeNameFromButton(action) ||
      '';

    if (!crimeId) {
      throw new Error('Crime id not found');
    }

    const response = await postJson(
      doc,
      'crimeAjax.php',
      {
        action: 'startCrime',
        crimeId,
        crimeName
      },
      'Crime request'
    );

    applyUpdatedStats(doc, response.stats);
    renderCrimeResult(doc, response);

    if (!response.success) {
      if (response.jailed) {
        window.setTimeout(() => {
          try {
            (doc?.defaultView || window).location.href = absoluteGameUrl(doc, 'jail.php');
          } catch (_) {
            window.location.href = absoluteGameUrl(doc, 'jail.php');
          }
        }, 2000);
      }

      throw new Error(response.error || response.message || 'Crime failed.');
    }

    return response;
  }

  function setBusy(busy) {
    const btn = buttonRef || document.getElementById(ID.button);
    if (!btn) return;
    buttonRef = btn;
    const nextText = busy ? '...' : 'Crime';
    if (btn.disabled !== busy) btn.disabled = busy;
    if (btn.textContent !== nextText) btn.textContent = nextText;
  }

  function temporarilyDisableButton(ms) {
    const btn = buttonRef || document.getElementById(ID.button);
    const delayMs = Math.max(0, Math.ceil(ms || 0));
    if (!btn || delayMs <= 0) return;
    buttonRef = btn;
    btn.disabled = true;
    if (buttonUnlockTimer) {
      window.clearTimeout(buttonUnlockTimer);
    }
    buttonUnlockTimer = window.setTimeout(() => {
      buttonUnlockTimer = 0;
      if (runInFlight) return;
      btn.disabled = false;
    }, delayMs);
  }

  function setStatus(message, isError) {
    const el = statusRef || document.getElementById(ID.status);
    if (!el) return;
    statusRef = el;
    const color = isError ? '#8b0000' : '#111';
    if (el.textContent !== message) el.textContent = message;
    if (el.dataset.mwColor !== color) {
      el.dataset.mwColor = color;
      el.style.setProperty('color', color, 'important');
    }
  }

  function hasDeadlockError(doc) {
    if (!doc) return false;
    const candidates = doc.querySelectorAll(
      '.error, .errors, .alert, .notification, .message, #error, #errors, .jconfirm-content'
    );
    for (const node of candidates) {
      const text = normalize(node.textContent || '');
      if (
        text.includes('an error occurred while using the item') &&
        text.includes('deadlock found when trying to get lock')
      ) {
        return true;
      }
    }
    return false;
  }

  async function run() {
    let shouldRefresh = false;
    setBusy(true);

    try {
      const doc = getGameDocument();
      const crimeIndex = getSelectedCrimeIndex();
      const nerveSlot = getSelectedSlot('nerve');
      const staminaSlot = getSelectedSlot('stamina');
      const nerveThreshold = getThreshold('nerve');
      const staminaThreshold = getThreshold('stamina');

      const nerve = parseResourceBar(doc, 'nerve');
      const stamina = parseResourceBar(doc, 'stamina');

      if (nerve && nerve.percent <= nerveThreshold) {
        await useSlot(doc, 'nerve', nerveSlot);
      }

      const staminaAfterNerve = parseResourceBar(doc, 'stamina') || stamina;
      if (staminaAfterNerve && staminaAfterNerve.percent <= staminaThreshold) {
        await useSlot(doc, 'stamina', staminaSlot);
      }

      const action = findCrimeAction(doc, crimeIndex);
      if (!action) throw new Error(`crime ${crimeIndex} button not found`);
      await submitCrimeAction(doc, action);
      setStatus(`Committed crime ${crimeIndex}`, false);
      return shouldRefresh;
    } catch (err) {
      const message = err.message || 'Quick crime failed';
      setStatus(message, true);
      if (/deadlock found when trying to get lock/i.test(message)) shouldRefresh = true;
    } finally {
      setBusy(false);
    }

    return shouldRefresh;
  }

  function refreshPage() {
    const doc = getGameDocument();
    try {
      (doc?.defaultView || window).location.reload();
    } catch (_) {
      window.location.reload();
    }
  }

  function makeDraggable(panel) {
    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const onMove = (event) => {
      if (!dragging) return;
      applyPanelPosition(panel, event.clientX - offsetX, event.clientY - offsetY);
    };

    const stop = () => {
      if (!dragging) return;
      dragging = false;
      window.removeEventListener('mousemove', onMove, true);
      window.removeEventListener('mouseup', stop, true);
      savePanelPosition(panel);
    };

    panel.addEventListener('mousedown', (event) => {
      if (event.button !== 0) return;
      if (event.target.closest('button, select, input, label, textarea, option')) return;

      const rect = panel.getBoundingClientRect();
      applyPanelPosition(panel, rect.left, rect.top);

      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      dragging = true;
      event.preventDefault();

      window.addEventListener('mousemove', onMove, true);
      window.addEventListener('mouseup', stop, true);
    });
  }

  function compactControl(el) {
    el.classList.add('mw-qc-control', 'form-control');
    el.style.setProperty('width', '100%', 'important');
    el.style.setProperty('box-sizing', 'border-box', 'important');
  }

  function createRow(labelText, control) {
    const row = document.createElement('div');
    row.className = 'mw-qc-row form-group';

    const label = document.createElement('label');
    label.className = 'mw-qc-label';
    label.textContent = labelText;
    if (control.id) label.htmlFor = control.id;

    row.appendChild(label);
    row.appendChild(control);
    return row;
  }

  function ensureUiStyle() {
    if (document.getElementById(ID.style)) return;
    const style = document.createElement('style');
    style.id = ID.style;
    style.textContent = `
      #${ID.panel} {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 2147483647;
        width: 270px;
        cursor: move;
      }
      #${ID.toolbar} {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 6px;
        margin: 0 0 8px 0;
      }
      #${ID.panel} .inner-body_menu-box {
        overflow: hidden;
        box-shadow: 0 14px 28px rgba(20, 26, 38, 0.18);
      }
      #${ID.panel} .mw-qc-content {
        position: relative;
        z-index: 1;
        padding: 14px 14px 16px;
      }
      #${ID.panel} .inner-body_title {
        margin-bottom: 10px;
      }
      #${ID.panel} .mw-qc-row {
        margin: 0 0 10px;
      }
      #${ID.panel} .mw-qc-label {
        display: block;
        margin: 0 0 4px;
        font-size: 11px;
        font-weight: 700;
      }
      #${ID.panel} .mw-qc-control {
        width: 100%;
        min-height: 34px;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 12px;
        line-height: 1.2;
      }
      #${ID.panel} .mw-qc-action {
        display: block;
        width: 100%;
        margin-top: 8px;
        padding: 8px 10px;
        text-align: center;
        font-weight: 700;
        cursor: pointer;
      }
      #${ID.panel} #${ID.status} {
        min-height: 16px;
        margin-top: 8px;
        font-size: 11px;
        font-weight: 600;
      }
    `;
    document.head.appendChild(style);
  }

  function createGameStyledButton(reference, label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    if (reference && reference.className) {
      button.className = reference.className;
    }
    if (!button.className) {
      button.className = 'button';
    }
    button.style.setProperty('margin-left', '0', 'important');
    button.style.setProperty('padding', '0 6px', 'important');
    button.style.setProperty('height', '24px', 'important');
    button.style.setProperty('line-height', '22px', 'important');
    button.style.setProperty('font-size', '11px', 'important');
    button.style.setProperty('white-space', 'nowrap', 'important');
    button.style.setProperty('cursor', 'pointer', 'important');
    return button;
  }

  function ensureToolbar(gameDoc) {
    let toolbar = gameDoc.getElementById(ID.toolbar);
    if (toolbar) return toolbar;

    toolbar = gameDoc.createElement('div');
    toolbar.id = ID.toolbar;

    const crimeGrid = gameDoc.querySelector('.crimeGrid');
    if (crimeGrid && crimeGrid.parentElement) {
      crimeGrid.parentElement.insertBefore(toolbar, crimeGrid);
      return toolbar;
    }

    const fallbackHost = gameDoc.querySelector('#crimeForm, form[action*="crime.php" i], .content, .main') || gameDoc.body;
    fallbackHost.insertBefore(toolbar, fallbackHost.firstChild || null);
    return toolbar;
  }

  function applyPanelVisibility(panel, toggleButton) {
    if (panel) {
      panel.style.display = RUNTIME_STATE.panelHidden ? 'none' : '';
    }
    if (toggleButton) {
      toggleButton.textContent = RUNTIME_STATE.panelHidden ? 'Show Helper' : 'Hide Helper';
    }
  }

  function ensureToggleButton(panel) {
    const gameDoc = getGameDocument();
    const toolbar = ensureToolbar(gameDoc);
    let button = gameDoc.getElementById(ID.toggleButton);
    if (button && button.parentElement !== toolbar) {
      button.remove();
      button = null;
    }
    if (!button) {
      const reference = getCrimeButtons(gameDoc)[0] || null;
      button = createGameStyledButton(reference, 'Hide Helper');
      button.id = ID.toggleButton;
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setPanelHidden(!RUNTIME_STATE.panelHidden);
        applyPanelVisibility(panel, button);
      });
      toolbar.appendChild(button);
    }
    applyPanelVisibility(panel, button);
    return button;
  }

  function buildUI() {
    loadRuntimeState();
    initPresenceState();
    if (document.getElementById(ID.panel)) return;
    ensureUiStyle();

    const panel = document.createElement('div');
    panel.id = ID.panel;
    panel.className = 'inner-body_menu-box_wrap visible-desktop';

    const box = document.createElement('div');
    box.className = 'inner-body_menu-box';

    const content = document.createElement('div');
    content.className = 'mw-qc-content';

    const title = document.createElement('h3');
    title.className = 'inner-body_title';
    title.textContent = 'Crime Helper';

    const bgTop = document.createElement('div');
    bgTop.className = 'inner-body_bg-top';
    bgTop.innerHTML =
      '<img class="bg-stretch" src="img/img-05-top.png" alt="background decor" srcset="img/img-05-top@2x.png 2x">';

    const bgBottom = document.createElement('div');
    bgBottom.className = 'inner-body_bg-bottom';
    bgBottom.innerHTML =
      '<img class="bg-stretch" src="img/img-05-bottom.png" alt="background decor" srcset="img/img-05-bottom@2x.png 2x">';

    const crimeIndex = document.createElement('select');
    crimeIndex.id = ID.crimeIndex;
    compactControl(crimeIndex);
    for (const crime of CRIMES) {
      const opt = document.createElement('option');
      opt.value = String(crime);
      opt.textContent = String(crime);
      crimeIndex.appendChild(opt);
    }
    refreshCrimeOptions(crimeIndex);
    crimeIndex.value = String(RUNTIME_STATE.crimeIndex);

    const nerveSlot = document.createElement('select');
    nerveSlot.id = ID.nerveSlot;
    compactControl(nerveSlot);
    for (const slot of SLOTS) {
      const opt = document.createElement('option');
      opt.value = String(slot);
      opt.textContent = String(slot);
      nerveSlot.appendChild(opt);
    }
    nerveSlot.value = String(RUNTIME_STATE.nerveSlot);

    const staminaSlot = document.createElement('select');
    staminaSlot.id = ID.staminaSlot;
    compactControl(staminaSlot);
    for (const slot of SLOTS) {
      const opt = document.createElement('option');
      opt.value = String(slot);
      opt.textContent = String(slot);
      staminaSlot.appendChild(opt);
    }
    staminaSlot.value = String(RUNTIME_STATE.staminaSlot);

    const thresholdNerve = document.createElement('input');
    thresholdNerve.id = ID.thresholdNerve;
    thresholdNerve.type = 'number';
    thresholdNerve.min = '0';
    thresholdNerve.max = '100';
    thresholdNerve.step = '1';
    thresholdNerve.value = String(RUNTIME_STATE.nerveThreshold);
    compactControl(thresholdNerve);

    const thresholdStamina = document.createElement('input');
    thresholdStamina.id = ID.thresholdStamina;
    thresholdStamina.type = 'number';
    thresholdStamina.min = '0';
    thresholdStamina.max = '100';
    thresholdStamina.step = '1';
    thresholdStamina.value = String(RUNTIME_STATE.staminaThreshold);
    compactControl(thresholdStamina);

    const button = document.createElement('button');
    button.id = ID.button;
    button.type = 'button';
    button.textContent = 'Crime';
    button.className = 'button btn btn-blue mw-qc-action';

    const status = document.createElement('div');
    status.id = ID.status;
    status.textContent = 'Ready';

    crimeIndex.addEventListener('change', () => {
      const value = canonicalCrimeIndex(crimeIndex.value, DEFAULTS.crimeIndex);
      crimeIndex.value = String(value);
      RUNTIME_STATE.crimeIndex = value;
      setStored(STORE.crimeIndex, value);
      setStatus(`C ${value}`, false);
    });

    nerveSlot.addEventListener('change', () => {
      const value = canonicalSlot(nerveSlot.value, DEFAULTS.nerveSlot);
      nerveSlot.value = String(value);
      RUNTIME_STATE.nerveSlot = value;
      setStored(STORE.nerveSlot, value);
      setStatus(`N ${value}`, false);
    });

    staminaSlot.addEventListener('change', () => {
      const value = canonicalSlot(staminaSlot.value, DEFAULTS.staminaSlot);
      staminaSlot.value = String(value);
      RUNTIME_STATE.staminaSlot = value;
      setStored(STORE.staminaSlot, value);
      setStatus(`S ${value}`, false);
    });

    thresholdNerve.addEventListener('change', () => {
      const value = canonicalThreshold(thresholdNerve.value, DEFAULTS.nerveThreshold);
      thresholdNerve.value = String(value);
      RUNTIME_STATE.nerveThreshold = value;
      setStored(STORE.thresholdNerve, value);
      setStatus(`N% ${value}`, false);
    });

    thresholdStamina.addEventListener('change', () => {
      const value = canonicalThreshold(thresholdStamina.value, DEFAULTS.staminaThreshold);
      thresholdStamina.value = String(value);
      RUNTIME_STATE.staminaThreshold = value;
      setStored(STORE.thresholdStamina, value);
      setStatus(`S% ${value}`, false);
    });

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (runInFlight) {
        showBlockedStatus('Action already in progress');
        return;
      }

      const remainingMs = tryAcquireClickLock();
      if (remainingMs > 0) {
        temporarilyDisableButton(remainingMs);
        showBlockedStatus(`Please wait ${Math.ceil(remainingMs)}ms`);
        return;
      }

      const allowed = await maybeRequirePresence(event);
      if (!allowed) return;

      runInFlight = true;
      try {
        const shouldRefresh = await run();
        if (shouldRefresh) refreshPage();
      } finally {
        runInFlight = false;
      }
    });

    content.appendChild(title);
    content.appendChild(createRow('Crime', crimeIndex));
    content.appendChild(createRow('Nerve Quick Slot', nerveSlot));
    content.appendChild(createRow('Stamina Quick Slot', staminaSlot));
    content.appendChild(createRow('Nerve Threshold', thresholdNerve));
    content.appendChild(createRow('Stamina Threshold', thresholdStamina));
    content.appendChild(button);
    content.appendChild(status);
    box.appendChild(content);
    box.appendChild(bgTop);
    box.appendChild(bgBottom);
    panel.appendChild(box);
    document.body.appendChild(panel);
    buttonRef = button;
    statusRef = status;
    restorePanelPosition(panel);
    window.setTimeout(() => refreshCrimeOptions(crimeIndex), 250);
    const toggleButton = ensureToggleButton(panel);
    applyPanelVisibility(panel, toggleButton);

    makeDraggable(panel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildUI, { once: true });
  } else {
    buildUI();
  }
})();
