import {
  t,
  getLang,
  setLang,
  initLangFromStorage,
  loadLocale,
  categoryLabel,
} from "./i18n.js";

/** @typedef {{ name: string, country: string, founded_year: number, fame_score: number, tags: string[] }} Brand */
/** @typedef {{ type: string, value?: string, year?: number }} CategoryRule */
/** @typedef {{ id: string, label: string, rule: CategoryRule, description: string }} Category */
/** @typedef {{ date: string, rows: number[], cols: number[] }} PuzzleDef */

const MIN_SEARCH_CHARS = 3;
const WRONG_GUESS_PENALTY = 20;
const SAVE_KEY_PREFIX = "cardoku-state-";

/** @type {Brand[]} */
let brands = [];
/** @type {Category[]} */
let allCategories = [];
/** @type {Category[]} */
let rowCategories = [];
/** @type {Category[]} */
let columnCategories = [];
/** @type {PuzzleDef[]} */
let puzzleCatalog = [];

let activePuzzleDate = "";

/** @type {Map<string, { brand: Brand, points: number }>} */
const solvedCells = new Map();
/** @type {Set<string>} */
const usedBrandNames = new Set();

let activeCell = null;
let totalScore = 0;
let wrongGuessCount = 0;
let gameEnded = false;
let gaveUp = false;
let confettiRunning = false;

/** @type {Set<string>} */
const exploreCellKeys = new Set();

const gridEl = document.getElementById("game-grid");
const cellModalEl = document.getElementById("cell-modal");
const infoModalEl = document.getElementById("info-modal");
const searchInput = document.getElementById("brand-search");
const searchResults = document.getElementById("search-results");
const modalClues = document.getElementById("modal-clues");
const modalFeedback = document.getElementById("modal-feedback");
const infoModalTitle = document.getElementById("info-modal-title");
const infoModalBody = document.getElementById("info-modal-body");
const totalScoreEl = document.getElementById("total-score");
const cellsSolvedEl = document.getElementById("cells-solved");
const puzzleDateEl = document.getElementById("puzzle-date");
const searchHintEl = document.getElementById("search-hint");
const scorePanelEl = document.querySelector(".score-panel");
const winOverlayEl = document.getElementById("win-overlay");
const winFinalScoreEl = document.getElementById("win-final-score");
const winStatsEl = document.getElementById("win-stats");
const sharePreviewEl = document.getElementById("share-preview");
const btnShareCopy = document.getElementById("btn-share-copy");
const btnWinClose = document.getElementById("btn-win-close");
const answersModalEl = document.getElementById("answers-modal");
const answersModalClues = document.getElementById("answers-modal-clues");
const answersListEl = document.getElementById("answers-list");
const answersEmptyEl = document.getElementById("answers-empty");
const confettiCanvas = document.getElementById("confetti-canvas");
const btnShowAnswers = document.getElementById("btn-show-answers");
const btnLangFr = document.getElementById("btn-lang-fr");
const btnLangEn = document.getElementById("btn-lang-en");
const giveUpBody1El = document.getElementById("give-up-body1");
const giveUpModalEl = document.getElementById("give-up-modal");
const btnGiveUpConfirm = document.getElementById("btn-give-up-confirm");
const winTitleEl = document.getElementById("win-title");
const howToPlayModalEl = document.getElementById("how-to-play-modal");
const btnHowToPlay = document.getElementById("btn-how-to-play");

/** @type {CanvasRenderingContext2D | null} */
let confettiCtx = null;
/** @type {Array<{ x: number, y: number, vx: number, vy: number, w: number, h: number, color: string, rot: number, vr: number }>} */
let confettiParticles = [];

// ─── Persistence ────────────────────────────────────────────────────────────

function saveGameState() {
  if (!activePuzzleDate) return;
  try {
    const state = {
      solvedCells: Array.from(solvedCells.entries()).map(([k, v]) => [k, { brand: v.brand, points: v.points }]),
      usedBrandNames: Array.from(usedBrandNames),
      totalScore,
      wrongGuessCount,
      gameEnded,
      gaveUp,
      exploreCellKeys: Array.from(exploreCellKeys),
    };
    localStorage.setItem(SAVE_KEY_PREFIX + activePuzzleDate, JSON.stringify(state));
  } catch (e) {
    console.warn("Could not save game state:", e);
  }
}

function loadGameState() {
  if (!activePuzzleDate) return;
  let raw;
  try {
    raw = localStorage.getItem(SAVE_KEY_PREFIX + activePuzzleDate);
  } catch (e) { return; }
  if (!raw) return;
  try {
    const state = JSON.parse(raw);
    solvedCells.clear();
    usedBrandNames.clear();
    exploreCellKeys.clear();

    for (const [k, v] of (state.solvedCells || [])) {
      const brand = brands.find((b) => b.name === v.brand.name);
      if (brand) solvedCells.set(k, { brand, points: v.points });
    }
    for (const name of (state.usedBrandNames || [])) usedBrandNames.add(name);
    totalScore = state.totalScore ?? 0;
    wrongGuessCount = state.wrongGuessCount ?? 0;
    gameEnded = state.gameEnded ?? false;
    gaveUp = state.gaveUp ?? false;
    for (const k of (state.exploreCellKeys || [])) exploreCellKeys.add(k);

    // Edge-case fixes
    if (solvedCells.size === 9 && !gameEnded) gameEnded = true;
    if (gaveUp && !gameEnded) gameEnded = true;
  } catch (e) {
    console.warn("Could not load game state:", e);
  }
}

// ─── Game logic ─────────────────────────────────────────────────────────────


// Added with Gemini

function updateSearchPlaceholder() {
  if (!activeCell) return;
  const rowCat = rowCategories[activeCell.row];
  const colCat = columnCategories[activeCell.col];
  
  // Calculate remaining valid choices for this tile
  const count = getValidBrandsForCell(rowCat, colCat).length;
  
  // Update placeholder via your translation engine
  searchInput.placeholder = t("pick.placeholderCount", { count: count });
}

// endof Added with Gemini


/**
 * @param {CategoryRule} rule
 * @param {Brand} brand
 */
function brandMatchesRule(rule, brand) {
  switch (rule.type) {
    case "continent":
      return brand.continent && brand.continent.toLowerCase() === String(rule.value).toLowerCase();

    case "letter_count":
      // Counts letters only, ignoring spaces or hyphens (e.g., "Alfa Romeo" counts letters)
      return brand.name.replace(/[^a-zA-Z]/g, "").length === Number(rule.value);
    case "starts_with":
      return brand.name.trim().toLowerCase().startsWith(String(rule.value).toLowerCase());
    
      case "country":
      return brand.country.toLowerCase() === String(rule.value).toLowerCase();
    case "tag":
      return brand.tags.some((t) => t.toLowerCase() === String(rule.value).toLowerCase());
    case "has_ev":
      return brand.tags.includes("EV");
    case "founded_before":
      return brand.founded_year < Number(rule.year);
    case "founded_from":
      return brand.founded_year >= Number(rule.year);
    case "fame_max":
      return brand.fame_score <= Number(rule.value);
    default:
      console.warn("Unknown rule type:", rule.type);
      return false;
  }
}

function brandFitsCell(rowCat, colCat, brand) {
  return brandMatchesRule(rowCat.rule, brand) && brandMatchesRule(colCat.rule, brand);
}

function getValidBrandsForCell(rowCat, colCat) {
  return brands.filter((b) => brandFitsCell(rowCat, colCat, b) && !usedBrandNames.has(b.name));
}

function getBasePointsForDifficulty(validCount) {
  if (validCount <= 0) return 50;
  if (validCount === 1) return 120;
  if (validCount === 2) return 95;
  if (validCount === 3) return 75;
  if (validCount <= 5) return 55;
  return 40;
}

function calculateCellScore(brand, basePoints) {
  const rarityBonus = (6 - brand.fame_score) * 15;
  return basePoints + rarityBonus;
}

function cellKey(row, col) {
  return `${row}-${col}`;
}

function updateScoreUI() {
  totalScoreEl.textContent = String(totalScore);
  totalScoreEl.classList.toggle("score-panel__value--negative", totalScore < 0);
  cellsSolvedEl.textContent = `${solvedCells.size} / 9`;
}

function applyWrongGuessPenalty() {
  wrongGuessCount += 1;
  totalScore -= WRONG_GUESS_PENALTY;
  updateScoreUI();
  scorePanelEl?.classList.add("score-panel--penalty");
  setTimeout(() => scorePanelEl?.classList.remove("score-panel--penalty"), 500);
}

function getPuzzleDateKey() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getCatDisplay(cat) {
  return categoryLabel(cat.id, cat.label, cat.description);
}

function applyUiTranslations() {
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.getAttribute("data-i18n");
    if (key) el.textContent = t(key);
  });
  document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
    const key = el.getAttribute("data-i18n-placeholder");
    if (key) el.placeholder = t(key);
  });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => {
    const key = el.getAttribute("data-i18n-aria");
    if (key) el.setAttribute("aria-label", t(key));
  });
  document.title = t("meta.title");

  // Penalty lines (how-to-play modal + anywhere with class i18n-penalty)
  document.querySelectorAll(".i18n-penalty").forEach((el) => {
    el.textContent = t("footer.penalty", { n: WRONG_GUESS_PENALTY });
  });

  btnLangFr?.classList.toggle("lang-switch__btn--active", getLang() === "fr");
  btnLangEn?.classList.toggle("lang-switch__btn--active", getLang() === "en");
}

async function switchLanguage(lang) {
  setLang(lang);
  applyUiTranslations();
  buildGrid();
  if (!cellModalEl.classList.contains("hidden") && activeCell) {
    const rowCat = rowCategories[activeCell.row];
    const colCat = columnCategories[activeCell.col];
    modalClues.textContent = `${getCatDisplay(rowCat).label} · ${getCatDisplay(colCat).label}`;
    updateSearchHintText(searchInput.value);

    updateSearchPlaceholder();
  }
}

function updateSearchHintText(query) {
  const q = query.trim();
  if (q.length >= MIN_SEARCH_CHARS) {
    searchHintEl.classList.add("hidden");
    return;
  }
  searchHintEl.classList.remove("hidden");
  if (q.length === 0) {
    searchHintEl.textContent = t("pick.hintEmpty", { n: MIN_SEARCH_CHARS });
  } else {
    const remaining = MIN_SEARCH_CHARS - q.length;
    searchHintEl.textContent =
      remaining === 1
        ? t("pick.hintMore", { n: remaining })
        : t("pick.hintMorePlural", { n: remaining });
  }
}

function categoryByIndex(index) {
  const cat = allCategories[index];
  if (!cat) throw new Error(`Category index ${index} is out of range.`);
  return cat;
}

function validatePuzzle(puzzle) {
  if (puzzle.rows.length !== 3 || puzzle.cols.length !== 3)
    throw new Error(`Puzzle ${puzzle.date} must have 3 row and 3 column indices.`);
  const rowSet = new Set(puzzle.rows);
  const colSet = new Set(puzzle.cols);
  for (const idx of puzzle.rows) {
    if (colSet.has(idx)) throw new Error(`Puzzle ${puzzle.date}: category index ${idx} cannot be both a row and a column.`);
    if (!allCategories[idx]) throw new Error(`Puzzle ${puzzle.date}: invalid row index ${idx}.`);
  }
  for (const idx of puzzle.cols) {
    if (!allCategories[idx]) throw new Error(`Puzzle ${puzzle.date}: invalid column index ${idx}.`);
  }
  if (rowSet.size !== 3 || colSet.size !== 3)
    throw new Error(`Puzzle ${puzzle.date}: row and column indices must be unique.`);
}

function findPuzzleForDate(dateKey) {
  const exact = puzzleCatalog.find((p) => p.date === dateKey);
  if (exact) return exact;
  const sorted = [...puzzleCatalog].sort((a, b) => a.date.localeCompare(b.date));
  const onOrBefore = sorted.filter((p) => p.date <= dateKey);
  return onOrBefore.length > 0 ? onOrBefore[onOrBefore.length - 1] : sorted[0] ?? null;
}

function applyPuzzle(puzzle) {
  validatePuzzle(puzzle);
  activePuzzleDate = puzzle.date;
  rowCategories = puzzle.rows.map((i) => categoryByIndex(i));
  columnCategories = puzzle.cols.map((i) => categoryByIndex(i));
}

function buildShareGridEmoji() {
  const lines = [];
  for (let r = 0; r < 3; r++) {
    let line = "";
    for (let c = 0; c < 3; c++) {
      line += solvedCells.has(cellKey(r, c)) ? "✅" : "⬛";
    }
    lines.push(line);
  }
  return lines.join("\n");
}

function buildShareText() {
  const dateKey = activePuzzleDate || getPuzzleDateKey();
  const grid = buildShareGridEmoji();
  const mistakes = wrongGuessCount > 0
    ? `${t("share.wrongGuesses", { n: wrongGuessCount, pts: wrongGuessCount * WRONG_GUESS_PENALTY })}\n`
    : "";
  const status = gaveUp
    ? `${t("share.gaveUp", { solved: solvedCells.size })}\n`
    : `${t("share.perfect")}\n`;
  return `CarDoku ${dateKey}\n${t("share.score")} ${totalScore}\n${status}${mistakes}\n${grid}`;
}

function getPossibleAnswersForCell(row, col) {
  const rowCat = rowCategories[row];
  const colCat = columnCategories[col];
  const valid = brands.filter((b) => brandFitsCell(rowCat, colCat, b));
  const basePoints = getBasePointsForDifficulty(valid.length);
  const key = cellKey(row, col);
  const solvedHere = solvedCells.get(key)?.brand.name;
  return valid
    .map((brand) => ({
      brand,
      points: calculateCellScore(brand, basePoints),
      usedElsewhere: usedBrandNames.has(brand.name) && solvedHere !== brand.name,
    }))
    .sort((a, b) => b.points - a.points);
}

function markCellsForExplore() {
  exploreCellKeys.clear();
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const key = cellKey(r, c);
      if (!solvedCells.has(key)) exploreCellKeys.add(key);
    }
  }
}

const MAGNIFY_ICON = `<span class="grid__cell-icon" aria-hidden="true"><svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></span>`;

const SMALL_MAGNIFY_SVG = `<svg class="grid__header-magnify" xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>`;

// ─── Modals ─────────────────────────────────────────────────────────────────

function openAnswersModal(row, col) {
  const rowCat = rowCategories[row];
  const colCat = columnCategories[col];
  const rowD = getCatDisplay(rowCat);
  const colD = getCatDisplay(colCat);
  answersModalClues.textContent = `${rowD.label} · ${colD.label}`;

  const options = getPossibleAnswersForCell(row, col);
  answersListEl.innerHTML = "";

  if (options.length === 0) {
    answersEmptyEl.classList.remove("hidden");
    answersListEl.classList.add("hidden");
  } else {
    answersEmptyEl.classList.add("hidden");
    answersListEl.classList.remove("hidden");
    for (const { brand, points, usedElsewhere } of options) {
      const li = document.createElement("li");
      li.className = "answers-list__item";
      if (usedElsewhere) li.classList.add("answers-list__item--used");
      li.innerHTML = `
        <div class="answers-list__main">
          <span class="answers-list__name">${brand.name}</span>
          <span class="answers-list__points">${points} ${t("answers.pts")}</span>
        </div>
        <div class="answers-list__meta">${brand.country} · ${brand.founded_year} · ★${brand.fame_score}${usedElsewhere ? ` · ${t("answers.alreadyOnGrid")}` : ""}</div>
      `;
      answersListEl.appendChild(li);
    }
  }

  answersModalEl.classList.remove("hidden");
  setModalOpen(true);
}

function closeAnswersModal() {
  answersModalEl.classList.add("hidden");
  if (allModalsHidden()) setModalOpen(false);
}

function openHowToPlayModal() {
  howToPlayModalEl.classList.remove("hidden");
  setModalOpen(true);
}

function closeHowToPlayModal() {
  howToPlayModalEl.classList.add("hidden");
  if (allModalsHidden()) setModalOpen(false);
}

function allModalsHidden() {
  return (
    cellModalEl.classList.contains("hidden") &&
    infoModalEl.classList.contains("hidden") &&
    giveUpModalEl.classList.contains("hidden") &&
    winOverlayEl.classList.contains("hidden") &&
    answersModalEl.classList.contains("hidden") &&
    howToPlayModalEl.classList.contains("hidden")
  );
}

function updateShowAnswersButton() {
  if (!btnShowAnswers) return;
  btnShowAnswers.classList.toggle("hidden", gameEnded);
  btnShowAnswers.disabled = gameEnded;
}

function openGiveUpModal() {
  if (gameEnded) return;
  if (giveUpBody1El) giveUpBody1El.textContent = t("giveUp.body1", { score: totalScore });
  giveUpModalEl.classList.remove("hidden");
  setModalOpen(true);
}

function closeGiveUpModal() {
  giveUpModalEl.classList.add("hidden");
  if (allModalsHidden()) setModalOpen(false);
}

function confirmGiveUp() {
  closeGiveUpModal();
  closeCellModal();
  markCellsForExplore();
  gaveUp = true;
  gameEnded = true;
  saveGameState();
  buildGrid();
  updateShowAnswersButton();
  showEndScreen(false);
}

function endGame() {
  gameEnded = true;
  updateShowAnswersButton();
  saveGameState();
}

// ─── Confetti ────────────────────────────────────────────────────────────────

function resizeConfettiCanvas() {
  if (!confettiCanvas) return;
  confettiCanvas.width = window.innerWidth;
  confettiCanvas.height = window.innerHeight;
}

function createConfettiParticle() {
  const colors = ["#e85d04", "#f48c06", "#dc2f02", "#f4f4f5", "#fbbf24", "#fb923c"];
  return {
    x: Math.random() * (confettiCanvas?.width ?? window.innerWidth),
    y: -12 - Math.random() * 80,
    vx: (Math.random() - 0.5) * 4,
    vy: 2 + Math.random() * 5,
    w: 6 + Math.random() * 6,
    h: 4 + Math.random() * 5,
    color: colors[Math.floor(Math.random() * colors.length)],
    rot: Math.random() * Math.PI * 2,
    vr: (Math.random() - 0.5) * 0.2,
  };
}

function startConfetti() {
  if (!confettiCanvas || confettiRunning) return;
  confettiRunning = true;
  confettiCanvas.classList.add("confetti-canvas--active");
  resizeConfettiCanvas();
  confettiCtx = confettiCanvas.getContext("2d");
  confettiParticles = Array.from({ length: 140 }, () => createConfettiParticle());
  requestAnimationFrame(tickConfetti);
}

function tickConfetti() {
  if (!confettiRunning || !confettiCtx || !confettiCanvas) return;
  confettiCtx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
  for (const p of confettiParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.06;
    p.rot += p.vr;
    confettiCtx.save();
    confettiCtx.translate(p.x, p.y);
    confettiCtx.rotate(p.rot);
    confettiCtx.fillStyle = p.color;
    confettiCtx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
    confettiCtx.restore();
    if (p.y > confettiCanvas.height + 20) {
      Object.assign(p, createConfettiParticle());
      p.y = -10;
    }
  }
  requestAnimationFrame(tickConfetti);
}

function showEndScreen(isWin) {
  if (gameEnded && !gaveUp && !isWin) return;
  endGame();

  winTitleEl.textContent = isWin ? t("win.title") : t("win.titleRevealed");
  winFinalScoreEl.textContent = String(totalScore);
  sharePreviewEl.textContent = buildShareText();

  const statsParts = [];
  if (gaveUp) statsParts.push(t("win.gaveUpStats", { solved: solvedCells.size }));
  if (wrongGuessCount > 0) {
    const guessLabel = wrongGuessCount === 1
      ? t("win.wrongGuesses", { n: wrongGuessCount })
      : t("win.wrongGuessesPlural", { n: wrongGuessCount });
    statsParts.push(`${guessLabel} ${t("win.wrongGuessesPts", { pts: wrongGuessCount * WRONG_GUESS_PENALTY })}`);
  }

  if (statsParts.length > 0) {
    winStatsEl.textContent = statsParts.join(" · ");
    winStatsEl.classList.remove("hidden");
  } else {
    winStatsEl.classList.add("hidden");
  }

  winOverlayEl.classList.remove("hidden");
  setModalOpen(true);
  if (isWin) startConfetti();
}

function showWinScreen() {
  if (gameEnded) return;
  showEndScreen(true);
}

function closeWinScreen() {
  winOverlayEl.classList.add("hidden");
  if (allModalsHidden()) setModalOpen(false);
}

async function copyShareText() {
  const text = buildShareText();
  try {
    await navigator.clipboard.writeText(text);
    btnShareCopy.textContent = t("win.copied");
    setTimeout(() => { btnShareCopy.textContent = t("win.copyResult"); }, 2000);
  } catch {
    sharePreviewEl.focus();
    document.execCommand?.("copy");
    btnShareCopy.textContent = t("win.copyManual");
  }
}

function setModalOpen(isOpen) {
  document.body.classList.toggle("modal-open", isOpen);
}

function openInfoModal(category) {
  const display = getCatDisplay(category);
  infoModalTitle.textContent = t("info.title");
  infoModalBody.textContent = display.description;
  infoModalEl.classList.remove("hidden");
  setModalOpen(true);
}

function closeInfoModal() {
  infoModalEl.classList.add("hidden");
  if (allModalsHidden()) setModalOpen(false);
}

// ─── Grid ────────────────────────────────────────────────────────────────────

function createCategoryHeader(category, axis) {
  const display = getCatDisplay(category);
  const header = document.createElement("button");
  header.type = "button";
  header.className = `grid__header grid__header--${axis}`;
  header.setAttribute("role", axis === "col" ? "columnheader" : "rowheader");
  header.setAttribute("aria-label", t("clue.tapAria", { label: display.label }));

  const textSpan = document.createElement("span");
  textSpan.className = "grid__header-text";
  textSpan.textContent = display.label;
  header.appendChild(textSpan);
  header.insertAdjacentHTML("beforeend", SMALL_MAGNIFY_SVG);

  header.addEventListener("click", () => openInfoModal(category));
  return header;
}

function buildGrid() {
  gridEl.innerHTML = "";

  const corner = document.createElement("div");
  corner.className = "grid__corner";
  corner.setAttribute("aria-hidden", "true");
  gridEl.appendChild(corner);

  for (const colCat of columnCategories) {
    gridEl.appendChild(createCategoryHeader(colCat, "col"));
  }

  for (let r = 0; r < 3; r++) {
    gridEl.appendChild(createCategoryHeader(rowCategories[r], "row"));

    for (let c = 0; c < 3; c++) {
      const key = cellKey(r, c);
      const rowCat = rowCategories[r];
      const colCat = columnCategories[c];
      const rowD = getCatDisplay(rowCat);
      const colD = getCatDisplay(colCat);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "grid__cell";
      cell.dataset.row = String(r);
      cell.dataset.col = String(c);
      cell.setAttribute("role", "gridcell");
      cell.setAttribute("aria-label", t("cell.emptyAria", { row: rowD.label, col: colD.label }));

      const solved = solvedCells.get(key);

      if (solved) {
        cell.classList.add("grid__cell--locked");
        cell.setAttribute("aria-label", t("cell.solvedAria", { brand: solved.brand.name }));
        cell.innerHTML = `${solved.brand.name}<span class="grid__cell-points">${t("cell.points", { pts: solved.points })}</span>`;
      } else if (exploreCellKeys.has(key)) {
        cell.classList.add("grid__cell--explore");
        cell.setAttribute("aria-label", t("cell.exploreAria", { row: rowD.label, col: colD.label }));
        cell.innerHTML = MAGNIFY_ICON;
        cell.addEventListener("click", () => openAnswersModal(r, c));
      } else if (!gameEnded) {
        cell.addEventListener("click", () => openCellModal(r, c));
      } else {
        cell.classList.add("grid__cell--missed");
        cell.disabled = true;
        cell.setAttribute("aria-label", t("cell.unsolvedAria"));
      }

      gridEl.appendChild(cell);
    }
  }
}

function openCellModal(row, col) {
  if (gameEnded) return;
  const key = cellKey(row, col);
  if (solvedCells.has(key)) return;

  activeCell = { row, col, key };
  const rowCat = rowCategories[row];
  const colCat = columnCategories[col];

  modalClues.textContent = `${getCatDisplay(rowCat).label} · ${getCatDisplay(colCat).label}`;
  searchInput.value = "";
  hideFeedback();
  searchResults.innerHTML = "";
  updateSearchHintText("");

  updateSearchPlaceholder();

  cellModalEl.classList.remove("hidden");
  setModalOpen(true);
  requestAnimationFrame(() => { searchInput.focus({ preventScroll: true }); });
}

function closeCellModal() {
  cellModalEl.classList.add("hidden");
  activeCell = null;
  searchInput.value = "";
  searchResults.innerHTML = "";
  hideFeedback();
  if (allModalsHidden()) setModalOpen(false);
}

function hideFeedback() {
  modalFeedback.classList.add("hidden");
  modalFeedback.textContent = "";
  modalFeedback.classList.remove("modal__feedback--success", "modal__feedback--error");
}

function showFeedback(message, type) {
  modalFeedback.textContent = message;
  modalFeedback.classList.remove("hidden");
  modalFeedback.classList.toggle("modal__feedback--success", type === "success");
  modalFeedback.classList.toggle("modal__feedback--error", type === "error");
}

function renderSearchResults(query) {
  searchResults.innerHTML = "";
  const q = query.trim().toLowerCase();
  if (q.length < MIN_SEARCH_CHARS) {
    updateSearchHintText(query);
    return;
  }
  searchHintEl.classList.add("hidden");
  const matches = brands.filter((b) => b.name.toLowerCase().includes(q)).slice(0, 8);
  for (const brand of matches) {
    const li = document.createElement("li");
    li.className = "search__result";
    li.setAttribute("role", "option");
    li.textContent = brand.name;
    li.addEventListener("click", () => submitBrand(brand));
    searchResults.appendChild(li);
  }
}

function submitBrand(brand) {
  if (!activeCell) return;

  if (usedBrandNames.has(brand.name)) {
    applyWrongGuessPenalty();
    showFeedback(t("error.alreadyOnGrid", { brand: brand.name, pts: WRONG_GUESS_PENALTY }), "error");
    saveGameState();
    return;
  }

  const rowCat = rowCategories[activeCell.row];
  const colCat = columnCategories[activeCell.col];

  if (!brandFitsCell(rowCat, colCat, brand)) {
    applyWrongGuessPenalty();
    showFeedback(t("error.noMatch", { brand: brand.name, pts: WRONG_GUESS_PENALTY }), "error");
    const cellBtn = gridEl.querySelector(`[data-row="${activeCell.row}"][data-col="${activeCell.col}"]`);
    cellBtn?.classList.add("grid__cell--wrong-flash");
    setTimeout(() => cellBtn?.classList.remove("grid__cell--wrong-flash"), 450);
    saveGameState();
    return;
  }

  const allValid = brands.filter((b) => brandFitsCell(rowCat, colCat, b));
  const basePoints = getBasePointsForDifficulty(allValid.length);
  const points = calculateCellScore(brand, basePoints);

  solvedCells.set(activeCell.key, { brand, points });
  usedBrandNames.add(brand.name);
  totalScore += points;

  updateScoreUI();
  buildGrid();
  closeCellModal();
  saveGameState();

  if (solvedCells.size === 9) {
    setTimeout(showWinScreen, 300);
  }
}

// ─── Event handlers ──────────────────────────────────────────────────────────

function initModalHandlers() {
  cellModalEl.querySelectorAll("[data-close-modal]").forEach((el) => {
    el.addEventListener("click", closeCellModal);
  });
  infoModalEl.querySelectorAll("[data-close-info]").forEach((el) => {
    el.addEventListener("click", closeInfoModal);
  });
  howToPlayModalEl.querySelectorAll("[data-close-how-to-play]").forEach((el) => {
    el.addEventListener("click", closeHowToPlayModal);
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!winOverlayEl.classList.contains("hidden")) { closeWinScreen(); return; }
    if (!giveUpModalEl.classList.contains("hidden")) { closeGiveUpModal(); return; }
    if (!answersModalEl.classList.contains("hidden")) { closeAnswersModal(); return; }
    if (!howToPlayModalEl.classList.contains("hidden")) { closeHowToPlayModal(); return; }
    if (!infoModalEl.classList.contains("hidden")) { closeInfoModal(); return; }
    if (!cellModalEl.classList.contains("hidden")) { closeCellModal(); }
  });

  btnShowAnswers.addEventListener("click", openGiveUpModal);
  giveUpModalEl.querySelectorAll("[data-close-give-up]").forEach((el) => {
    el.addEventListener("click", closeGiveUpModal);
  });
  btnGiveUpConfirm.addEventListener("click", confirmGiveUp);

  searchInput.addEventListener("input", (e) => { renderSearchResults(e.target.value); });
  searchInput.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const q = searchInput.value.trim().toLowerCase();
    if (q.length < MIN_SEARCH_CHARS) return;
    const first = searchResults.querySelector(".search__result");
    if (first) {
      const brand = brands.find((b) => b.name === first.textContent);
      if (brand) submitBrand(brand);
      return;
    }
    const exact = brands.find((b) => b.name.toLowerCase() === q);
    if (exact) submitBrand(exact);
  });

  answersModalEl.querySelectorAll("[data-close-answers]").forEach((el) => {
    el.addEventListener("click", closeAnswersModal);
  });

  btnShareCopy.addEventListener("click", copyShareText);
  btnWinClose.addEventListener("click", closeWinScreen);
  btnLangFr?.addEventListener("click", () => switchLanguage("fr"));
  btnLangEn?.addEventListener("click", () => switchLanguage("en"));
  btnHowToPlay?.addEventListener("click", openHowToPlayModal);

  window.addEventListener("resize", resizeConfettiCanvas);
}

function setPuzzleDate() {
  const today = new Date();
  const locale = getLang() === "fr" ? "fr-FR" : "en-US";
  puzzleDateEl.textContent = today.toLocaleDateString(locale, {
    weekday: "long", month: "short", day: "numeric", year: "numeric",
  });
}

function parseCategories(data) {
  if (!Array.isArray(data) || data.length < 6)
    throw new Error("categories.json must be an array of at least 6 categories.");
  return data.map((item, i) => {
    if (!item?.id || !item?.label || !item?.rule?.type || !item?.description)
      throw new Error(`categories.json[${i}] needs id, label, rule.type, and description.`);
    return /** @type {Category} */ (item);
  });
}

async function init() {
  initLangFromStorage();
  initModalHandlers();

  try {
    await Promise.all([loadLocale("en"), loadLocale("fr")]);
  } catch (err) {
    console.error("Failed to load locales:", err);
  }

  applyUiTranslations();
  setPuzzleDate();

  try {
    const [brandsRes, categoriesRes, puzzlesRes] = await Promise.all([
      fetch("./brands.json"),
      fetch("./categories.json"),
      fetch("./puzzles.json"),
    ]);

    brands = await brandsRes.json();
    allCategories = parseCategories(await categoriesRes.json());
    const puzzlesData = await puzzlesRes.json();
    puzzleCatalog = puzzlesData.puzzles ?? [];

    const todayKey = getPuzzleDateKey();
    const puzzle = findPuzzleForDate(todayKey);
    if (puzzle) {
      applyPuzzle(puzzle);
      loadGameState();
    } else {
      console.warn(t("puzzle.notFound"));
    }
  } catch (err) {
    console.error("Failed to load game data:", err);
    brands = [];
    allCategories = [];
    rowCategories = [];
    columnCategories = [];
  }

  buildGrid();
  updateScoreUI();
  updateShowAnswersButton();
}

init();
