// ==UserScript==
// @name         스피또 HDMI 오버레이 (판매중 전체 선택형)
// @description  상단 시계 + 선택 카드 수에 따라 화면에 맞게 자동 확대/축소 + 하단 판매중 회차 선택
// @version      2.1
// @match        *://dhlottery.co.kr/st/pblcnDsctn*
// @match        *://*.dhlottery.co.kr/st/pblcnDsctn*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const MAX_PAGES = 8;
  const REFRESH_MINUTES = 240;

  // 처음 자동 선택할 카드 수
  const DEFAULT_VISIBLE_COUNT = 5;

  // 화면에 너무 많이 체크했을 때 최대 표시 개수
  const MAX_VISIBLE_CARDS = 6;

  const STORAGE_KEY = 'spitto_overlay_selected_keys_v2';

  /********* 사용자 조절 변수 *********/
  const STAGE_PADDING = 20;
  const GALLERY_GAP = 30;
  // 2026-11-17 17:44 수정: 고정 카드 배율 대신 화면의 실제 가로/세로 공간에 맞춰 자동 조절합니다.
  const CARD_SCALE_MAX = 1.0;       // 최대 배율 (원본 카드 크기 100%)
  const CARD_FIT_PADDING = 12;      // 표시 영역 가장자리 여유(px)
  // 1~6개일 때 세로 공간 활용 비율. 적은 수의 카드를 상대적으로 더 크게 표시합니다.
  const CARD_HEIGHT_RATIO_BY_COUNT = [1, 1.0, 0.96, 0.92, 0.88, 0.84, 0.80];

  const UI_FONT = "'Noto Sans KR', system-ui, -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif";

  // 카드 박스
  const CARD_RADIUS = 22;
  const CARD_BORDER = 5;
  const CARD_BORDER_COLOR = '#d7d7d7';
  const CARD_BG = '#ffffff';
  const CARD_WD = 650;

  // 카드 상단
  const HDR_FONT = 60;
  const HDR_STATUS_FONT = 30;
  const HDR_ROUND_FONT = 45;
  const STATUS_BG = '#0b8f7a';
  const STATUS_COLOR = '#ffffff';

  // 카드 내용
  const BODY_FONT = 45;
  const BODY_VALUE_FONT = 45;
  const BODY_BASE_FONT = 25;
  const LINE_GAP = 10;

  // 색상
  const LABEL_COLOR = '#555';
  const VALUE_COLOR = '#111';
  const ACCENT_COLOR = '#0b8f7a';
  const BASE_COLOR = '#8a8a8a';

  // 폰트 두께
  const TITLE_WEIGHT = 900;
  const LABEL_WEIGHT = 800;
  const VALUE_WEIGHT = 900;
  const BASE_WEIGHT = 700;

  // 폰트 간격
  const FONT_SHADOW = 2;
  const TITLE_FONT_SPACE = 3;
  const HDR_FONT_SPACE = 3;
  const BODY_FONT_SPACE = 3;
  const VALUE_FONT_SPACE = 5;

  // ===== 시계 설정 =====
  const CLOCK_FONT_SIZE = 38;
  const CLOCK_WEIGHT = 900;
  const CLOCK_COLOR = '#333';
  const CLOCK_TOP_MARGIN = 8;
  const CLOCK_BOTTOM_GAP = 110;

  // ===== 하단 선택바 설정 =====
  const SELECTOR_HEIGHT = 96;
  const SELECTOR_FONT_SIZE = 24;
  const SELECTOR_OPACITY = 0.56;
  const SELECTOR_ACTIVE_OPACITY = 1;

  const SHOW_BADGE = false;
  /**********************************/

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  let allInfos = [];
  let selectedKeys = new Set();
  let galleryLayoutFrame = 0;
  let galleryResizeObserver = null;

  function badge(msg, color = '#0b7') {
    if (!SHOW_BADGE) return;

    let el = document.getElementById('spitto-badge');
    if (!el) {
      el = document.createElement('div');
      el.id = 'spitto-badge';
      el.style.cssText =
        'position:fixed;top:12px;right:12px;z-index:2147483647;' +
        'background:' + color + ';color:#fff;padding:8px 10px;border-radius:8px;' +
        'font:700 13px/1 sans-serif;';
      document.body.appendChild(el);
    }

    el.style.background = color;
    el.textContent = msg;
  }

  function injectCss() {
    if (document.getElementById('spitto-css')) return;

    const style = document.createElement('style');
    style.id = 'spitto-css';

    style.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;600;700;900&display=swap');

      #spittoOverlay {
        position: fixed;
        inset: 0;
        z-index: 2147483000;
        background: #fff;
        overflow: hidden;
        font-family: ${UI_FONT};
      }

      #spittoStage {
        width: 100vw;
        height: 100vh;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: flex-start;
        padding: ${STAGE_PADDING}px;
        box-sizing: border-box;
      }

      #spittoClockWrap {
        width: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        margin-top: ${CLOCK_TOP_MARGIN}px;
        margin-bottom: ${CLOCK_BOTTOM_GAP}px;
        flex: 0 0 auto;
      }

      #spittoClock {
        font-family: ${UI_FONT};
        font-size: ${CLOCK_FONT_SIZE}px;
        font-weight: ${CLOCK_WEIGHT};
        color: ${CLOCK_COLOR};
        line-height: 1.1;
        letter-spacing: 1px;
        text-align: center;
        white-space: nowrap;
      }

      #spittoGalleryWrap {
        width: 100%;
        flex: 1 1 auto;
        min-height: 0;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        overflow: hidden;
      }

      #spittoGallery {
        display: flex;
        gap: ${GALLERY_GAP}px;
        align-items: flex-start;
        justify-content: center;
        flex: 0 0 auto;
        transform-origin: top center;
      }

      .sp-card {
        flex: 0 0 ${CARD_WD}px;
        width: ${CARD_WD}px;
        background: ${CARD_BG};
        border: ${CARD_BORDER}px solid ${CARD_BORDER_COLOR};
        border-radius: ${CARD_RADIUS}px;
        overflow: hidden;
        box-sizing: border-box;
      }

      .sp-hdr {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 18px 18px 12px 18px;
        gap: 14px;
      }

      .sp-title {
        display: flex;
        align-items: center;
        gap: 14px;
        font-weight: ${TITLE_WEIGHT};
        font-size: ${HDR_FONT}px;
        line-height: 1.1;
        color: #111;
        letter-spacing: ${TITLE_FONT_SPACE}px;
        text-shadow:
          ${FONT_SHADOW}px 0 0 currentColor,
          -${FONT_SHADOW}px 0 0 currentColor;
      }

      .sp-status {
        font-size: ${HDR_STATUS_FONT}px;
        font-weight: ${TITLE_WEIGHT};
        padding: 8px 14px;
        border-radius: 999px;
        background: ${STATUS_BG};
        color: ${STATUS_COLOR};
        white-space: nowrap;
      }

      .sp-round {
        font-size: ${HDR_ROUND_FONT}px;
        font-weight: ${TITLE_WEIGHT};
        color: #222;
        padding: 10px 14px;
        border: 2px solid #e5e5e5;
        border-radius: 999px;
        min-width: 64px;
        text-align: center;
        white-space: nowrap;
        letter-spacing: ${HDR_FONT_SPACE}px;
        text-shadow:
          ${FONT_SHADOW}px 0 0 currentColor,
          -${FONT_SHADOW}px 0 0 currentColor;
      }

      .sp-img {
        padding: 0 18px 10px 18px;
      }

      .sp-img img {
        width: 100%;
        height: auto;
        display: block;
        border-radius: 14px;
      }

      .sp-body {
        padding: 8px 18px 18px 18px;
      }

      .sp-row {
        display: flex;
        justify-content: space-between;
        align-items: baseline;
        gap: 12px;
        margin-top: ${LINE_GAP}px;
      }

      .sp-label {
        font-size: ${BODY_FONT}px;
        color: ${LABEL_COLOR};
        font-weight: ${LABEL_WEIGHT};
        letter-spacing: ${BODY_FONT_SPACE}px;
        text-shadow:
          ${FONT_SHADOW}px 0 0 currentColor,
          -${FONT_SHADOW}px 0 0 currentColor;
      }

      .sp-value {
        font-size: ${BODY_VALUE_FONT}px;
        color: ${VALUE_COLOR};
        font-weight: ${VALUE_WEIGHT};
        white-space: nowrap;
        letter-spacing: ${VALUE_FONT_SPACE}px;
        text-shadow:
          ${FONT_SHADOW}px 0 0 currentColor,
          -${FONT_SHADOW}px 0 0 currentColor;
      }

      .sp-value.sp-accent {
        color: ${ACCENT_COLOR};
      }

      .sp-base {
        margin-top: 6px;
        font-size: ${BODY_BASE_FONT}px;
        color: ${BASE_COLOR};
        font-weight: ${BASE_WEIGHT};
        text-align: right;
      }

      #spittoSelectorWrap {
        width: 100%;
        height: ${SELECTOR_HEIGHT}px;
        flex: 0 0 ${SELECTOR_HEIGHT}px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 8px 20px 4px 20px;
        overflow: hidden;
      }

      #spittoSelector {
        max-width: 96vw;
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: 8px 14px;
        font-family: ${UI_FONT};
      }

      .sp-choice {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border-radius: 999px;
        background: #f1f1f1;
        border: 1px solid #ddd;
        color: #333;
        font-size: ${SELECTOR_FONT_SIZE}px;
        font-weight: 800;
        line-height: 1;
        opacity: ${SELECTOR_OPACITY};
        cursor: pointer;
        user-select: none;
        white-space: nowrap;
      }

      .sp-choice.checked {
        opacity: ${SELECTOR_ACTIVE_OPACITY};
        background: #e7f6f2;
        border-color: #0b8f7a;
        color: #0b6f60;
      }

      .sp-choice input {
        width: 20px;
        height: 20px;
        accent-color: #0b8f7a;
      }

      .sp-choice-count {
        font-size: 18px;
        color: #777;
        font-weight: 700;
        margin-left: 8px;
      }

      #spittoEmptyMsg {
        font-size: 54px;
        font-weight: 900;
        color: #999;
        margin-top: 160px;
      }
    `;

    document.head.appendChild(style);
  }

  function ensureOverlay() {
    let overlay = document.getElementById('spittoOverlay');
    if (overlay) return overlay;

    overlay = document.createElement('div');
    overlay.id = 'spittoOverlay';

    const stage = document.createElement('div');
    stage.id = 'spittoStage';

    const clockWrap = document.createElement('div');
    clockWrap.id = 'spittoClockWrap';

    const clock = document.createElement('div');
    clock.id = 'spittoClock';

    clockWrap.appendChild(clock);

    const galleryWrap = document.createElement('div');
    galleryWrap.id = 'spittoGalleryWrap';

    const gallery = document.createElement('div');
    gallery.id = 'spittoGallery';

    galleryWrap.appendChild(gallery);

    const selectorWrap = document.createElement('div');
    selectorWrap.id = 'spittoSelectorWrap';

    const selector = document.createElement('div');
    selector.id = 'spittoSelector';

    selectorWrap.appendChild(selector);

    stage.appendChild(clockWrap);
    stage.appendChild(galleryWrap);
    stage.appendChild(selectorWrap);

    overlay.appendChild(stage);
    document.body.appendChild(overlay);

    return overlay;
  }

function formatClockText(now = new Date()) {
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

  let hours = now.getHours();
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ampm = hours < 12 ? '오전' : '오후';

  let displayHour = hours % 12;
  if (displayHour === 0) displayHour = 12;

  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const weekday = weekdays[now.getDay()];

  return `${ampm} ${displayHour}:${minutes}:${seconds} / ${year}년 ${month}월 ${date}일(${weekday})`;
}

  function updateClock() {
    const clock = document.getElementById('spittoClock');
    if (!clock) return;
    clock.textContent = formatClockText(new Date());
  }

  function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }

  function getSourceGallery() {
    return document.querySelector('#galleryDiv');
  }

  function getCardsFromSource() {
    const g = getSourceGallery();
    if (!g) return [];

    const candidates = [
      ...g.querySelectorAll('a.spt-box'),
      ...g.querySelectorAll(':scope > a'),
      ...g.querySelectorAll('.spt-box'),
    ];

    return Array.from(new Set(candidates)).filter(Boolean);
  }

  function isSelling(card) {
    const st = card.querySelector?.('.spt-status');
    if (st) return st.textContent.trim() === '판매중';
    return (card.textContent || '').includes('판매중');
  }

  function clickPage(num) {
    const el = Array.from(document.querySelectorAll('a, button, span'))
      .find(e => (e.textContent || '').trim() === String(num));

    if (!el) return false;

    (el.closest('a, button') || el).click();
    return true;
  }

  function safeText(el) {
    return (el?.textContent || '').replace(/\s+/g, ' ').trim();
  }

  function extractRound(card, raw) {
    const m1 = raw.match(/제\s*(\d{1,3})\s*회/);
    if (m1) return m1[1];

    const candidates = Array.from(card.querySelectorAll('*'))
      .map(el => (el.textContent || '').trim())
      .filter(t => /^\d{2,3}$/.test(t));

    if (candidates.length) return candidates[0];

    const m3 = raw.match(/(?:^|\s)(\d{2,3})(?=\s|$)/);
    return m3 ? m3[1] : '';
  }

  function pickValueAndBase(raw, label) {
    const idx = raw.indexOf(label);
    if (idx < 0) return null;

    const tail = raw.slice(idx + label.length, idx + label.length + 260).trim();

    const valueMatch = tail.match(/^\s*[:\-]?\s*([0-9,]+(?:억)?원|[0-9,]+%|[0-9,]+매\/[0-9,]+매|[0-9,]+매)/);
    const value = valueMatch ? valueMatch[1] : null;

    const baseMatch = tail.match(/\(\d{2}-\d{2}-\d{2}\s*기준\)/);
    const base = baseMatch ? baseMatch[0] : '';

    if (!value) return null;
    return { value, base };
  }

  function extractInfo(card) {
    const raw = safeText(card);

    const title =
      safeText(card.querySelector('.spt-tit')) ||
      safeText(card.querySelector('.tit')) ||
      (raw.match(/스피또\d+/)?.[0] || '스피또');

    const status =
      safeText(card.querySelector('.spt-status')) ||
      (raw.includes('판매중') ? '판매중' : '판매');

    const round = extractRound(card, raw);
    const img = card.querySelector('img');

    const rows = [];
    const specs = ['1등 당첨금', '판매가격', '판매점 입고율', '1등 잔여수량', '2등 잔여수량'];

    for (const label of specs) {
      const r = pickValueAndBase(raw, label);
      if (r) rows.push({ k: label, v: r.value, base: r.base });
    }

    const key = `${title}-${round}`;
    const label = `${title} ${round}회`;

    return {
      key,
      label,
      title,
      status,
      round,
      imgSrc: img?.src || '',
      rows
    };
  }

  function setValueNode(valEl, valueText) {
    valEl.textContent = '';
    valEl.classList.remove('sp-accent');

    if (/%/.test(valueText)) {
      valEl.textContent = valueText;
      valEl.classList.add('sp-accent');
      return;
    }

    const m = valueText.match(/^([0-9,]+매)\s*\/\s*([0-9,]+매)$/);

    if (m) {
      const left = document.createElement('span');
      left.textContent = m[1];
      left.style.color = ACCENT_COLOR;
      left.style.fontWeight = VALUE_WEIGHT;

      const slash = document.createElement('span');
      slash.textContent = '/';
      slash.style.color = VALUE_COLOR;
      slash.style.fontWeight = VALUE_WEIGHT;

      const right = document.createElement('span');
      right.textContent = m[2];
      right.style.color = VALUE_COLOR;
      right.style.fontWeight = VALUE_WEIGHT;

      valEl.appendChild(left);
      valEl.appendChild(slash);
      valEl.appendChild(right);
      return;
    }

    valEl.textContent = valueText;
  }

  function buildCard(info) {
    const card = document.createElement('div');
    card.className = 'sp-card';

    const hdr = document.createElement('div');
    hdr.className = 'sp-hdr';

    const left = document.createElement('div');
    left.style.display = 'flex';
    left.style.alignItems = 'center';
    left.style.gap = '14px';

    const title = document.createElement('div');
    title.className = 'sp-title';
    title.textContent = info.title;

    const status = document.createElement('div');
    status.className = 'sp-status';
    status.textContent = info.status;

    const round = document.createElement('div');
    round.className = 'sp-round';
    round.textContent = info.round || '—';

    left.appendChild(title);
    left.appendChild(status);

    hdr.appendChild(left);
    hdr.appendChild(round);

    const imgWrap = document.createElement('div');
    imgWrap.className = 'sp-img';

    if (info.imgSrc) {
      const img = document.createElement('img');
      img.src = info.imgSrc;
      img.alt = info.title;
      imgWrap.appendChild(img);
    }

    const body = document.createElement('div');
    body.className = 'sp-body';

    for (const r of info.rows) {
      const row = document.createElement('div');
      row.className = 'sp-row';

      const label = document.createElement('div');
      label.className = 'sp-label';
      label.textContent = r.k;

      const val = document.createElement('div');
      val.className = 'sp-value';
      setValueNode(val, r.v);

      row.appendChild(label);
      row.appendChild(val);
      body.appendChild(row);

      if (r.base) {
        const base = document.createElement('div');
        base.className = 'sp-base';
        base.textContent = r.base;
        body.appendChild(base);
      }
    }

    card.appendChild(hdr);
    card.appendChild(imgWrap);
    card.appendChild(body);

    return card;
  }

  function loadSavedSelection() {
    try {
      const arr = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(arr)) return new Set(arr);
    } catch (e) {
      console.warn('선택값 불러오기 실패:', e);
    }

    return new Set();
  }

  function saveSelection() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(selectedKeys)));
    } catch (e) {
      console.warn('선택값 저장 실패:', e);
    }
  }

  function initializeSelection(infos) {
    const saved = loadSavedSelection();

    const validKeys = new Set(infos.map(info => info.key));
    const restored = Array.from(saved).filter(key => validKeys.has(key));

    if (restored.length > 0) {
      selectedKeys = new Set(restored);
      return;
    }

    selectedKeys = new Set(
      infos.slice(0, DEFAULT_VISIBLE_COUNT).map(info => info.key)
    );

    saveSelection();
  }

  function getSelectedInfos() {
    return allInfos.filter(info => selectedKeys.has(info.key)).slice(0, MAX_VISIBLE_CARDS);
  }

  // 2026-11-17 17:44 추가: 카드 개수/이미지 높이/브라우저 크기를 측정해 화면에 맞게 확대·축소합니다.
  // transform은 레이아웃 원래 크기를 바꾸지 않으므로 offsetWidth/offsetHeight로 측정합니다.
  function fitGalleryToScreen() {
    const wrap = document.getElementById('spittoGalleryWrap');
    const gallery = document.getElementById('spittoGallery');
    if (!wrap || !gallery) return;

    const cardCount = gallery.querySelectorAll(':scope > .sp-card').length;
    if (!cardCount) {
      gallery.style.transform = 'none';
      return;
    }

    const contentWidth = gallery.offsetWidth;
    const contentHeight = gallery.offsetHeight;
    const areaWidth = wrap.clientWidth;
    const areaHeight = wrap.clientHeight;
    if (!contentWidth || !contentHeight || !areaWidth || !areaHeight) return;

    const availableWidth = Math.max(1, areaWidth - CARD_FIT_PADDING * 2);
    const availableHeight = Math.max(1, areaHeight - CARD_FIT_PADDING * 2);
    const widthFit = availableWidth / contentWidth;
    const heightFit = availableHeight / contentHeight;
    const countFactor = CARD_HEIGHT_RATIO_BY_COUNT[Math.min(cardCount, MAX_VISIBLE_CARDS)] || 1;
    const scale = Math.min(CARD_SCALE_MAX, widthFit, heightFit * countFactor);
    if (!Number.isFinite(scale) || scale <= 0) return;

    // 남는 세로 공간에서는 카드 묶음 자체를 가운데로 배치합니다.
    const offsetY = Math.max(0, (areaHeight - contentHeight * scale) / 2);
    gallery.style.transform = `translateY(${offsetY.toFixed(1)}px) scale(${scale.toFixed(4)})`;
  }

  function scheduleGalleryLayout() {
    if (galleryLayoutFrame) cancelAnimationFrame(galleryLayoutFrame);
    galleryLayoutFrame = requestAnimationFrame(() => {
      galleryLayoutFrame = 0;
      fitGalleryToScreen();
    });
  }

  function enableResponsiveGallery() {
    const wrap = document.getElementById('spittoGalleryWrap');
    const gallery = document.getElementById('spittoGallery');
    window.addEventListener('resize', scheduleGalleryLayout, { passive: true });

    if (typeof ResizeObserver !== 'undefined') {
      galleryResizeObserver = new ResizeObserver(scheduleGalleryLayout);
      if (wrap) galleryResizeObserver.observe(wrap);
      if (gallery) galleryResizeObserver.observe(gallery);
    }

    // 웹폰트가 나중에 적용돼도 줄 높이를 다시 측정합니다.
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(scheduleGalleryLayout).catch(() => {});
    }
    scheduleGalleryLayout();
  }

  function renderGallery() {
    const g = document.getElementById('spittoGallery');
    if (!g) return;

    g.innerHTML = '';

    const selectedInfos = getSelectedInfos();

    if (!selectedInfos.length) {
      const msg = document.createElement('div');
      msg.id = 'spittoEmptyMsg';
      msg.textContent = '아래에서 표시할 회차를 선택하세요';
      g.appendChild(msg);
      scheduleGalleryLayout();
      return;
    }

    for (const info of selectedInfos) {
      g.appendChild(buildCard(info));
    }

    // 이미지가 캐시되지 않았거나 아직 디코딩 중일 때도 카드 높이를 다시 측정합니다.
    g.querySelectorAll('img').forEach(img => {
      if (!img.complete) {
        img.addEventListener('load', scheduleGalleryLayout, { once: true });
        img.addEventListener('error', scheduleGalleryLayout, { once: true });
      }
    });
    scheduleGalleryLayout();
  }

  function renderSelector() {
    const selector = document.getElementById('spittoSelector');
    if (!selector) return;

    selector.innerHTML = '';

    for (const info of allInfos) {
      const label = document.createElement('label');
      label.className = 'sp-choice';

      if (selectedKeys.has(info.key)) {
        label.classList.add('checked');
      }

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = selectedKeys.has(info.key);

      input.addEventListener('change', () => {
        if (input.checked) {
          selectedKeys.add(info.key);
        } else {
          selectedKeys.delete(info.key);
        }

        saveSelection();
        renderSelector();
        renderGallery();
      });

      const text = document.createElement('span');
      text.textContent = info.label;

      label.appendChild(input);
      label.appendChild(text);

      selector.appendChild(label);
    }

    const count = document.createElement('span');
    count.className = 'sp-choice-count';
    count.textContent = `선택 ${selectedKeys.size}개 / 표시 최대 ${MAX_VISIBLE_CARDS}개`;

    selector.appendChild(count);
  }

  async function collectSellingCards() {
    const collected = [];
    const seen = new Set();

    function addFromCurrent() {
      for (const c of getCardsFromSource()) {
        if (!isSelling(c)) continue;

        const info = extractInfo(c);
        const key = info.key;

        if (seen.has(key)) continue;

        seen.add(key);
        collected.push(info);
      }
    }

    for (let i = 0; i < 80; i++) {
      if (getSourceGallery()) break;
      badge('원본 갤러리 대기...', '#f59e0b');
      await sleep(200);
    }

    for (let page = 1; page <= MAX_PAGES; page++) {
      for (let i = 0; i < 30; i++) {
        if (getCardsFromSource().length) break;
        await sleep(150);
      }

      addFromCurrent();
      badge(`판매중 수집 ${collected.length}개 (p${page})`, '#0b7');

      if (!clickPage(page + 1)) break;
      await sleep(800);
    }

    return collected;
  }

  async function run() {
    badge('시작...', '#0b7');

    injectCss();
    ensureOverlay();
    enableResponsiveGallery();
    startClock();

    allInfos = await collectSellingCards();

    if (!allInfos.length) {
      badge('판매중 0', '#e11');

      const g = document.getElementById('spittoGallery');
      if (g) {
        g.innerHTML = '';
        const msg = document.createElement('div');
        msg.id = 'spittoEmptyMsg';
        msg.textContent = '판매중인 스피또가 없습니다';
        g.appendChild(msg);
        scheduleGalleryLayout();
      }

      return;
    }

    initializeSelection(allInfos);
    renderSelector();
    renderGallery();

    badge(`완료: 판매중 ${allInfos.length}개`, '#0b7');
  }

  setInterval(() => location.reload(), REFRESH_MINUTES * 60 * 1000);

  run();
})();