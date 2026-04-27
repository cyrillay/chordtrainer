// Manages which progressions are enabled/disabled and custom user progressions.
// Persists to localStorage.

import { PROGRESSIONS } from './progressions.js';
import { LS } from '../core/constants.js';
import { escapeHtml as esc } from '../core/dom.js';

const MAX_CUSTOM = 10;

function loadDisabled() {
  try { return new Set(JSON.parse(localStorage.getItem(LS.DISABLED_PROGS) || '[]')); }
  catch { return new Set(); }
}

function saveDisabled(set) {
  localStorage.setItem(LS.DISABLED_PROGS, JSON.stringify([...set]));
}

function loadCustom() {
  try { return JSON.parse(localStorage.getItem(LS.CUSTOM_PROGS) || '[]'); }
  catch { return []; }
}

function saveCustom(arr) {
  localStorage.setItem(LS.CUSTOM_PROGS, JSON.stringify(arr));
}

export function getActiveProgressions() {
  const disabled = loadDisabled();
  return [...PROGRESSIONS, ...loadCustom()].filter(p => !disabled.has(p.name));
}

// ---- Modal state ----

let editingCustomIndex = -1;

// ---- Init ----

export function initProgressionModal(onChangeCb) {
  document.getElementById('manageProgressionsBtn').addEventListener('click', openModal);
  document.getElementById('progModalClose').addEventListener('click', () => closeModal(onChangeCb));
  document.getElementById('progModalOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal(onChangeCb);
  });
  document.getElementById('progSelectAll').addEventListener('click',   () => setAllEnabled(true));
  document.getElementById('progUnselectAll').addEventListener('click', () => setAllEnabled(false));
  document.getElementById('addCustomForm').addEventListener('submit',  handleAddCustom);
}

function openModal() {
  editingCustomIndex = -1;
  renderModal();
  document.getElementById('progModalOverlay').style.display = 'flex';
}

function closeModal(onChangeCb) {
  editingCustomIndex = -1;
  document.getElementById('progModalOverlay').style.display = 'none';
  onChangeCb();
}

// ---- Render ----

function renderModal() {
  const disabled = loadDisabled();

  const listEl = document.getElementById('progBuiltinList');
  listEl.innerHTML = PROGRESSIONS.map(p => {
    const checked = disabled.has(p.name) ? '' : 'checked';
    return `<label class="prog-item">
      <input type="checkbox" class="prog-cb" data-name="${esc(p.name)}" ${checked}>
      <span class="prog-item-name">${esc(p.name)}</span>
      <span class="prog-item-tokens">${esc(p.tokens.join(' '))}</span>
    </label>`;
  }).join('');
  wireCheckboxes(listEl);

  const custom = loadCustom();
  renderCustomList(custom);
  updateCustomCount(custom.length);
}

function renderCustomList(custom) {
  const el = document.getElementById('progCustomList');
  const disabled = loadDisabled();

  if (custom.length === 0) {
    el.innerHTML = '<div class="prog-empty">No custom progressions yet.</div>';
    return;
  }

  el.innerHTML = custom.map((p, i) => {
    if (i === editingCustomIndex) {
      return `<div class="prog-item prog-item-editing">
        <input type="text" class="prog-input prog-edit-name" value="${esc(p.name)}" maxlength="50" autocomplete="off">
        <input type="text" class="prog-input prog-input-wide prog-edit-tokens" value="${esc(p.tokens.join(' '))}" autocomplete="off">
        <button type="button" class="prog-edit-save" data-index="${i}" title="Save">✓</button>
        <button type="button" class="prog-edit-cancel" title="Cancel">✗</button>
      </div>`;
    }
    const checked = disabled.has(p.name) ? '' : 'checked';
    return `<label class="prog-item">
      <input type="checkbox" class="prog-cb" data-name="${esc(p.name)}" ${checked}>
      <span class="prog-item-name">${esc(p.name)}</span>
      <span class="prog-item-tokens">${esc(p.tokens.join(' '))}</span>
      <button type="button" class="prog-edit-btn" data-index="${i}" title="Edit">✎</button>
      <button type="button" class="prog-delete-btn" data-index="${i}" title="Delete">×</button>
    </label>`;
  }).join('');

  wireCheckboxes(el);

  el.querySelectorAll('.prog-edit-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      editingCustomIndex = parseInt(btn.dataset.index, 10);
      renderCustomList(loadCustom());
      el.querySelector('.prog-edit-name')?.focus();
    });
  });

  el.querySelectorAll('.prog-edit-cancel').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      editingCustomIndex = -1;
      renderCustomList(loadCustom());
    });
  });

  el.querySelectorAll('.prog-edit-save').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.index, 10);
      const nameInput  = el.querySelector('.prog-edit-name');
      const tokensInput = el.querySelector('.prog-edit-tokens');
      const newName = nameInput.value.trim();
      const newTokensRaw = tokensInput.value.trim();

      if (!newName || !newTokensRaw) return;

      const arr = loadCustom();
      const oldName = arr[idx].name;
      const otherNames = [
        ...PROGRESSIONS.map(p => p.name),
        ...arr.filter((_, i) => i !== idx).map(p => p.name)
      ];
      if (otherNames.includes(newName)) {
        nameInput.setCustomValidity('A progression with this name already exists');
        nameInput.reportValidity();
        return;
      }
      nameInput.setCustomValidity('');

      // Keep disabled state consistent on rename
      if (oldName !== newName) {
        const dis = loadDisabled();
        if (dis.has(oldName)) { dis.delete(oldName); dis.add(newName); saveDisabled(dis); }
      }

      arr[idx] = { name: newName, tokens: newTokensRaw.split(/\s+/).filter(Boolean) };
      saveCustom(arr);
      editingCustomIndex = -1;
      renderCustomList(arr);
    });
  });

  el.querySelectorAll('.prog-delete-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.preventDefault();
      const idx = parseInt(btn.dataset.index, 10);
      const arr = loadCustom();
      const name = arr[idx].name;
      arr.splice(idx, 1);
      saveCustom(arr);
      const dis = loadDisabled();
      dis.delete(name);
      saveDisabled(dis);
      if (editingCustomIndex === idx) editingCustomIndex = -1;
      renderCustomList(arr);
      updateCustomCount(arr.length);
    });
  });
}

function wireCheckboxes(container) {
  container.querySelectorAll('.prog-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const dis = loadDisabled();
      if (cb.checked) dis.delete(cb.dataset.name);
      else dis.add(cb.dataset.name);
      saveDisabled(dis);
    });
  });
}

function updateCustomCount(n) {
  const countEl = document.getElementById('progCustomCount');
  if (countEl) countEl.textContent = `${n}/${MAX_CUSTOM}`;
  const addForm  = document.getElementById('addCustomForm');
  const addLimit = document.getElementById('progAddLimit');
  if (addForm)  addForm.style.display  = n >= MAX_CUSTOM ? 'none' : 'flex';
  if (addLimit) addLimit.style.display = n >= MAX_CUSTOM ? 'block' : 'none';
}

function setAllEnabled(enabled) {
  const dis = loadDisabled();
  [...PROGRESSIONS, ...loadCustom()].forEach(p =>
    enabled ? dis.delete(p.name) : dis.add(p.name)
  );
  saveDisabled(dis);
  renderModal();
}

function handleAddCustom(e) {
  e.preventDefault();
  const form = e.target;
  const name = form.elements.progName.value.trim();
  const tokensRaw = form.elements.progTokens.value.trim();
  const nameInput = form.elements.progName;

  const custom = loadCustom();
  if (custom.length >= MAX_CUSTOM) return;

  const allNames = [...PROGRESSIONS, ...custom].map(p => p.name);
  if (allNames.includes(name)) {
    nameInput.setCustomValidity('A progression with this name already exists');
    nameInput.reportValidity();
    return;
  }
  nameInput.setCustomValidity('');

  const tokens = tokensRaw.split(/\s+/).filter(Boolean);
  custom.push({ name, tokens });
  saveCustom(custom);
  form.reset();
  renderCustomList(custom);
  updateCustomCount(custom.length);
}

