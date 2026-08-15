// ==UserScript==
// @name         Tampermonkey 스피또 사이니지
// @description  동행복권 스피또 판매중 정보를 수집해 HDMI 사이니지 화면으로 표시
// @version      1.0.0
// @match        *://dhlottery.co.kr/st/pblcnDsctn*
// @match        *://*.dhlottery.co.kr/st/pblcnDsctn*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  // ============================================================
  // 기본 실행 설정
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 판매중 스피또 카드 최대 5개 표시
  // - 여러 페이지에서 판매중 카드 수집
  // - 240분마다 원본 페이지 새로고침
  // ============================================================
  const MAX = 5;
  const MAX_PAGES = 8;
  const REFRESH_MINUTES = 240;

  // ============================================================
  // 전체 화면 및 카드 배치 설정
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 카드의 전체 크기와 간격을 현장 화면에 맞게 조절하는 영역
  // ============================================================
  const STAGE_PADDING = 24;
  const GALLERY_GAP = 34;
  const CARD_SCALE = 0.55;

  const UI_FONT =
    "'Noto Sans KR', system-ui, -apple-system, BlinkMacSystemFont, 'Malgun Gothic', sans-serif";

  // ============================================================
  // 카드 박스 설정
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  const CARD_RADIUS = 22;
  const CARD_BORDER = 5;
  const CARD_BORDER_COLOR = '#d7d7d7';
  const CARD_BG = '#ffffff';
  const CARD_WD = 650;

  // ============================================================
  // 카드 상단 글자 설정
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  const HDR_FONT = 60;
  const HDR_STATUS_FONT = 30;
  const HDR_ROUND_FONT = 45;

  const STATUS_BG = '#0b8f7a';
  const STATUS_COLOR = '#ffffff';

  // ============================================================
  // 카드 하단 정보 글자 설정
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  const BODY_FONT = 45;
  const BODY_VALUE_FONT = 45;
  const BODY_BASE_FONT = 25;
  const LINE_GAP = 10;

  // ============================================================
  // 카드 정보 색상 설정
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  const LABEL_COLOR = '#555';
  const VALUE_COLOR = '#111';
  const ACCENT_COLOR = '#0b8f7a';
  const BASE_COLOR = '#8a8a8a';

  // ============================================================
  // 폰트 두께 설정
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  const TITLE_WEIGHT = 900;
  const LABEL_WEIGHT = 800;
  const VALUE_WEIGHT = 900;
  const BASE_WEIGHT = 700;

  // ============================================================
  // 폰트 간격 및 가독성 보정
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - FONT_SHADOW를 높이면 글자가 더 두껍게 보임
  // - shadow를 키울 경우 letter-spacing도 함께 늘리는 것이 좋음
  // ============================================================
  const FONT_SHADOW = 2;
  const TITLE_FONT_SPACE = 3;
  const HDR_FONT_SPACE = 3;
  const BODY_FONT_SPACE = 3;
  const VALUE_FONT_SPACE = 5;

  // ============================================================
  // 상단 현재시각 설정
  // 수정일시: 2026-08-15 11:18
  // 표시 예:
  // 오후 6:28:37 / 2026년 4월 18일(토)
  // ============================================================
  const CLOCK_FONT_SIZE = 90;
  const CLOCK_WEIGHT = 900;
  const CLOCK_COLOR = '#222';

  const CLOCK_TOP_MARGIN = 10;
  const CLOCK_BOTTOM_GAP = 70;

  // 카드 영역을 추가로 아래로 내릴 때 조절
  const CARDS_PUSH_DOWN = 40;

  // 디버깅 상태표시
  const SHOW_BADGE = false;

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // ============================================================
  // 디버깅 상태 배지
  // 수정일시: 2026-08-15 11:18
  // ============================================================
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

  // ============================================================
  // 사이니지 CSS 생성
  // 수정일시: 2026-08-15 11:18
  // ============================================================
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
        display: flex;
        justify-content: center;
        align-items: flex-start;
        margin-top: ${CARDS_PUSH_DOWN}px;
        flex: 0 0 auto;
      }

      #spittoGallery {
        display: flex;
        gap: ${GALLERY_GAP}px;
        align-items: flex-start;
        justify-content: center;
        transform: scale(${CARD_SCALE});
        transform-origin: top center;
      }

      .sp-card {
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
    `;

    document.head.appendChild(style);
  }

  // ============================================================
  // 사이니지 오버레이 생성
  // 수정일시: 2026-08-15 11:18
  // ============================================================
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

    stage.appendChild(clockWrap);
    stage.appendChild(galleryWrap);

    overlay.appendChild(stage);
    document.body.appendChild(overlay);

    return overlay;
  }

  // ============================================================
  // 현재시각 문자열 생성
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 오전/오후 12시간제
  // - 시:분:초
  // - YYYY년 M월 D일(요일)
  // ============================================================
  function formatClockText(now = new Date()) {
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];

    let hours = now.getHours();

    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');

    const ampm = hours < 12 ? '오전' : '오후';

    let displayHour = hours % 12;

    if (displayHour === 0) {
      displayHour = 12;
    }

    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const weekday = weekdays[now.getDay()];

    return `${ampm} ${displayHour}:${minutes}:${seconds} / ${year}년 ${month}월 ${date}일(${weekday})`;
  }

  // ============================================================
  // 시계 갱신
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  function updateClock() {
    const clock = document.getElementById('spittoClock');

    if (!clock) return;

    clock.textContent = formatClockText(new Date());
  }

  // ============================================================
  // 시계 실행
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 1초마다 갱신하여 초 단위까지 표시
  // ============================================================
  function startClock() {
    updateClock();
    setInterval(updateClock, 1000);
  }

  function getSourceGallery() {
    return document.querySelector('#galleryDiv');
  }

  function getCardsFromSource() {
    const gallery = getSourceGallery();

    if (!gallery) {
      return [];
    }

    const candidates = [
      ...gallery.querySelectorAll('a.spt-box'),
      ...gallery.querySelectorAll(':scope > a'),
      ...gallery.querySelectorAll('.spt-box'),
    ];

    return Array.from(new Set(candidates)).filter(Boolean);
  }

  function isSelling(card) {
    const status = card.querySelector?.('.spt-status');

    if (status) {
      return status.textContent.trim() === '판매중';
    }

    return (card.textContent || '').includes('판매중');
  }

  function clickPage(num) {
    const el = Array.from(
      document.querySelectorAll('a, button, span')
    ).find(e => (e.textContent || '').trim() === String(num));

    if (!el) {
      return false;
    }

    (el.closest('a, button') || el).click();

    return true;
  }

  function safeText(el) {
    return (el?.textContent || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // ============================================================
  // 회차번호 추출
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  function extractRound(card, raw) {
    const roundPattern = raw.match(/제\s*(\d{1,3})\s*회/);

    if (roundPattern) {
      return roundPattern[1];
    }

    const candidates = Array.from(card.querySelectorAll('*'))
      .map(el => (el.textContent || '').trim())
      .filter(text => /^\d{2,3}$/.test(text));

    if (candidates.length) {
      return candidates[0];
    }

    const fallback = raw.match(/(?:^|\s)(\d{2,3})(?=\s|$)/);

    return fallback ? fallback[1] : '';
  }

  // ============================================================
  // 항목별 값 및 기준일 추출
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 기준일은 각 항목에 가장 가까운 1개만 사용
  // ============================================================
  function pickValueAndBase(raw, label) {
    const idx = raw.indexOf(label);

    if (idx < 0) {
      return null;
    }

    const tail = raw
      .slice(idx + label.length, idx + label.length + 260)
      .trim();

    const valueMatch = tail.match(
      /^\s*[:\-]?\s*([0-9,]+(?:억)?원|[0-9,]+%|[0-9,]+매\/[0-9,]+매|[0-9,]+매)/
    );

    const value = valueMatch ? valueMatch[1] : null;

    const baseMatch = tail.match(
      /\(\d{2}-\d{2}-\d{2}\s*기준\)/
    );

    const base = baseMatch ? baseMatch[0] : '';

    if (!value) {
      return null;
    }

    return {
      value,
      base,
    };
  }

  // ============================================================
  // 원본 카드 정보 추출
  // 수정일시: 2026-08-15 11:18
  // ============================================================
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

    const specs = [
      '1등 당첨금',
      '판매가격',
      '판매점 입고율',
      '1등 잔여수량',
      '2등 잔여수량',
    ];

    for (const label of specs) {
      const row = pickValueAndBase(raw, label);

      if (row) {
        rows.push({
          k: label,
          v: row.value,
          base: row.base,
        });
      }
    }

    return {
      title,
      status,
      round,
      imgSrc: img?.src || '',
      rows,
    };
  }

  // ============================================================
  // 카드 값 색상 및 잔여수량 표현
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 판매점 입고율은 전체 청록색
  // - 잔여수량은 분자만 청록색
  // - 분모 및 / 기호는 검정색
  // ============================================================
  function setValueNode(valEl, valueText) {
    valEl.textContent = '';
    valEl.classList.remove('sp-accent');

    if (/%/.test(valueText)) {
      valEl.textContent = valueText;
      valEl.classList.add('sp-accent');
      return;
    }

    const remainingMatch = valueText.match(
      /^([0-9,]+매)\s*\/\s*([0-9,]+매)$/
    );

    if (remainingMatch) {
      const left = document.createElement('span');
      left.textContent = remainingMatch[1];
      left.style.color = ACCENT_COLOR;
      left.style.fontWeight = VALUE_WEIGHT;

      const slash = document.createElement('span');
      slash.textContent = '/';
      slash.style.color = VALUE_COLOR;
      slash.style.fontWeight = VALUE_WEIGHT;

      const right = document.createElement('span');
      right.textContent = remainingMatch[2];
      right.style.color = VALUE_COLOR;
      right.style.fontWeight = VALUE_WEIGHT;

      valEl.appendChild(left);
      valEl.appendChild(slash);
      valEl.appendChild(right);

      return;
    }

    valEl.textContent = valueText;
  }

  // ============================================================
  // 사이니지 카드 생성
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  function buildCard(info) {
    const card = document.createElement('div');
    card.className = 'sp-card';

    const header = document.createElement('div');
    header.className = 'sp-hdr';

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

    header.appendChild(left);
    header.appendChild(round);

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

    for (const rowInfo of info.rows) {
      const row = document.createElement('div');
      row.className = 'sp-row';

      const label = document.createElement('div');
      label.className = 'sp-label';
      label.textContent = rowInfo.k;

      const value = document.createElement('div');
      value.className = 'sp-value';

      setValueNode(value, rowInfo.v);

      row.appendChild(label);
      row.appendChild(value);

      body.appendChild(row);

      if (rowInfo.base) {
        const base = document.createElement('div');
        base.className = 'sp-base';
        base.textContent = rowInfo.base;

        body.appendChild(base);
      }
    }

    card.appendChild(header);
    card.appendChild(imgWrap);
    card.appendChild(body);

    return card;
  }

  // ============================================================
  // 판매중 카드 수집
  // 수정일시: 2026-08-15 11:18
  // 설명:
  // - 현재 페이지에서 판매중 카드 수집
  // - 부족할 경우 다음 페이지로 이동
  // - 최대 MAX개까지 수집
  // ============================================================
  async function collectSellingCards() {
    const collected = [];
    const seen = new Set();

    function addFromCurrent() {
      for (const card of getCardsFromSource()) {
        if (!isSelling(card)) {
          continue;
        }

        const key =
          card.getAttribute?.('data-number') ||
          card.href ||
          (safeText(card) || '').slice(0, 80);

        if (seen.has(key)) {
          continue;
        }

        seen.add(key);
        collected.push(card);

        if (collected.length >= MAX) {
          break;
        }
      }
    }

    for (let i = 0; i < 80; i++) {
      if (getSourceGallery()) {
        break;
      }

      badge('원본 갤러리 대기...', '#f59e0b');

      await sleep(200);
    }

    for (let page = 1; page <= MAX_PAGES; page++) {
      for (let i = 0; i < 30; i++) {
        if (getCardsFromSource().length) {
          break;
        }

        await sleep(150);
      }

      addFromCurrent();

      badge(
        `수집 ${collected.length}/${MAX} (p${page})`,
        '#0b7'
      );

      if (collected.length >= MAX) {
        break;
      }

      if (!clickPage(page + 1)) {
        break;
      }

      await sleep(800);
    }

    return collected.slice(0, MAX);
  }

  // ============================================================
  // 사이니지 실행
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  async function run() {
    badge('시작...', '#0b7');

    injectCss();
    ensureOverlay();
    startClock();

    const cards = await collectSellingCards();

    if (!cards.length) {
      badge('판매중 카드 없음', '#e11');
      return;
    }

    const gallery = document.getElementById('spittoGallery');

    gallery.innerHTML = '';

    for (const card of cards) {
      gallery.appendChild(
        buildCard(
          extractInfo(card)
        )
      );
    }

    badge(`완료: ${cards.length}개`, '#0b7');
  }

  // ============================================================
  // 정기 새로고침
  // 수정일시: 2026-08-15 11:18
  // ============================================================
  setInterval(
    () => location.reload(),
    REFRESH_MINUTES * 60 * 1000
  );

  run();
})();