// D&D Combat Tracker App.js
// Condensed tracker + Conditions + Import PCs + Batch Monsters + Auto-init + Panel polish
// ============================

// ----- State -----
let state = {
  round: 1,
  turnIndex: 0,
  combatants: []
};

let selectedIndex = null;
let infoPanelVisible = true;
let clearNewFlagTimer = null;
const savedAddPanelCollapsed = localStorage.getItem("addPanelCollapsed");
let addPanelCollapsed = savedAddPanelCollapsed === null ? false : savedAddPanelCollapsed === "true";
const savedCreateStatblockCollapsed = localStorage.getItem("createStatblockCollapsed");
let createStatblockCollapsed = savedCreateStatblockCollapsed === null ? true : savedCreateStatblockCollapsed === "true";
const savedCreatePanelMode = localStorage.getItem("createPanelMode");
let createPanelMode = savedCreatePanelMode === "player" ? "player" : "statblock";
let activeDrawerId = null;
let monsterDetailsStatblock = null;
let editingStatblockId = null;

// ----- Load saved states -----
const savedState = localStorage.getItem("combatState");
if (savedState) state = JSON.parse(savedState);

// ----- Data storage -----
let statblocks = {};
let characters = {};
let baseStatblocks = {};
let localStatblocks = {};
const LOCAL_STATBLOCKS_KEY = "statblocksLocal";
let baseCharacters = {};
let localCharacters = {};
const LOCAL_CHARACTERS_KEY = "charactersLocal";
const COMBAT_SAVES_KEY = "combatSaves";
let combatSaves = {};

// ----- Utilities -----
function saveState() {
  localStorage.setItem("combatState", JSON.stringify(state));
  localStorage.setItem("infoPanelVisible", infoPanelVisible);
  localStorage.setItem("addPanelCollapsed", addPanelCollapsed);
  localStorage.setItem("createStatblockCollapsed", createStatblockCollapsed);
  localStorage.setItem("createPanelMode", createPanelMode);
}

function rollD20() {
  return Math.floor(Math.random() * 20) + 1;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(value) {
  if (!value) return "";
  const url = String(value).trim();
  if (!url) return "";
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return parsed.href;
    }
  } catch {
    return "";
  }
  return "";
}

function formatInlineStatblockText(value) {
  let out = escapeHtml(value);
  out = out.replace(/&lt;br\s*\/?&gt;/gi, "<br>");
  out = out.replace(/_([^_]+)_/g, "<em>$1</em>");
  return out;
}

function formatStatblockText(raw) {
  const text = String(raw ?? "");
  const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|<\s*(https?:\/\/[^>\s]+)\s*>/g;
  let result = "";
  let lastIndex = 0;
  let match;

  while ((match = linkRegex.exec(text)) !== null) {
    const [full, label, url, angleUrl] = match;
    result += formatInlineStatblockText(text.slice(lastIndex, match.index));
    if (label && url) {
      const safeUrl = sanitizeUrl(url);
      if (safeUrl) {
        result += `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${formatInlineStatblockText(label)}</a>`;
      } else {
        result += formatInlineStatblockText(label);
      }
    } else if (angleUrl) {
      const safeUrl = sanitizeUrl(angleUrl);
      if (safeUrl) {
        result += `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">${formatInlineStatblockText(angleUrl)}</a>`;
      } else {
        result += formatInlineStatblockText(angleUrl);
      }
    }
    lastIndex = match.index + full.length;
  }

  result += formatInlineStatblockText(text.slice(lastIndex));
  return result;
}

function formatStatblockEntry(raw) {
  const text = String(raw ?? "");
  const idx = text.indexOf(":");
  let title = "";
  let body = text;
  if (idx > -1) {
    title = text.slice(0, idx).trim();
    body = text.slice(idx + 1).trim();
  }

  const safeTitle = escapeHtml(title);
  if (!title) return formatStatblockText(text);
  return `<span class="sb-title">${safeTitle}:</span> ${formatStatblockText(body)}`;
}

function formatDefenses(value) {
  if (Array.isArray(value)) {
    const cleaned = value.map(v => String(v || "").trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(", ") : "-";
  }
  if (value === null || value === undefined) return "-";
  const text = String(value).trim();
  return text ? text : "-";
}

function formatStatblockValue(value) {
  if (Array.isArray(value)) {
    const cleaned = value.map(v => String(v || "").trim()).filter(Boolean);
    return cleaned.length ? cleaned.join(", ") : "";
  }
  if (value === null || value === undefined) return "";
  const text = String(value).trim();
  return text ? text : "";
}

function normalizeTag(value) {
  const v = String(value || "").trim();
  return v ? v : "";
}

function getCampaignTags(entry) {
  if (!entry) return [];
  const raw = entry.campaign_tag ?? entry.campaign ?? entry.tag ?? entry.tags;
  if (Array.isArray(raw)) {
    return raw.map(x => normalizeTag(x)).filter(Boolean);
  }
  const text = normalizeTag(raw);
  if (!text) return [];
  return text.split(",").map(t => normalizeTag(t)).filter(Boolean);
}

function getCampaignTag(entry) {
  return getCampaignTags(entry)[0] || "";
}

function loadLocalStatblocks() {
  try {
    const raw = localStorage.getItem(LOCAL_STATBLOCKS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalStatblocks(map) {
  localStorage.setItem(LOCAL_STATBLOCKS_KEY, JSON.stringify(map || {}));
}

function loadLocalCharacters() {
  try {
    const raw = localStorage.getItem(LOCAL_CHARACTERS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveLocalCharacters(map) {
  localStorage.setItem(LOCAL_CHARACTERS_KEY, JSON.stringify(map || {}));
}

function loadCombatSaves() {
  try {
    const raw = localStorage.getItem(COMBAT_SAVES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveCombatSaves(map) {
  localStorage.setItem(COMBAT_SAVES_KEY, JSON.stringify(map || {}));
}

function setCombatSaveStatus(message, isError) {
  const el = document.getElementById("combatSaveStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#ef5350" : "";
}

function renderCombatSaveList(selectedName) {
  const select = document.getElementById("saveSelect");
  if (!select) return;
  const names = Object.keys(combatSaves || {}).sort((a, b) => a.localeCompare(b));
  select.innerHTML = names.map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join("");
  if (selectedName && names.includes(selectedName)) {
    select.value = selectedName;
  } else if (names.length) {
    select.value = names[0];
  }
}

function getCombatSavePayload(name) {
  return {
    name,
    saved_at: new Date().toISOString(),
    state: JSON.parse(JSON.stringify(state)),
    selectedIndex,
    infoPanelVisible
  };
}

function applyCombatSavePayload(payload) {
  if (!payload || typeof payload !== "object") return false;
  if (!payload.state || !Array.isArray(payload.state.combatants)) return false;
  state = payload.state;
  selectedIndex = Number.isInteger(payload.selectedIndex) ? payload.selectedIndex : null;
  infoPanelVisible = !!payload.infoPanelVisible;
  normalizeLoadedState();
  if (selectedIndex !== null && (!state.combatants[selectedIndex])) selectedIndex = null;
  saveState();
  setActiveDrawer(null);
  render();
  return true;
}

function escRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLoadedState() {
  if (!state || !Array.isArray(state.combatants)) {
    state = { round: 1, turnIndex: 0, combatants: [] };
    return;
  }

  state.combatants.forEach(c => {
    if (!Array.isArray(c.conditions)) c.conditions = [];
    if (!c.type) c.type = "monster";
    if (c.type === "monster") {
      c.current_hp = parseInt(c.current_hp, 10);
      c.max_hp = parseInt(c.max_hp, 10);
    } else {
      delete c.current_hp;
      delete c.max_hp;
    }
    c.ac = parseInt(c.ac, 10);
    c.initiative = parseInt(c.initiative, 10);
    c.is_npc = !!c.is_npc;
    c.just_added = false;

    if (c.type === "monster") {
      if (Number.isNaN(c.current_hp)) c.current_hp = 0;
      if (Number.isNaN(c.max_hp)) c.max_hp = c.current_hp;
    }
    if (Number.isNaN(c.ac)) c.ac = 10;
    if (Number.isNaN(c.initiative)) c.initiative = 0;
  });

  if (!state.round || state.round < 1) state.round = 1;
  if (state.turnIndex < 0) state.turnIndex = 0;
  if (state.turnIndex >= state.combatants.length) state.turnIndex = 0;
}

function conditionClass(name) {
  return (
    "cond-" +
    String(name || "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
  );
}

function preserveTurnAndSelectionAcrossSort(beforeTurnRef, beforeSelectedRef) {
  if (beforeTurnRef) {
    const idx = state.combatants.findIndex(x => x === beforeTurnRef);
    if (idx !== -1) state.turnIndex = idx;
  }
  if (beforeSelectedRef) {
    const idx = state.combatants.findIndex(x => x === beforeSelectedRef);
    selectedIndex = idx !== -1 ? idx : null;
  }
}

function hasCombatantNamed(name) {
  const n = String(name || "").trim().toLowerCase();
  return state.combatants.some(c => String(c.name || "").trim().toLowerCase() === n);
}

function nextNumberedName(base) {
  const baseTrim = String(base || "").trim();
  const rx = new RegExp(`^${escRe(baseTrim)}\\s+(\\d+)$`, "i");

  let maxN = 0;
  for (const c of state.combatants) {
    const n = String(c.name || "").trim();
    const m = n.match(rx);
    if (m) {
      const num = parseInt(m[1], 10);
      if (!Number.isNaN(num)) maxN = Math.max(maxN, num);
    }
    if (n.toLowerCase() === baseTrim.toLowerCase()) {
      maxN = Math.max(maxN, 0);
    }
  }
  return maxN + 1;
}

function monsterInitBonusFromStatblock(statblockId) {
  if (!statblockId || !statblocks[statblockId]) return 0;
  return parseInt(statblocks[statblockId].initiative_bonus, 10) || 0;
}

function stripNumberedSuffix(name) {
  const text = String(name || "").trim();
  if (!text) return "";
  return text.replace(/\s+\d+$/u, "");
}

// ----- Lookups (by displayed name) -----
function findStatblockIdByName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const id in statblocks) {
    if (statblocks[id]?.name?.toLowerCase() === n) return id;
  }
  return null;
}

function findCharacterIdByName(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const id in characters) {
    if (characters[id]?.name?.toLowerCase() === n) return id;
  }
  return null;
}

/*
Auto-detect rules:
- statblock only => monster
- character only => player
- both matched:
    - batch (>1) => monster
    - single => player
- neither matched => monster (default)
*/
function detectTypeAndSourceIds(name, count) {
  const statblockId = findStatblockIdByName(name);
  const characterId = findCharacterIdByName(name);
  const wantsBatch = (parseInt(count, 10) || 1) > 1;

  if (statblockId && !characterId) return { type: "monster", statblockId, characterId: null };
  if (!statblockId && characterId) return { type: "player", statblockId: null, characterId };
  if (statblockId && characterId) {
    return wantsBatch
      ? { type: "monster", statblockId, characterId: null }
      : { type: "player", statblockId: null, characterId };
  }

  return { type: "monster", statblockId: null, characterId: null };
}

function getStatblockForCombatant(combatant) {
  if (!combatant?.statblock_id) return null;
  const base = statblocks[combatant.statblock_id] || null;
  if (!base) return null;
  const overrides = combatant.statblock_overrides;
  if (overrides && typeof overrides === "object") {
    return { ...base, ...overrides };
  }
  return base;
}

function renderDetectHint() {
  const hint = document.getElementById("detectHint");
  const name = document.getElementById("combatantNameSelect")?.value?.trim() || "";
  const count = parseInt(document.getElementById("combatantCount")?.value ?? "1", 10) || 1;
  if (!hint) return;

  if (!name) {
    hint.innerHTML = 'Detected: <span class="tag unknown">—</span>';
    return;
  }

  const statblockId = findStatblockIdByName(name);
  const characterId = findCharacterIdByName(name);

  let label = "Unknown";
  let cls = "unknown";

  if (statblockId && !characterId) { label = "Monster"; cls = "monster"; }
  else if (!statblockId && characterId) { label = "Player"; cls = "player"; }
  else if (statblockId && characterId) {
    if (count > 1) { label = "Monster (both)"; cls = "monster"; }
    else { label = "Player (both)"; cls = "player"; }
  }

  hint.innerHTML = `Detected: <span class="tag ${cls}">${label}</span>`;
}

function applyAddPanelState() {
  const panel = document.getElementById("addCombatantForm");
  const btn = document.getElementById("toggleAddPanel");
  if (!panel || !btn) return;
  addPanelCollapsed = false;
  panel.classList.remove("collapsed");
  btn.textContent = "Close";
}

function applyInfoPanelState() {
  const panel = document.getElementById("infoPanel");
  const content = document.getElementById("panelContent");
  const hint = document.getElementById("panelHint");
  const btn = document.getElementById("toggleInfoPanel");
  if (!panel || !content) return;
  panel.classList.toggle("collapsed", !infoPanelVisible);
  content.style.display = infoPanelVisible ? "block" : "none";
  if (hint) hint.style.display = infoPanelVisible ? "none" : "block";
  if (btn) btn.textContent = infoPanelVisible ? "Hide" : "Show";
}

function applyCreateStatblockState() {
  const panel = document.getElementById("createStatblock");
  const btn = document.getElementById("toggleCreateStatblock");
  if (!panel || !btn) return;
  createStatblockCollapsed = false;
  panel.classList.remove("collapsed");
  btn.textContent = "Close";
}

function applyCreatePanelMode() {
  const statblockPanel = document.getElementById("statblockPanel");
  const playerPanel = document.getElementById("playerPanel");
  const tabStatblock = document.getElementById("tabStatblock");
  const tabPlayer = document.getElementById("tabPlayer");
  const title = document.getElementById("createPanelTitle");
  if (!statblockPanel || !playerPanel) return;

  const isStatblock = createPanelMode === "statblock";
  statblockPanel.classList.toggle("panelHidden", !isStatblock);
  playerPanel.classList.toggle("panelHidden", isStatblock);
  if (tabStatblock) tabStatblock.classList.toggle("active", isStatblock);
  if (tabPlayer) tabPlayer.classList.toggle("active", !isStatblock);
  if (title) title.textContent = isStatblock ? "Create Monster" : "Create Player";
}

function setActiveDrawer(id) {
  const panels = document.querySelectorAll(".drawerPanel");
  const backdrop = document.getElementById("drawerBackdrop");
  const isOpen = !!id;

  panels.forEach(panel => {
    const panelId = panel.dataset.drawerPanel || panel.id;
    const isTarget = panelId === id;
    panel.classList.toggle("open", isTarget);
    panel.style.opacity = isTarget ? "1" : "";
    panel.style.visibility = isTarget ? "visible" : "";
    panel.style.transform = isTarget ? "translateX(0)" : "";
    panel.style.pointerEvents = isTarget ? "auto" : "";
  });
  if (backdrop) backdrop.classList.toggle("active", isOpen);
  document.body.classList.toggle("drawerOpen", isOpen);

  activeDrawerId = isOpen ? id : null;
  saveState();
  applyInfoPanelState();

  renderInfoPanel();

  if (id === "monsterDetailsPanel") {
    const dbg = document.getElementById("drawerDebug");
    if (dbg) dbg.remove();
  }
}

function openMonsterDetailsDrawer(statblock, title) {
  monsterDetailsStatblock = statblock || null;
  const titleEl = document.getElementById("monsterDetailsTitle");
  if (titleEl) titleEl.textContent = title || "Monster Details";
  renderMonsterDetailsPanel();
  setActiveDrawer("monsterDetailsPanel");
}

function renderMonsterDetailsPanel() {
  const target = document.getElementById("monsterDetailsContent");
  if (!target) return;
  const b = monsterDetailsStatblock;
  if (!b) {
    target.innerHTML = `<div class="emptyState">No statblock available.</div>`;
    return;
  }

  const section = (title, arr) => {
    const list = Array.isArray(arr) ? arr.filter(Boolean) : [];
    if (!list.length) return "";
    return `
      <div class="sbSection">
        <div class="sbSectionTitle">${title}</div>
        <ul>${list.map(x => `<li class="statblockEntry">${formatStatblockEntry(x)}</li>`).join("")}</ul>
      </div>
    `;
  };

  target.innerHTML = `
    <div class="infoBody monsterDetailsBody">
      ${section("Traits", b.traits)}
      ${section("Actions", b.actions)}
      ${section("Bonus Actions", b.bonus_actions)}
      ${section("Reactions", b.reactions)}
      ${section("Legendary Actions", b.legendary_actions)}
    </div>
  `;
}

function setStatblockStatus(message, isError) {
  const el = document.getElementById("statblockStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#ef5350" : "";
}

function setPlayerStatus(message, isError) {
  const el = document.getElementById("playerStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#ef5350" : "";
}

function refreshStatblocks() {
  statblocks = { ...baseStatblocks, ...localStatblocks };
  renderCampaignFilter();
  populateNameDatalist();
  renderStatblockCampaignFilter();
  renderStatblockTemplateList();
  render();
}

function refreshCharacters() {
  characters = { ...baseCharacters, ...localCharacters };
  renderCampaignFilter();
  populateNameDatalist();
  render();
}

function makeStatblockIdFromName(name, existingMap) {
  const baseRaw = String(name || "").toLowerCase().trim();
  let base = baseRaw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) base = "statblock";
  let id = base;
  let i = 2;
  while (existingMap[id]) {
    id = `${base}_${i}`;
    i += 1;
  }
  return id;
}

function makeCharacterIdFromName(name, existingMap) {
  const baseRaw = String(name || "").toLowerCase().trim();
  let base = baseRaw.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!base) base = "character";
  let id = base;
  let i = 2;
  while (existingMap[id]) {
    id = `${base}_${i}`;
    i += 1;
  }
  return id;
}

function findStatblockIdByNameInsensitive(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const id in statblocks) {
    if (statblocks[id]?.name?.toLowerCase() === n) return id;
  }
  return null;
}

function findCharacterIdByNameInsensitive(name) {
  const n = String(name || "").trim().toLowerCase();
  if (!n) return null;
  for (const id in characters) {
    if (characters[id]?.name?.toLowerCase() === n) return id;
  }
  return null;
}

// ----- Populate datalist -----
function getFilteredCombatantNames() {
  const filter = String(document.getElementById("campaignFilter")?.value || "").trim().toLowerCase();
  const monsters = [];
  const players = [];

  Object.values(statblocks || {}).forEach(s => {
    if (!s?.name) return;
    const tags = getCampaignTags(s).map(t => t.toLowerCase());
    if (filter) {
      const match = tags.some(t => t.includes(filter));
      if (!match) return;
    }
    monsters.push(s.name);
  });

  Object.values(characters || {}).forEach(c => {
    if (!c?.name) return;
    const tags = getCampaignTags(c).map(t => t.toLowerCase());
    if (filter) {
      const match = tags.some(t => t.includes(filter));
      if (!match) return;
    }
    players.push(c.name);
  });

  monsters.sort((a, b) => a.localeCompare(b));
  players.sort((a, b) => a.localeCompare(b));

  return { monsters, players };
}

function populateNameDatalist() {
  const datalist = document.getElementById("combatantNameOptions");
  if (!datalist) return;

  const { monsters, players } = getFilteredCombatantNames();

  const playerOptions = players
    .map(n => `<option value="${escapeHtml(n)}" label="Player"></option>`)
    .join("");
  const monsterOptions = monsters
    .map(n => `<option value="${escapeHtml(n)}" label="Monster"></option>`)
    .join("");
  datalist.innerHTML = `${playerOptions}${monsterOptions}`;

  renderDetectHint();
}

function renderStatblockTemplateList() {
  const select = document.getElementById("statblockTemplateSelect");
  if (!select) return;
  const filter = String(document.getElementById("statblockCampaignFilter")?.value || "").trim();
  const current = select.value;
  const entries = Object.entries(statblocks || {})
    .filter(([, statblock]) => campaignMatchesFilter(statblock, filter))
    .map(([id, statblock]) => ({
      id,
      name: statblock?.name || id,
      isLocal: !!localStatblocks[id]
    }));

  entries.sort((a, b) => a.name.localeCompare(b.name));

  const options = ['<option value="">Load existing statblock...</option>']
    .concat(entries.map(entry => {
      const label = `${entry.name}${entry.isLocal ? " • Local" : " • Base"}`;
      return `<option value="${escapeHtml(entry.id)}">${escapeHtml(label)}</option>`;
    }));

  select.innerHTML = options.join("");
  if (current && entries.some(entry => entry.id === current)) {
    select.value = current;
  } else {
    select.value = "";
  }
}

function renderStatblockCampaignFilter() {
  const select = document.getElementById("statblockCampaignFilter");
  if (!select) return;

  const tags = new Set();
  Object.values(statblocks || {}).forEach(s => {
    getCampaignTags(s).forEach(t => tags.add(t));
  });

  const current = select.value || "";
  const options = ['<option value="">All Sources</option>']
    .concat(Array.from(tags).sort((a, b) => a.localeCompare(b))
      .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`));

  select.innerHTML = options.join("");
  if (current && Array.from(tags).includes(current)) {
    select.value = current;
  } else {
    select.value = "";
  }
}

function setStatblockEditorMode({ editingId = null, message = "", isError = false } = {}) {
  editingStatblockId = editingId;
  const btn = document.getElementById("saveStatblock");
  if (btn) btn.textContent = editingId ? "Update Monster" : "Save Monster";
  if (message) setStatblockStatus(message, isError);
}

function loadStatblockIntoForm(statblock, { useTemplate = false } = {}) {
  if (!statblock) return;
  const nameField = document.getElementById("sbName");
  const acField = document.getElementById("sbAC");
  const hpField = document.getElementById("sbHP");
  const initField = document.getElementById("sbInit");
  const speedField = document.getElementById("sbSpeed");
  const defensesField = document.getElementById("sbDefenses");
  const abilityScoresField = document.getElementById("sbAbilityScores");
  const proficienciesField = document.getElementById("sbProficiencies");
  const savesField = document.getElementById("sbSaves");
  const tagField = document.getElementById("sbTag");
  const traitsField = document.getElementById("sbTraits");
  const actionsField = document.getElementById("sbActions");
  const bonusActionsField = document.getElementById("sbBonusActions");
  const reactionsField = document.getElementById("sbReactions");
  const legendaryActionsField = document.getElementById("sbLegendaryActions");

  if (nameField) {
    nameField.value = useTemplate ? `${statblock.name || "New Statblock"} Copy` : (statblock.name || "");
  }
  if (acField) acField.value = statblock.ac ?? "";
  if (hpField) hpField.value = statblock.hp ?? "";
  if (initField) initField.value = statblock.initiative_bonus ?? "";
  if (speedField) speedField.value = statblock.speed ?? "";
  if (defensesField) defensesField.value = formatStatblockValue(statblock.defenses);
  if (abilityScoresField) abilityScoresField.value = formatStatblockValue(statblock.ability_scores);
  if (proficienciesField) proficienciesField.value = formatStatblockValue(statblock.proficiencies);
  if (savesField) savesField.value = formatStatblockValue(statblock.saves);
  if (tagField) tagField.value = statblock.campaign_tag ?? "";
  if (traitsField) traitsField.value = Array.isArray(statblock.traits) ? statblock.traits.join("\n") : "";
  if (actionsField) actionsField.value = Array.isArray(statblock.actions) ? statblock.actions.join("\n") : "";
  if (bonusActionsField) bonusActionsField.value = Array.isArray(statblock.bonus_actions) ? statblock.bonus_actions.join("\n") : "";
  if (reactionsField) reactionsField.value = Array.isArray(statblock.reactions) ? statblock.reactions.join("\n") : "";
  if (legendaryActionsField) legendaryActionsField.value = Array.isArray(statblock.legendary_actions) ? statblock.legendary_actions.join("\n") : "";
}

function renderCampaignFilter() {
  const select = document.getElementById("campaignFilter");
  if (!select) return;

  const tags = new Set();
  Object.values(statblocks || {}).forEach(s => {
    getCampaignTags(s).forEach(t => tags.add(t));
  });
  Object.values(characters || {}).forEach(c => {
    getCampaignTags(c).forEach(t => tags.add(t));
  });

  const current = select.value || "";
  const options = ['<option value="">All Sources</option>']
    .concat(Array.from(tags).sort((a, b) => a.localeCompare(b))
      .map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`));

  select.innerHTML = options.join("");
  if (current && Array.from(tags).includes(current)) {
    select.value = current;
  } else {
    select.value = "";
  }
}

function campaignMatchesFilter(entry, filter) {
  const f = String(filter || "").trim().toLowerCase();
  if (!f) return true;
  const tags = getCampaignTags(entry).map(t => t.toLowerCase());
  return tags.some(t => t.includes(f));
}

// UI listeners (safe if elements exist)
document.getElementById("combatantNameSelect")?.addEventListener("input", renderDetectHint);
document.getElementById("combatantCount")?.addEventListener("input", renderDetectHint);
document.getElementById("combatantCount")?.addEventListener("change", renderDetectHint);
document.getElementById("campaignFilter")?.addEventListener("change", () => {
  populateNameDatalist();
});
document.getElementById("statblockCampaignFilter")?.addEventListener("change", () => {
  renderStatblockTemplateList();
});

window.addEventListener("resize", () => {
  render();
});

document.getElementById("toggleAddPanel")?.addEventListener("click", () => {
  setActiveDrawer(null);
});

document.getElementById("toggleInfoPanel")?.addEventListener("click", () => {
  infoPanelVisible = !infoPanelVisible;
  saveState();
  applyInfoPanelState();
  renderInfoPanel();
});

document.getElementById("addCombatantForm")?.addEventListener("click", (event) => {
  if (event.target.closest("#toggleAddPanel")) return;
});

document.getElementById("toggleCreateStatblock")?.addEventListener("click", () => {
  setActiveDrawer(null);
});

document.getElementById("toggleHelpfulTips")?.addEventListener("click", () => {
  setActiveDrawer(null);
});

document.getElementById("toggleMonsterDetails")?.addEventListener("click", () => {
  setActiveDrawer(null);
});

document.getElementById("tabStatblock")?.addEventListener("click", () => {
  createPanelMode = "statblock";
  saveState();
  applyCreatePanelMode();
});

document.getElementById("tabPlayer")?.addEventListener("click", () => {
  createPanelMode = "player";
  saveState();
  applyCreatePanelMode();
});

document.getElementById("createStatblock")?.addEventListener("click", (event) => {
  if (event.target.closest("#toggleCreateStatblock")) return;
  if (event.target.closest(".panelTabs")) return;
});

document.addEventListener("click", (event) => {
  const quickAdd = event.target.closest("#quickAddPanel");
  if (quickAdd) {
    setActiveDrawer(activeDrawerId === "addCombatantForm" ? null : "addCombatantForm");
    return;
  }

  const quickCreate = event.target.closest("#quickCreatePanel");
  if (quickCreate) {
    setActiveDrawer(activeDrawerId === "createStatblock" ? null : "createStatblock");
    return;
  }

  const helpfulTips = event.target.closest("#helpfulTipsPanelBtn");
  if (helpfulTips) {
    setActiveDrawer(activeDrawerId === "helpfulTipsPanel" ? null : "helpfulTipsPanel");
    return;
  }

  const monsterDetailsBtn = event.target.closest(".monsterDetailsBtn");
  if (monsterDetailsBtn) {
    const combatantIndexRaw = monsterDetailsBtn.dataset.combatantIndex || "";
    const combatantIndex = combatantIndexRaw === "" ? null : parseInt(combatantIndexRaw, 10);
    if (combatantIndex !== null && !Number.isNaN(combatantIndex)) {
      const combatant = state.combatants[combatantIndex];
      const statblock = getStatblockForCombatant(combatant);
      const title = statblock?.name || monsterDetailsBtn.dataset.statblockName || "Monster Details";
      openMonsterDetailsDrawer(statblock, title);
      return;
    }
    const statblockId = monsterDetailsBtn.dataset.statblockId || "";
    const statblock = statblocks[statblockId] || null;
    const title = statblock?.name || monsterDetailsBtn.dataset.statblockName || "Monster Details";
    openMonsterDetailsDrawer(statblock, title);
    return;
  }

  if (event.target.closest("#drawerBackdrop")) {
    setActiveDrawer(null);
  }
});

document.getElementById("saveStatblock")?.addEventListener("click", () => {
  const name = document.getElementById("sbName")?.value?.trim() || "";
  const acRaw = document.getElementById("sbAC")?.value?.trim() || "";
  const hp = document.getElementById("sbHP")?.value?.trim() || "";
  const initRaw = document.getElementById("sbInit")?.value?.trim() || "";
  const speed = document.getElementById("sbSpeed")?.value?.trim() || "";
  const defenses = document.getElementById("sbDefenses")?.value?.trim() || "";
  const abilityScores = document.getElementById("sbAbilityScores")?.value?.trim() || "";
  const proficiencies = document.getElementById("sbProficiencies")?.value?.trim() || "";
  const saves = document.getElementById("sbSaves")?.value?.trim() || "";
  const tag = document.getElementById("sbTag")?.value?.trim() || "";
  const traitsRaw = document.getElementById("sbTraits")?.value || "";
  const actionsRaw = document.getElementById("sbActions")?.value || "";
  const bonusActionsRaw = document.getElementById("sbBonusActions")?.value || "";
  const reactionsRaw = document.getElementById("sbReactions")?.value || "";
  const legendaryActionsRaw = document.getElementById("sbLegendaryActions")?.value || "";

  if (!name) return setStatblockStatus("Name is required.", true);
  if (!acRaw) return setStatblockStatus("AC is required.", true);
  if (!hp) return setStatblockStatus("HP is required.", true);

  const ac = parseInt(acRaw, 10);
  const initiative_bonus = initRaw ? parseInt(initRaw, 10) : 0;
  const traits = traitsRaw
    .split("\n")
    .map(t => t.trim())
    .filter(Boolean);
  const actions = actionsRaw
    .split("\n")
    .map(a => a.trim())
    .filter(Boolean);
  const bonus_actions = bonusActionsRaw
    .split("\n")
    .map(a => a.trim())
    .filter(Boolean);
  const reactions = reactionsRaw
    .split("\n")
    .map(r => r.trim())
    .filter(Boolean);
  const legendary_actions = legendaryActionsRaw
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  if (Number.isNaN(ac)) return setStatblockStatus("AC must be a number.", true);
  if (initRaw && Number.isNaN(initiative_bonus)) return setStatblockStatus("Init bonus must be a number.", true);

  const statblock = { name, ac, hp };
  if (speed) statblock.speed = speed;
  if (initRaw) statblock.initiative_bonus = initiative_bonus;
  if (defenses) statblock.defenses = defenses;
  if (abilityScores) statblock.ability_scores = abilityScores;
  if (proficiencies) statblock.proficiencies = proficiencies;
  if (saves) statblock.saves = saves;
  if (tag) statblock.campaign_tag = tag;
  if (traits.length) statblock.traits = traits;
  if (actions.length) statblock.actions = actions;
  if (bonus_actions.length) statblock.bonus_actions = bonus_actions;
  if (reactions.length) statblock.reactions = reactions;
  if (legendary_actions.length) statblock.legendary_actions = legendary_actions;

  const existingId = findStatblockIdByNameInsensitive(name);
  const existingMap = { ...baseStatblocks, ...localStatblocks };
  let id = existingId;

  if (!id) {
    id = editingStatblockId || makeStatblockIdFromName(name, existingMap);
  }

  localStatblocks = { ...localStatblocks, [id]: statblock };
  saveLocalStatblocks(localStatblocks);
  refreshStatblocks();

  if (editingStatblockId) {
    setStatblockEditorMode({ editingId: id, message: `Updated "${name}".`, isError: false });
  } else {
    setStatblockEditorMode({ editingId: null, message: `Saved "${name}" locally.`, isError: false });
  }
});

document.getElementById("clearStatblockInputs")?.addEventListener("click", () => {
  const ids = [
    "sbName",
    "sbAC",
    "sbHP",
    "sbInit",
    "sbSpeed",
    "sbDefenses",
    "sbAbilityScores",
    "sbProficiencies",
    "sbSaves",
    "sbTag",
    "sbTraits",
    "sbActions",
    "sbBonusActions",
    "sbReactions",
    "sbLegendaryActions"
  ];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setStatblockEditorMode({ editingId: null, message: "Cleared inputs.", isError: false });
});

document.getElementById("exportLocalStatblocks")?.addEventListener("click", () => {
  const data = JSON.stringify(localStatblocks, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "statblocks.local.json";
  a.click();
  URL.revokeObjectURL(url);
  setStatblockStatus("Exported local statblocks.", false);
});

document.getElementById("clearLocalStatblocks")?.addEventListener("click", () => {
  if (!confirm("Clear all locally saved statblocks?")) return;
  localStatblocks = {};
  saveLocalStatblocks(localStatblocks);
  refreshStatblocks();
  setStatblockEditorMode({ editingId: null, message: "Cleared local statblocks.", isError: false });
});

document.getElementById("loadStatblockAsTemplate")?.addEventListener("click", () => {
  const select = document.getElementById("statblockTemplateSelect");
  const id = select?.value || "";
  if (!id) return setStatblockStatus("Choose a statblock to template.", true);
  const statblock = statblocks[id];
  if (!statblock) return setStatblockStatus("Statblock not found.", true);
  loadStatblockIntoForm(statblock, { useTemplate: true });
  setStatblockEditorMode({ editingId: null, message: `Loaded template from "${statblock.name}".`, isError: false });
});

document.getElementById("savePlayer")?.addEventListener("click", () => {
  const name = document.getElementById("pcName")?.value?.trim() || "";
  const klass = document.getElementById("pcClass")?.value?.trim() || "";
  const acRaw = document.getElementById("pcAC")?.value?.trim() || "";
  const defensesRaw = document.getElementById("pcDefenses")?.value?.trim() || "";
  const initRaw = document.getElementById("pcInit")?.value?.trim() || "";
  const tag = document.getElementById("pcTag")?.value?.trim() || "";

  if (!name) return setPlayerStatus("Name is required.", true);
  if (!klass) return setPlayerStatus("Class is required.", true);
  if (!acRaw) return setPlayerStatus("AC is required.", true);

  const ac = parseInt(acRaw, 10);
  const initiative_bonus = initRaw ? parseInt(initRaw, 10) : 0;

  if (Number.isNaN(ac)) return setPlayerStatus("AC must be a number.", true);
  if (initRaw && Number.isNaN(initiative_bonus)) return setPlayerStatus("Init bonus must be a number.", true);

  const character = { name, class: klass, ac, initiative_bonus };
  if (defensesRaw) character.defenses = defensesRaw;
  if (tag) character.campaign_tag = tag;

  const existingId = findCharacterIdByNameInsensitive(name);
  const existingMap = { ...baseCharacters, ...localCharacters };
  let id = existingId;

  if (id) {
    const ok = confirm(`"${name}" already exists. Overwrite it?`);
    if (!ok) return;
  } else {
    id = makeCharacterIdFromName(name, existingMap);
  }

  localCharacters = { ...localCharacters, [id]: character };
  saveLocalCharacters(localCharacters);
  refreshCharacters();

  setPlayerStatus(`Saved "${name}" locally.`, false);
});

document.getElementById("clearPlayerInputs")?.addEventListener("click", () => {
  const ids = ["pcName", "pcClass", "pcAC", "pcDefenses", "pcInit", "pcTag"];
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = "";
  });
  setPlayerStatus("Cleared inputs.", false);
});

document.getElementById("exportLocalPlayers")?.addEventListener("click", () => {
  const data = JSON.stringify(localCharacters, null, 2);
  const blob = new Blob([data], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "characters.local.json";
  a.click();
  URL.revokeObjectURL(url);
  setPlayerStatus("Exported local players.", false);
});

document.getElementById("clearLocalPlayers")?.addEventListener("click", () => {
  if (!confirm("Clear all locally saved players?")) return;
  localCharacters = {};
  saveLocalCharacters(localCharacters);
  refreshCharacters();
  setPlayerStatus("Cleared local players.", false);
});

// ----- Combat Saves -----
combatSaves = loadCombatSaves();
renderCombatSaveList();

document.getElementById("saveCombat")?.addEventListener("click", () => {
  const input = document.getElementById("saveName");
  const name = input?.value?.trim() || `Combat ${Object.keys(combatSaves).length + 1}`;
  const payload = getCombatSavePayload(name);
  combatSaves = { ...combatSaves, [name]: payload };
  saveCombatSaves(combatSaves);
  renderCombatSaveList(name);
  if (input) input.value = "";
  setCombatSaveStatus(`Saved "${name}".`, false);
});

document.getElementById("loadCombat")?.addEventListener("click", () => {
  const select = document.getElementById("saveSelect");
  const name = select?.value;
  if (!name || !combatSaves[name]) return setCombatSaveStatus("Choose a save to load.", true);
  if (!confirm(`Load "${name}"? This will replace the current combat.`)) return;
  const ok = applyCombatSavePayload(combatSaves[name]);
  if (!ok) return setCombatSaveStatus("Save data is invalid.", true);
  setCombatSaveStatus(`Loaded "${name}".`, false);
});

document.getElementById("deleteCombat")?.addEventListener("click", () => {
  const select = document.getElementById("saveSelect");
  const name = select?.value;
  if (!name || !combatSaves[name]) return setCombatSaveStatus("Choose a save to delete.", true);
  if (!confirm(`Delete "${name}"?`)) return;
  const { [name]: _, ...rest } = combatSaves;
  combatSaves = rest;
  saveCombatSaves(combatSaves);
  renderCombatSaveList();
  setCombatSaveStatus(`Deleted "${name}".`, false);
});

// export/import removed

// ----- Load JSON -----
fetch("statblocks.json")
  .then(res => res.json())
  .then(data => {
    baseStatblocks = data || {};
    localStatblocks = loadLocalStatblocks();
    refreshStatblocks();
  });

fetch("characters.json")
  .then(res => res.json())
  .then(data => {
    baseCharacters = data || {};
    localCharacters = loadLocalCharacters();
    refreshCharacters();
  });

// ----- Normalize loaded -----
normalizeLoadedState();

// ============================
// Add Combatant (Batch for Monsters)
// ============================
document.getElementById("addCombatantBtn").addEventListener("click", () => {
  const baseName = document.getElementById("combatantNameSelect").value.trim();
  const quickInitRaw = document.getElementById("quickInit")?.value ?? "";
  const quickHpRaw = document.getElementById("quickHP")?.value ?? "";
  const quickAcRaw = document.getElementById("quickAC")?.value ?? "";
  const quickTag = document.getElementById("quickTag")?.value?.trim() || "";
  const quickInit = parseInt(String(quickInitRaw).trim(), 10);
  const quickHp = parseInt(String(quickHpRaw).trim(), 10);
  const quickAc = parseInt(String(quickAcRaw).trim(), 10);

  const countRaw = document.getElementById("combatantCount")?.value ?? "1";
  let count = parseInt(String(countRaw).trim(), 10);
  if (Number.isNaN(count) || count < 1) count = 1;

  const autoRoll = document.getElementById("rollInitOnImport")?.checked ?? false;
  const sameInit = document.getElementById("batchSameInit")?.checked ?? true;

  if (!baseName) return alert("Enter a name");

  const beforeTurnRef = state.combatants[state.turnIndex] || null;
  const beforeSelectedRef = selectedIndex !== null ? state.combatants[selectedIndex] : null;

  const detected = detectTypeAndSourceIds(baseName, count);
  let type = detected.type;
  let statblockId = detected.statblockId;
  let characterId = detected.characterId;

  // Default fills based on detected source
  let baseHp = null;
  let baseAc = 10;
  let initBonus = 0;
  if (type === "monster") {
    if (statblockId && statblocks[statblockId]) {
      baseHp = parseInt(statblocks[statblockId].hp, 10) || 1;
      baseAc = parseInt(statblocks[statblockId].ac, 10) || 10;
      initBonus = monsterInitBonusFromStatblock(statblockId);
    }
  } else {
    if (characterId && characters[characterId]) {
      baseAc = parseInt(characters[characterId].ac, 10) || 10;
      initBonus = parseInt(characters[characterId].initiative_bonus, 10) || 0;
    }
    count = 1; // no batch for players
  }

  if (type === "monster") {
    baseHp = baseHp ?? 1;
  }
  if (!Number.isNaN(quickAc)) {
    baseAc = quickAc;
  }
  if (type === "monster" && !Number.isNaN(quickHp)) {
    baseHp = quickHp;
  }
  let statblockOverrides = null;
  if (type === "monster" && statblockId && statblocks[statblockId]) {
    const overrides = {};
    if (!Number.isNaN(quickAc)) overrides.ac = quickAc;
    if (!Number.isNaN(quickHp)) overrides.hp = quickHp;
    if (!Number.isNaN(quickInit)) overrides.initiative_bonus = quickInit;
    if (quickTag) overrides.campaign_tag = quickTag;
    if (Object.keys(overrides).length) statblockOverrides = overrides;
  }
  if (type === "monster" && !statblockId) {
    const existingMap = { ...baseStatblocks, ...localStatblocks };
    const id = makeStatblockIdFromName(baseName, existingMap);
    const statblock = {
      name: baseName,
      ac: baseAc,
      hp: baseHp
    };
    if (!Number.isNaN(quickInit)) {
      statblock.initiative_bonus = quickInit;
    }
    if (quickTag) {
      statblock.campaign_tag = quickTag;
    }
    localStatblocks = { ...localStatblocks, [id]: statblock };
    saveLocalStatblocks(localStatblocks);
    refreshStatblocks();
    statblockId = id;
  }

  // Determine batch initiative
  let batchInit = 0;

  if (autoRoll) {
    const bonus = Number.isNaN(quickInit) ? initBonus : quickInit;
    batchInit = rollD20() + bonus;
  } else if (!Number.isNaN(quickInit)) {
    batchInit = quickInit;
  }

  // Name numbering for monster batches
  let startN = 1;
  if (type === "monster" && count > 1) startN = nextNumberedName(baseName);

  for (let i = 0; i < count; i++) {
    const name = (type === "monster" && count > 1) ? `${baseName} ${startN + i}` : baseName;

    let initToUse = batchInit;

    if (!sameInit) {
      if (autoRoll) {
        const bonus = Number.isNaN(quickInit) ? initBonus : quickInit;
        initToUse = rollD20() + bonus;
      } else {
        initToUse = Number.isNaN(quickInit) ? 0 : quickInit;
      }
    }

    const combatant = {
      name,
      ac: baseAc,
      initiative: initToUse,
      type,
      statblock_id: type === "monster" ? statblockId : null,
      statblock_overrides: type === "monster" ? statblockOverrides : null,
      character_id: type === "player" ? characterId : null,
      conditions: [],
      is_npc: false,
      just_added: true
    };
    if (type === "monster") {
      combatant.current_hp = baseHp;
      combatant.max_hp = baseHp;
    }
    state.combatants.push(combatant);
  }

  state.combatants.sort((a, b) => b.initiative - a.initiative);
  preserveTurnAndSelectionAcrossSort(beforeTurnRef, beforeSelectedRef);

  saveState();
  render();

  // Clear form
  document.getElementById("combatantNameSelect").value = "";
  if (document.getElementById("combatantCount")) document.getElementById("combatantCount").value = "1";
  if (document.getElementById("quickInit")) document.getElementById("quickInit").value = "";
  if (document.getElementById("quickHP")) document.getElementById("quickHP").value = "";
  if (document.getElementById("quickAC")) document.getElementById("quickAC").value = "";
  if (document.getElementById("quickTag")) document.getElementById("quickTag").value = "";
  renderDetectHint();
});

// ============================
// Import JSON (local storage restore)
// ============================
function setImportJsonStatus(message, isError) {
  const el = document.getElementById("importJsonStatus");
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "#ef5350" : "";
}

function coerceImportObject(raw) {
  if (!raw) return null;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
}

function normalizeImportPayload(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (Array.isArray(raw)) {
    const mapped = {};
    raw.forEach(entry => {
      if (entry && typeof entry === "object" && "key" in entry) {
        mapped[entry.key] = entry.value;
      }
    });
    return mapped;
  }
  if (raw.localStorage && typeof raw.localStorage === "object" && !Array.isArray(raw.localStorage)) {
    return raw.localStorage;
  }
  return raw;
}

function applyImportedData(raw) {
  const payload = normalizeImportPayload(raw);
  if (!payload) return { ok: false, message: "No data found in JSON payload." };

  const statblocksData = coerceImportObject(payload[LOCAL_STATBLOCKS_KEY])
    || coerceImportObject(payload.statblocksLocal)
    || coerceImportObject(payload.localStatblocks);
  const charactersData = coerceImportObject(payload[LOCAL_CHARACTERS_KEY])
    || coerceImportObject(payload.charactersLocal)
    || coerceImportObject(payload.localCharacters);
  const combatStateData = coerceImportObject(payload.combatState);
  const combatSavesData = coerceImportObject(payload[COMBAT_SAVES_KEY])
    || coerceImportObject(payload.combatSaves);

  const imported = [];

  if (statblocksData) {
    localStatblocks = statblocksData;
    saveLocalStatblocks(localStatblocks);
    refreshStatblocks();
    imported.push("statblocks");
  }

  if (charactersData) {
    localCharacters = charactersData;
    saveLocalCharacters(localCharacters);
    refreshCharacters();
    imported.push("players");
  }

  if (combatSavesData) {
    combatSaves = combatSavesData;
    saveCombatSaves(combatSaves);
    renderCombatSaveList();
    imported.push("combat saves");
  }

  if (combatStateData && Array.isArray(combatStateData.combatants)) {
    state = {
      round: parseInt(combatStateData.round, 10) || 1,
      turnIndex: parseInt(combatStateData.turnIndex, 10) || 0,
      combatants: combatStateData.combatants
    };
    saveState();
    render();
    imported.push("combat state");
  }

  if (!imported.length) {
    return { ok: false, message: "No compatible local storage data found." };
  }

  return { ok: true, message: `Imported ${imported.join(", ")}.` };
}

document.getElementById("importJsonBtn")?.addEventListener("click", async () => {
  const fileInput = document.getElementById("importJsonFile");
  const textInput = document.getElementById("importJsonText");
  if (!textInput) return;
  const file = fileInput?.files?.[0] || null;
  const text = file ? await file.text() : textInput.value.trim();

  if (!text) return setImportJsonStatus("Paste JSON or choose a file to import.", true);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return setImportJsonStatus("Invalid JSON. Check the file or pasted text.", true);
  }

  const result = applyImportedData(parsed);
  setImportJsonStatus(result.message, !result.ok);
});

document.getElementById("importJsonFile")?.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const textInput = document.getElementById("importJsonText");
  if (!textInput) return;
  textInput.value = await file.text();
  setImportJsonStatus(`Loaded ${file.name}.`, false);
});

document.getElementById("clearImportJson")?.addEventListener("click", () => {
  const textInput = document.getElementById("importJsonText");
  const fileInput = document.getElementById("importJsonFile");
  if (textInput) textInput.value = "";
  if (fileInput) fileInput.value = "";
  setImportJsonStatus("Cleared import input.", false);
});

// ============================
// Import PCs
// ============================
function addPlayerFromCharacter(characterId, characterData, { rollInit } = { rollInit: false }) {
  const s = characterData;
  if (!s || !s.name) return;
  if (hasCombatantNamed(s.name)) return;

  const bonus = parseInt(s.initiative_bonus, 10) || 0;
  const init = rollInit ? (rollD20() + bonus) : bonus;

  state.combatants.push({
    name: s.name,
    ac: parseInt(s.ac, 10) || 10,
    initiative: init,
    type: "player",
    statblock_id: null,
    character_id: characterId,
    conditions: [],
    is_npc: false,
    just_added: true
  });
}

document.getElementById("importPlayers")?.addEventListener("click", () => {
  const rollInit = document.getElementById("rollInitOnImport")?.checked ?? false;
  const ids = Object.keys(characters || {});
  if (!ids.length) return alert("No characters loaded yet. Try again in a moment.");
  const filter = document.getElementById("campaignFilter")?.value || "";

  const beforeTurnRef = state.combatants[state.turnIndex] || null;
  const beforeSelectedRef = selectedIndex !== null ? state.combatants[selectedIndex] : null;

  ids.forEach(id => {
    const c = characters[id];
    if (!campaignMatchesFilter(c, filter)) return;
    addPlayerFromCharacter(id, c, { rollInit });
  });

  state.combatants.sort((a, b) => b.initiative - a.initiative);
  preserveTurnAndSelectionAcrossSort(beforeTurnRef, beforeSelectedRef);

  saveState();
  render();
});

// ============================
// Remove Combatant
// ============================
function removeCombatant(index) {
  state.combatants.splice(index, 1);

  if (state.turnIndex >= state.combatants.length) state.turnIndex = 0;

  if (selectedIndex === index) selectedIndex = null;
  else if (selectedIndex !== null && selectedIndex > index) selectedIndex--;

  saveState();
  render();
}

// ============================
// HP adjust in tracker
// ============================
function getHpAmount(index) {
  const el = document.getElementById(`hpAdj${index}`);
  const val = parseInt(el?.value, 10);
  return Number.isNaN(val) ? null : val;
}

function applyDamage(index) {
  const val = getHpAmount(index);
  if (!val) return;
  if (state.combatants[index]?.type !== "monster") return;

  state.combatants[index].current_hp -= val;
  if (state.combatants[index].current_hp < 0) state.combatants[index].current_hp = 0;

  saveState();
  render();
}

function applyHeal(index) {
  const val = getHpAmount(index);
  if (!val) return;
  if (state.combatants[index]?.type !== "monster") return;

  const c = state.combatants[index];
  c.current_hp += val;
  if (c.current_hp > c.max_hp) c.current_hp = c.max_hp;

  saveState();
  render();
}

// ============================
// Conditions
// ============================
function addCondition(index) {
  const select = document.getElementById("conditionSelect");
  const customInput = document.getElementById("customCondition");
  const durationInput = document.getElementById("conditionDuration");

  let name = select?.value || "";
  const custom = customInput?.value?.trim() || "";
  if (custom) name = custom;

  name = String(name || "").trim();
  if (!name) return;

  let duration = parseInt(durationInput?.value, 10);
  if (Number.isNaN(duration)) duration = null;

  state.combatants[index].conditions.push({ name, duration });

  saveState();
  render();

  if (customInput) customInput.value = "";
  if (durationInput) durationInput.value = "";
  if (select) select.value = "";
}

function removeCondition(combatIndex, condIndex) {
  state.combatants[combatIndex].conditions.splice(condIndex, 1);
  saveState();
  render();
}

// ============================
// Initiative set in panel
// ============================
function panelSetInit(index) {
  const val = parseInt(document.getElementById("panelInitVal")?.value, 10);
  if (Number.isNaN(val)) return;

  const beforeTurnRef = state.combatants[state.turnIndex] || null;
  const beforeSelectedRef = state.combatants[index] || null;

  state.combatants[index].initiative = val;
  state.combatants.sort((a, b) => b.initiative - a.initiative);

  preserveTurnAndSelectionAcrossSort(beforeTurnRef, beforeSelectedRef);

  saveState();
  render();
}

function setNpcFlag(index, isNpc) {
  const c = state.combatants[index];
  if (!c) return;
  c.is_npc = !!isNpc;
  saveState();
  render();
}

// ============================
// Turn Tracking (auto-decrement timed conditions)
// Decrement happens on the combatant whose turn is ending.
// ============================
document.getElementById("nextTurn").addEventListener("click", () => {
  if (state.combatants.length === 0) return;

  const current = state.combatants[state.turnIndex];
  if (current?.conditions?.length) {
    current.conditions = current.conditions.filter(cond => {
      if (cond.duration === null) return true;
      cond.duration -= 1;
      return cond.duration !== 0;
    });
  }

  state.turnIndex++;
  if (state.turnIndex >= state.combatants.length) {
    state.turnIndex = 0;
    state.round++;
  }

  saveState();
  render();
});

document.getElementById("prevTurn").addEventListener("click", () => {
  if (state.combatants.length === 0) return;

  state.turnIndex--;
  if (state.turnIndex < 0) {
    state.turnIndex = state.combatants.length - 1;
    if (state.round > 1) state.round--;
  }

  saveState();
  render();
});

// ============================
// Reset Combat
// ============================
const resetCombatButton = document.getElementById("resetCombat");
let resetConfirmTimer = null;
let resetTouchHandled = false;

function clearResetConfirmation() {
  if (!resetCombatButton) return;
  resetCombatButton.dataset.confirmReset = "false";
  resetCombatButton.textContent = "Reset Combat";
}

function promptResetConfirmation() {
  if (!resetCombatButton) return;
  resetCombatButton.dataset.confirmReset = "true";
  resetCombatButton.textContent = "Tap again to reset";
  if (resetConfirmTimer) clearTimeout(resetConfirmTimer);
  resetConfirmTimer = setTimeout(() => {
    clearResetConfirmation();
    resetConfirmTimer = null;
  }, 4000);
}

function handleResetCombat(event) {
  if (event) event.preventDefault();
  if (resetCombatButton.dataset.confirmReset !== "true") {
    promptResetConfirmation();
    return;
  }
  if (resetConfirmTimer) clearTimeout(resetConfirmTimer);
  resetConfirmTimer = null;
  clearResetConfirmation();
  state = { round: 1, turnIndex: 0, combatants: [] };
  selectedIndex = null;
  infoPanelVisible = true;
  addPanelCollapsed = false;
  saveState();
  setActiveDrawer(null);
  render();
  applyAddPanelState();
  renderDetectHint();
}

if (resetCombatButton) {
  resetCombatButton.addEventListener("touchend", (event) => {
    resetTouchHandled = true;
    handleResetCombat(event);
    setTimeout(() => {
      resetTouchHandled = false;
    }, 400);
  });
  resetCombatButton.addEventListener("click", (event) => {
    if (resetTouchHandled) {
      resetTouchHandled = false;
      return;
    }
    handleResetCombat(event);
  });
}

// ============================
// Render Combat List (Condensed + HP adjust inline)
// ============================
function selectCombatant(index) {
  selectedIndex = index;
  if (!infoPanelVisible) {
    infoPanelVisible = true;
    saveState();
    applyInfoPanelState();
  }
  renderInfoPanel();
}

function getGroupBaseName(combatant) {
  if (!combatant) return "";
  if (combatant.type === "monster" && combatant.statblock_id) {
    return statblocks[combatant.statblock_id]?.name || stripNumberedSuffix(combatant.name);
  }
  if (combatant.type === "player" && combatant.character_id) {
    return characters[combatant.character_id]?.name || stripNumberedSuffix(combatant.name);
  }
  return stripNumberedSuffix(combatant.name);
}

function isFocusTurnMode() {
  return window.matchMedia("(max-width: 1199px)").matches;
}

function getFocusIndices(total, centerIndex, range = 2) {
  const count = Math.min(total, range * 2 + 1);
  if (!total) return new Set();
  if (count >= total) return new Set(Array.from({ length: total }, (_, i) => i));
  const set = new Set();
  for (let offset = -range; offset <= range; offset++) {
    const idx = (centerIndex + offset + total) % total;
    set.add(idx);
  }
  return set;
}

function render() {
  const list = document.getElementById("combatList");
  list.innerHTML = "";
  let hasNew = false;
  let renderedCount = 0;
  const renderedItems = [];

  const focusMode = isFocusTurnMode();
  const focusSet = focusMode ? getFocusIndices(state.combatants.length, state.turnIndex, 2) : null;

  const groups = [];
  let lastGroup = null;

  state.combatants.forEach((c, index) => {
    const baseName = getGroupBaseName(c);
    const key = [
      c.type,
      c.is_npc ? "npc" : "pc",
      c.statblock_id || "",
      c.character_id || "",
      baseName,
      c.initiative
    ].join("|");

    if (lastGroup && lastGroup.key === key) {
      lastGroup.items.push({ c, index });
      lastGroup.indices.push(index);
      if (c.just_added) lastGroup.hasNew = true;
      if (index === state.turnIndex) lastGroup.hasActive = true;
    } else {
      lastGroup = {
        key,
        name: baseName || c.name,
        initiative: c.initiative,
        type: c.type,
        isNpc: !!c.is_npc,
        hasNew: !!c.just_added,
        hasActive: index === state.turnIndex,
        items: [{ c, index }],
        indices: [index]
      };
      groups.push(lastGroup);
    }
  });

  groups.forEach(group => {
    if (focusSet && !group.indices.some(i => focusSet.has(i))) return;
    if (group.items.length === 1) {
      const { c, index } = group.items[0];
      const li = document.createElement("li");
      li.className = "combatant";
      li.classList.add(c.type);
      if (c.is_npc) li.classList.add("npc");
      if (index === state.turnIndex) li.classList.add("active");
      if (c.just_added) {
        li.classList.add("justAdded");
        hasNew = true;
      }

      const safeCombatantName = escapeHtml(c.name);
      li.innerHTML = `
        <div class="rowTop">
          <div class="rowLeft">
            <strong>${safeCombatantName}</strong>

            <span class="pillNum init">Init ${c.initiative}</span>
            <span class="pillNum ac">AC ${c.ac}</span>

          </div>

          <div class="rowRight">
            <button class="miniBtn dangerMini" onclick="event.stopPropagation(); removeCombatant(${index})">✕</button>
          </div>
        </div>

        ${c.type === "monster" ? `
          <div class="rowBottom">
            <span class="pillNum hp">HP ${c.current_hp}</span>
            <input class="hpAdj" type="number" id="hpAdj${index}" placeholder="Amt" onclick="event.stopPropagation();">
            <button class="miniBtn heal"
              onclick="event.stopPropagation(); applyHeal(${index})">
              +
            </button>
            <button class="miniBtn damage"
              onclick="event.stopPropagation(); applyDamage(${index})">
              -
            </button>
          </div>
        ` : ``}

        ${c.conditions?.length ? `
          <div class="condRow">
            ${c.conditions.map(cd => {
              const label = escapeHtml(cd.name) + (cd.duration !== null ? ` (${cd.duration})` : "");
              const cls = conditionClass(cd.name);
              return `<span class="condPill ${cls}">${label}</span>`;
            }).join("")}
          </div>
        ` : ``}
      `;

      li.onclick = () => selectCombatant(index);

      list.appendChild(li);
      renderedCount += 1;
      renderedItems.push(li);
      return;
    }

    if (group.hasNew) hasNew = true;

    const groupLi = document.createElement("li");
    groupLi.className = "combatant combatGroup";
    groupLi.classList.add(group.type);
    if (group.isNpc) groupLi.classList.add("npc");
    if (group.hasActive) groupLi.classList.add("active");
    if (group.hasNew) groupLi.classList.add("justAdded");

    const count = group.items.length;
    const safeName = escapeHtml(group.name);
    const groupItemsHtml = group.items.map((item, idx) => {
      const c = item.c;
      const index = item.index;
      const unitLabel = `${idx + 1}/${count}`;
      const activeClass = index === state.turnIndex ? " active" : "";
      const addedClass = c.just_added ? " justAdded" : "";
      const hpControls = group.type === "monster" ? `
              <span class="pillNum hp">HP ${c.current_hp}</span>
              <div class="groupItemControls" onclick="event.stopPropagation();">
                <input class="hpAdj" type="number" id="hpAdj${index}" placeholder="Amt">
                <button class="miniBtn heal" onclick="applyHeal(${index})">+</button>
                <button class="miniBtn damage" onclick="applyDamage(${index})">-</button>
              </div>
      ` : "";
      return `
        <div class="groupItem${activeClass}${addedClass}" onclick="selectCombatant(${index})">
          <div class="groupItemTop">
            <div class="rowLeft">
              <span class="pillNum unit">${unitLabel}</span>
              ${hpControls}
            </div>
            <div class="rowRight">
              <button class="miniBtn dangerMini" onclick="event.stopPropagation(); removeCombatant(${index})">✕</button>
            </div>
          </div>
          ${c.conditions?.length ? `
            <div class="condRow">
              ${c.conditions.map(cd => {
                const label = escapeHtml(cd.name) + (cd.duration !== null ? ` (${cd.duration})` : "");
                const cls = conditionClass(cd.name);
                return `<span class="condPill ${cls}">${label}</span>`;
              }).join("")}
            </div>
          ` : ``}
        </div>
      `;
    }).join("");

    const groupAc = group.items[0]?.c?.ac ?? "-";

    groupLi.innerHTML = `
      <div class="groupHeader">
        <div class="rowLeft">
          <strong>${safeName}</strong>
          <span class="pillNum count">x${count}</span>
          <span class="pillNum init">Init ${group.initiative}</span>
          <span class="pillNum ac">AC ${groupAc}</span>
        </div>
        <div class="rowRight">
          ${group.hasActive ? `<span class="turnTag">Turn</span>` : ``}
        </div>
      </div>
      <div class="groupItems">
        ${groupItemsHtml}
      </div>
    `;

    list.appendChild(groupLi);
    renderedCount += 1;
    renderedItems.push(groupLi);
  });

  const isWide = window.matchMedia("(min-width: 1200px)").matches;
  if (isWide) {
    list.classList.add("twoColumn");
    const rows = Math.max(1, Math.ceil(renderedCount / 2));
    list.style.gridTemplateRows = `repeat(${rows}, auto)`;
    list.style.gridAutoFlow = "column";
    renderedItems.forEach((item, idx) => {
      item.style.gridColumn = "";
      item.style.gridRow = "";
    });
  } else {
    list.classList.remove("twoColumn");
    list.style.gridTemplateRows = "";
    list.style.gridAutoFlow = "";
    renderedItems.forEach(item => {
      item.style.gridColumn = "";
      item.style.gridRow = "";
    });
  }

  document.getElementById("round").textContent = "Round: " + state.round;

  renderInfoPanel();

  if (hasNew) {
    if (clearNewFlagTimer) clearTimeout(clearNewFlagTimer);
    clearNewFlagTimer = setTimeout(() => {
      state.combatants.forEach(c => { c.just_added = false; });
      saveState();
    }, 260);
  }
}

// ============================
// Render Info Panel
// ============================
function renderInfoPanel() {
  const infoPanel = document.getElementById("infoPanel");
  const panel = document.getElementById("panelContent");
  const hint = document.getElementById("panelHint");

  if (!infoPanelVisible) return;

  infoPanel.classList.remove("panel-player", "panel-monster", "panel-npc");

  if (selectedIndex === null || !state.combatants[selectedIndex]) {
    panel.textContent = "";
    panel.style.color = "";
    if (hint) hint.style.display = "block";
    infoPanel.style.borderColor = "rgba(255,255,255,0.12)";
    infoPanel.style.backgroundColor = "#1b2026";
    return;
  }

  if (hint) hint.style.display = "none";
  panel.style.color = "";

  const c = state.combatants[selectedIndex];
  const panelTheme = c.is_npc
    ? "panel-npc"
    : c.type === "monster"
      ? "panel-monster"
      : "panel-player";
  infoPanel.classList.add(panelTheme);
  const safeName = escapeHtml(c.name);
  const initBonus = (() => {
    if (c.type === "monster") {
      const b = getStatblockForCombatant(c);
      return b?.initiative_bonus ?? "-";
    }
    const s = c.character_id ? characters[c.character_id] : null;
    return s?.initiative_bonus ?? "-";
  })();

  const rightHtml = `
    <div class="infoControls">
      <div class="panelCard panelMini">
        <strong>Initiative</strong>
        <div class="inlineRow">
          <input type="number" id="panelInitVal" value="${c.initiative}" style="width:70px;">
          <button onclick="panelSetInit(${selectedIndex})">Set</button>
        </div>
        <div class="subtle" style="margin-top:6px;">Bonus ${escapeHtml(initBonus)}</div>
      </div>

      <div class="panelCard panelMini">
        <strong>Conditions</strong>

        ${c.conditions.length ? `
          <div class="condRow" style="margin-top:6px;">
            ${c.conditions.map((cond, i) => `
              <span class="condPill ${conditionClass(cond.name)}">
                ${escapeHtml(cond.name)}${cond.duration !== null ? ` (${cond.duration})` : ""}
                <button class="miniBtn dangerMini" onclick="removeCondition(${selectedIndex},${i})">✕</button>
              </span>
            `).join("")}
          </div>
        ` : `<div class="subtle" style="margin-top:6px;">None</div>`}

        <div class="inlineRow">
          <select id="conditionSelect">
            <option value="">+</option>
            <option>Blinded</option><option>Charmed</option><option>Deafened</option>
            <option>Frightened</option><option>Grappled</option><option>Incapacitated</option>
            <option>Paralyzed</option><option>Petrified</option><option>Poisoned</option>
            <option>Prone</option><option>Rage</option><option>Restrained</option><option>Stunned</option>
            <option>Unconscious</option>
          </select>

          <input type="text" id="customCondition" placeholder="Custom">
          <input type="number" id="conditionDuration" placeholder="Rnd">
          <button onclick="addCondition(${selectedIndex})">Add</button>
        </div>
      </div>

    </div>
  `;

  let leftHtml = "";

  if (c.type === "monster") {
    const b = getStatblockForCombatant(c);

    if (b) {
      const defenses = formatDefenses(
        b.defenses ?? b.resistances ?? b.damage_resistances ?? b.resistance
      );
      const abilityScores = formatStatblockValue(b.ability_scores ?? b.abilityScores ?? b.abilities);
      const saves = formatStatblockValue(b.saves ?? b.saving_throws ?? b.savingThrows);
      const proficiencies = formatStatblockValue(b.proficiencies ?? b.skills ?? b.skill_proficiencies);
      const defensesHtml =
        defenses && defenses !== "-"
          ? `<div class="infoStat"><span class="infoLabel infoLabelPlain">Defenses</span> — ${escapeHtml(defenses)}</div>`
          : "";
      const abilityScoresHtml = abilityScores
        ? `<div class="infoStat"><span class="infoLabel infoLabelPlain">Ability Scores</span> — ${escapeHtml(abilityScores)}</div>`
        : "";
      const savesHtml = saves
        ? `<div class="infoStat"><span class="infoLabel infoLabelPlain">Saves</span> — ${escapeHtml(saves)}</div>`
        : "";
      const proficienciesHtml = proficiencies
        ? `<div class="infoStat"><span class="infoLabel infoLabelPlain">Proficiencies</span> — ${escapeHtml(proficiencies)}</div>`
        : "";
      leftHtml = `
        <div class="infoStack">
          <div class="infoHead">
            <div class="infoHeadRow">
              <div class="infoName">${safeName}</div>
              <div class="infoMeta">(${c.is_npc ? "npc" : "monster"})</div>
              <label class="inlineCheck">
                <input type="checkbox" id="panelNpcToggle" ${c.is_npc ? "checked" : ""} onchange="setNpcFlag(${selectedIndex}, this.checked)">
                NPC
              </label>
              <button class="secondary monsterDetailsBtn" type="button" data-statblock-id="${escapeHtml(c.statblock_id)}" data-combatant-index="${selectedIndex}" data-statblock-name="${escapeHtml(b.name || safeName)}">Details</button>
            </div>
            <div class="infoStats">
              <div class="infoStat"><span class="infoLabel infoLabelPlain">AC</span> — ${escapeHtml(b.ac)}</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">HP</span> — ${escapeHtml(b.hp)}</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Speed</span> — ${escapeHtml(b.speed || "-")}</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Init Bonus</span> — ${escapeHtml(b.initiative_bonus ?? "-")}</div>
              ${abilityScoresHtml}
              ${savesHtml}
              ${defensesHtml}
              ${proficienciesHtml}
            </div>
            ${rightHtml}
          </div>
        </div>
      `;
    } else {
      leftHtml = `
        <div class="infoStack">
          <div class="infoHead">
            <div class="infoHeadRow">
              <div class="infoName">${safeName}</div>
              <div class="infoMeta">(${c.is_npc ? "npc" : "monster"})</div>
              <label class="inlineCheck">
                <input type="checkbox" id="panelNpcToggle" ${c.is_npc ? "checked" : ""} onchange="setNpcFlag(${selectedIndex}, this.checked)">
                NPC
              </label>
            </div>
            <div class="infoStats">
              <div class="infoStat"><span class="infoLabel infoLabelPlain">AC</span> — -</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">HP</span> — -</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Speed</span> — -</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Init Bonus</span> — -</div>
            </div>
            ${rightHtml}
          </div>
          <div class="infoBody"><div class="emptyState">No statblock available.</div></div>
        </div>
      `;
    }

    if (c.is_npc) {
      infoPanel.style.borderColor = "#5ac878";
      infoPanel.style.backgroundColor = "#13261b";
    } else {
      infoPanel.style.borderColor = "#ff7a8e";
      infoPanel.style.backgroundColor = "#241216";
    }
  } else {
    const s = c.character_id ? characters[c.character_id] : null;

    if (s) {
      const defenses = formatDefenses(
        s.defenses ?? s.resistances ?? s.damage_resistances ?? s.resistance
      );
      const defensesHtml =
        defenses && defenses !== "-"
          ? `<div class="infoStat"><span class="infoLabel infoLabelPlain">Defenses</span> — ${escapeHtml(defenses)}</div>`
          : "";
      const classMetaHtml = c.is_npc
        ? ""
        : `<div class="infoMeta"><span class="infoLabel">Class:</span> ${escapeHtml(s.class || "-")}</div>`;
      leftHtml = `
        <div class="infoStack">
          <div class="infoHead">
            <div class="infoHeadRow">
              <div class="infoName">${safeName}</div>
              <div class="infoMeta">(player)</div>
              ${classMetaHtml}
              <label class="inlineCheck">
                <input type="checkbox" id="panelNpcToggle" ${c.is_npc ? "checked" : ""} onchange="setNpcFlag(${selectedIndex}, this.checked)">
                NPC
              </label>
            </div>
            <div class="infoStats">
              <div class="infoStat"><span class="infoLabel infoLabelPlain">AC</span> — ${escapeHtml(s.ac)}</div>
              ${defensesHtml}
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Initiative</span> — ${escapeHtml(c.initiative)}</div>
            </div>
            ${rightHtml}
          </div>
        </div>
      `;
    } else {
      leftHtml = `
        <div class="infoStack">
          <div class="infoHead">
            <div class="infoHeadRow">
              <div class="infoName">${safeName}</div>
              <div class="infoMeta">(player)</div>
              <label class="inlineCheck">
                <input type="checkbox" id="panelNpcToggle" ${c.is_npc ? "checked" : ""} onchange="setNpcFlag(${selectedIndex}, this.checked)">
                NPC
              </label>
            </div>
            <div class="infoStats">
              <div class="infoStat"><span class="infoLabel infoLabelPlain">AC</span> — -</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Defenses</span> — -</div>
              <div class="infoStat"><span class="infoLabel infoLabelPlain">Initiative</span> — ${escapeHtml(c.initiative)}</div>
            </div>
            ${rightHtml}
          </div>
          <div class="infoBody"><div class="emptyState">No player sheet available.</div></div>
        </div>
      `;
    }

    if (c.is_npc) {
      infoPanel.style.borderColor = "#5ac878";
      infoPanel.style.backgroundColor = "#13261b";
    } else {
      infoPanel.style.borderColor = "#6ac4ff";
      infoPanel.style.backgroundColor = "#10222e";
    }
  }

  panel.innerHTML = leftHtml;
}

// ============================
// Initial Render
// ============================
render();
applyAddPanelState();
applyInfoPanelState();
applyCreateStatblockState();
applyCreatePanelMode();
renderDetectHint();



