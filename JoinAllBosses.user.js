// ==UserScript==
// @name         Join All Mob Wars City Bosses
// @namespace    mobwarscity
// @author       Asemov/mtxe
// @version      1.0.1
// @description  Adds a "<Join All>" link next to the Boss Fights tab.
// @download     https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/JoinAllBosses.js
// @update       https://raw.githubusercontent.com/mtxve/Mob-Wars-City-QOL-Scripts/refs/heads/main/JoinAllBosses.js
// @match        https://mobwarscity.com/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const JOIN_ALL_URL = 'https://mobwarscity.com/boss/action/requestJoinAll/viewPublic/1';
  const LEGACY_MARKER_ATTR = 'data-mw-join-all-link';
  const INLINE_MARKER_ATTR = 'data-mw-join-all-inline';
  const BOSS_LINK_SELECTORS = [
    'li[data-link="boss.php"] > a',
    '.mobile-menu_item[data-slug="boss_fights"] > a'
  ].join(', ');
  const OBSERVE_TIMEOUT_MS = 2000;

  function redirectToJoinAll(event) {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(JOIN_ALL_URL);
  }

  function removeLegacyJoinAllLinks(root) {
    const scope = root || document;
    const legacyLinks = scope.querySelectorAll(`a[${LEGACY_MARKER_ATTR}="1"]`);
    for (const legacyLink of legacyLinks) {
      legacyLink.remove();
    }
    const inlineNodes = scope.querySelectorAll(`[${INLINE_MARKER_ATTR}="1"]`);
    for (const inlineNode of inlineNodes) {
      inlineNode.remove();
    }
  }

  function ensureJoinAllLink(anchor) {
    if (!anchor) return;
    const host = anchor.parentElement || anchor;
    if (host.querySelector(`a[${INLINE_MARKER_ATTR}="1"]`)) return;

    removeLegacyJoinAllLinks(host);

    const joinAll = document.createElement('a');
    joinAll.textContent = '<Join All>';
    joinAll.setAttribute(INLINE_MARKER_ATTR, '1');
    joinAll.href = JOIN_ALL_URL;
    joinAll.style.position = 'absolute';
    joinAll.style.right = '8px';
    joinAll.style.top = '50%';
    joinAll.style.transform = 'translateY(-50%)';
    joinAll.style.zIndex = '2';
    joinAll.style.textDecoration = 'underline';
    joinAll.style.whiteSpace = 'nowrap';
    joinAll.style.cursor = 'pointer';
    joinAll.addEventListener('click', redirectToJoinAll);

    host.style.position = 'relative';
    anchor.style.paddingRight = '88px';
    host.appendChild(joinAll);
  }

  function getBossLinks(root) {
    const scope = root || document;
    return Array.from(scope.querySelectorAll(BOSS_LINK_SELECTORS));
  }

  function patchAll(root) {
    const links = getBossLinks(root);
    let patched = false;
    for (const link of links) {
      ensureJoinAllLink(link);
      patched = true;
    }
    return patched;
  }

  function observeMenuBriefly() {
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          removeLegacyJoinAllLinks(node);
          if (node.matches(BOSS_LINK_SELECTORS)) {
            ensureJoinAllLink(node);
            observer.disconnect();
            return;
          }
          if (patchAll(node)) {
            observer.disconnect();
            return;
          }
        }
      }
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    window.setTimeout(() => observer.disconnect(), OBSERVE_TIMEOUT_MS);
  }

  removeLegacyJoinAllLinks(document);
  if (!patchAll(document)) {
    observeMenuBriefly();
  }
})();
