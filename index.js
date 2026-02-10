import { characters, eventSource, event_types, getCurrentChatId, getPastCharacterChats, openCharacterChat, renameGroupOrCharacterChat, deleteCharacterChatByName, selectCharacterById, setActiveCharacter, saveSettingsDebounced, getThumbnailUrl, system_avatar, getRequestHeaders } from '../../../../script.js';
import { renderExtensionTemplateAsync, extension_settings } from '../../../extensions.js';
import { groups, openGroupById, openGroupChat, deleteGroupChatByName } from '../../../group-chats.js';
import { callGenericPopup, POPUP_TYPE } from '../../../popup.js';

const EXTENSION_NAME = (() => {
    const match = String(import.meta.url).match(/\/scripts\/extensions\/([^?#]+)\/index\.js/);
    return match?.[1] || 'chat-folder';
})();
const DEFAULT_FOLDERS = [
    { id: 'all', name: 'All Chats', locked: true },
    { id: 'unassigned', name: 'Unassigned', locked: true },
];

let panelEl;
let folderListEl;
let folderSelectAllEl;
let chatListEl;
let searchInputEl;
let selectAllEl;
let emptyStateEl;
let selectionCountEl;
let selectionPreviewEl;
let bodyEl;
let tabFoldersBtn;
let tabChatsBtn;

let chatItems = [];
let selectedKeys = new Set();
let selectedFolderIds = new Set();
let isPanelVisible = false;
let isLoading = false;
let statsAvailable = false;
let contentSearchQuery = '';
let contentSearchMatches = null;
let searchToken = 0;

function ensureSettings() {
    const state = extension_settings.chatFolder || {};

    if (!Array.isArray(state.folders)) {
        state.folders = [];
    }

    if (!state.assignments || typeof state.assignments !== 'object') {
        state.assignments = {};
    }

    for (const sys of DEFAULT_FOLDERS) {
        if (!state.folders.some(f => f.id === sys.id)) {
            state.folders.unshift({ ...sys });
        }
    }

    // keep system folders locked and names intact
    state.folders = state.folders.map(folder => {
        const systemMatch = DEFAULT_FOLDERS.find(f => f.id === folder.id);
        return systemMatch ? { ...folder, name: systemMatch.name, locked: true } : folder;
    });

    const knownFolderIds = new Set(state.folders.map(f => f.id));

    if (!state.lastFolderId || !knownFolderIds.has(state.lastFolderId)) {
        state.lastFolderId = 'all';
    }

    extension_settings.chatFolder = state;
}

function getState() {
    ensureSettings();
    return extension_settings.chatFolder;
}

function persistSettings() {
    saveSettingsDebounced();
}

function normalizeKey(item) {
    return `${item.type}:${item.ownerId}:${item.chatName}`;
}

function getAssignment(key) {
    const state = getState();
    const folderExists = state.folders.some(f => f.id === state.assignments[key]);
    return folderExists ? state.assignments[key] : 'unassigned';
}

function setAssignment(key, folderId) {
    const state = getState();
    if (folderId === 'all') {
        folderId = 'unassigned';
    }
    state.assignments[key] = folderId;
    persistSettings();
}

function removeAssignment(key) {
    const state = getState();
    delete state.assignments[key];
    persistSettings();
}

function syncAssignmentsWithItems(items) {
    const state = getState();
    const validKeys = new Set(items.map(i => normalizeKey(i)));
    for (const key of Object.keys(state.assignments)) {
        if (!validKeys.has(key)) {
            delete state.assignments[key];
        }
    }
    persistSettings();
}

function injectMenuButton() {
    if (document.getElementById('chat-folder-button')) return;

    const personaButton = document.getElementById('persona-management-button');
    const characterButton = document.getElementById('rightNavHolder');

    if (!personaButton || !characterButton || !personaButton.parentElement) {
        return;
    }

    const wrapper = document.createElement('div');
    wrapper.id = 'chat-folder-button';
    wrapper.className = 'drawer';

    const toggle = document.createElement('div');
    toggle.className = 'drawer-toggle';
    const icon = document.createElement('div');
    icon.className = 'drawer-icon fa-solid fa-folder-tree fa-fw closedIcon';
    icon.title = 'Chat Organizer';
    toggle.appendChild(icon);
    wrapper.appendChild(toggle);

    toggle.addEventListener('click', () => togglePanel(!isPanelVisible));

    personaButton.parentElement.insertBefore(wrapper, characterButton);
}

async function ensurePanel() {
    if (panelEl) return true;

    try {
        const html = await renderExtensionTemplateAsync(EXTENSION_NAME, 'panel');
        document.body.insertAdjacentHTML('beforeend', html);

        panelEl = document.getElementById('chat-folder-panel');
        folderListEl = document.getElementById('chat-folder-folders');
        folderSelectAllEl = document.getElementById('chat-folder-folder-select-all');
        chatListEl = document.getElementById('chat-folder-chatlist');
        searchInputEl = document.getElementById('chat-folder-search');
        selectAllEl = document.getElementById('chat-folder-select-all');
        emptyStateEl = document.getElementById('chat-folder-empty');
        selectionCountEl = document.getElementById('chat-folder-selection-count');
        selectionPreviewEl = document.getElementById('chat-folder-selection-preview');
        bodyEl = panelEl?.querySelector('.chat-folder-body');
        tabFoldersBtn = document.getElementById('chat-folder-tab-folders');
        tabChatsBtn = document.getElementById('chat-folder-tab-chats');

        document.getElementById('chat-folder-close')?.addEventListener('click', () => togglePanel(false));
        panelEl?.querySelector('.chat-folder-backdrop')?.addEventListener('click', () => togglePanel(false));

        searchInputEl?.addEventListener('input', () => handleSearchChange());
        selectAllEl?.addEventListener('change', () => handleSelectAll(selectAllEl.checked));
        folderSelectAllEl?.addEventListener('change', () => handleFolderSelectAll(folderSelectAllEl.checked));
        tabFoldersBtn?.addEventListener('click', () => setMobileTab('folders'));
        tabChatsBtn?.addEventListener('click', () => setMobileTab('chats'));

        panelEl?.addEventListener('click', onPanelClick);

        setMobileTab('folders');
    } catch (error) {
        console.error('Chat Folder: failed to build panel', error);
        await callGenericPopup('Could not open Chat Folder panel. Check console for details.', POPUP_TYPE.TEXT);
        return false;
    }

    return !!panelEl;
}

function onPanelClick(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const button = target.closest('[data-action]');
    if (!(button instanceof HTMLElement)) return;

    const action = button.dataset.action;
    if (!action) return;

    event.stopPropagation();

    switch (action) {
        case 'create-folder':
            return createFolder();
        case 'rename-folder':
            return renameFolder();
        case 'delete-folder':
            return deleteFolder();
        case 'move-selected':
            return moveSelected();
        case 'delete-selected':
            return deleteSelected();
        default:
            break;
    }
}

async function togglePanel(show) {
    const ready = await ensurePanel();
    if (!ready || !panelEl) return;

    isPanelVisible = show;
    const button = document.getElementById('chat-folder-button');
    const icon = button?.querySelector('.drawer-icon');
    button?.classList.toggle('active', show);
    if (icon instanceof HTMLElement) {
        icon.classList.toggle('openIcon', show);
        icon.classList.toggle('closedIcon', !show);
    }
    panelEl.classList.toggle('visible', show);
    panelEl.classList.toggle('hidden', !show);
    if (show) {
        setMobileTab('folders');
        searchToken++;
        contentSearchQuery = '';
        contentSearchMatches = null;
        if (searchInputEl) {
            searchInputEl.value = '';
        }
        await refreshData();
        chatListEl?.scrollTo?.({ top: 0, behavior: 'instant' });
    }
}

function setMobileTab(tab) {
    if (!bodyEl) return;
    const target = tab === 'chats' ? 'chats' : 'folders';
    bodyEl.setAttribute('data-mobile-tab', target);
    tabFoldersBtn?.classList.toggle('active', target === 'folders');
    tabChatsBtn?.classList.toggle('active', target === 'chats');
}

async function refreshData() {
    if (isLoading) return;
    isLoading = true;

    try {
        ensureSettings();
        const items = await loadChatItems();
        const statsMap = await fetchChatStats(items);
        statsAvailable = statsMap.size > 0;
        chatItems = items.map(item => {
            const stats = statsMap.get(normalizeKey(item));
            if (!stats) return item;
            return {
                ...item,
                chatItems: stats.chat_items,
                fileSize: stats.file_size,
                lastModified: typeof stats.last_modified === 'number' ? stats.last_modified : undefined,
            };
        }).sort((a, b) => getSortTimestamp(b) - getSortTimestamp(a));
        selectedKeys = new Set();
        selectedFolderIds = new Set();
        contentSearchMatches = null;
        searchToken++;
        contentSearchQuery = (searchInputEl?.value || '').trim().toLowerCase();
        syncFolderSelection();
        syncAssignmentsWithItems(chatItems);
        renderFolders();
        renderChatList();
        if (contentSearchQuery) {
            await runContentSearch(contentSearchQuery);
        }
    } finally {
        isLoading = false;
    }
}

function formatLastActivity(timestampMs) {
    if (!timestampMs || Number.isNaN(timestampMs)) return '';
    const now = Date.now();
    const diff = now - timestampMs;
    if (diff < 0) return '';

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 10) return 'just now';
    if (seconds < 60) return `${seconds} seconds ago`;
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;

    const dt = new Date(timestampMs);
    return dt.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
    });
}

function getSortTimestamp(item) {
    if (typeof item.lastModified === 'number') return item.lastModified;
    const parsed = Date.parse(item.lastDate || '');
    return Number.isNaN(parsed) ? 0 : parsed;
}

function syncFolderSelection() {
    const state = getState();
    const valid = new Set(state.folders.filter(f => !f.locked).map(f => f.id));
    selectedFolderIds.forEach(id => {
        if (!valid.has(id)) {
            selectedFolderIds.delete(id);
        }
    });
}

function handleFolderSelectAll(checked) {
    const state = getState();
    const selectable = state.folders.filter(f => !f.locked).map(f => f.id);
    if (checked) {
        selectedFolderIds = new Set(selectable);
    } else {
        selectedFolderIds.clear();
    }
    renderFolders();
}

function updateFolderSelectAllUI() {
    if (!folderSelectAllEl) return;
    const state = getState();
    const selectable = state.folders.filter(f => !f.locked).map(f => f.id);
    if (!selectable.length) {
        folderSelectAllEl.checked = false;
        folderSelectAllEl.indeterminate = false;
        return;
    }
    const selectedCount = selectable.filter(id => selectedFolderIds.has(id)).length;
    folderSelectAllEl.checked = selectedCount === selectable.length;
    folderSelectAllEl.indeterminate = selectedCount > 0 && selectedCount < selectable.length;
}

async function loadChatItems() {
    const items = [];

    const characterPromises = characters.map(async (character, index) => {
        if (!character || !character.avatar || character.avatar === 'none') return;
        try {
            const chats = await getPastCharacterChats(index);
            if (!Array.isArray(chats)) return;
            for (const chat of chats) {
                const chatName = String(chat.file_name || '').replace('.jsonl', '');
                if (!chatName) continue;
                items.push({
                    type: 'character',
                    ownerId: String(index),
                    ownerName: character.name || 'Unknown',
                    ownerAvatar: character.avatar,
                    chatName,
                    lastMessage: chat.mes || '',
                    lastDate: chat.last_mes || '',
                });
            }
        } catch (error) {
            console.warn('Chat Folder: failed to load chats for character', character?.name, error);
        }
    });

    await Promise.all(characterPromises);

    for (const group of groups) {
        if (!group || !Array.isArray(group.chats)) continue;
        for (const chatName of group.chats) {
            items.push({
                type: 'group',
                ownerId: String(group.id),
                ownerName: group.name || 'Group',
                ownerAvatar: group.avatar_url || '',
                chatName,
                lastMessage: '',
                lastDate: group.date_last_chat || '',
            });
        }
    }

    return items;
}

function renderFolders() {
    if (!folderListEl) return;
    const state = getState();
    const counts = new Map();
    const total = chatItems.length;
    counts.set('all', total);

    for (const item of chatItems) {
        const key = normalizeKey(item);
        const folderId = getAssignment(key);
        counts.set(folderId, (counts.get(folderId) || 0) + 1);
    }

    folderListEl.innerHTML = '';
    for (const folder of state.folders) {
        const count = counts.get(folder.id) || 0;
        const el = document.createElement('div');
        el.className = 'folder-item' + (state.lastFolderId === folder.id ? ' active' : '');
        el.dataset.id = folder.id;
        const left = document.createElement('div');
        left.className = 'folder-left';

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.disabled = folder.locked;
        checkbox.checked = selectedFolderIds.has(folder.id);
        checkbox.addEventListener('change', () => toggleFolderSelection(folder.id, checkbox.checked));

        const nameSpan = document.createElement('span');
        nameSpan.className = 'folder-name';
        nameSpan.textContent = folder.name;

        left.appendChild(checkbox);
        left.appendChild(nameSpan);

        const countSpan = document.createElement('span');
        countSpan.className = 'folder-count';
        countSpan.textContent = String(count);

        el.appendChild(left);
        el.appendChild(countSpan);
        el.addEventListener('click', () => selectFolder(folder.id));
        folderListEl.appendChild(el);
    }

    updateFolderSelectAllUI();
}

function toggleFolderSelection(folderId, checked) {
    const state = getState();
    const folder = state.folders.find(f => f.id === folderId);
    if (!folder || folder.locked) return;
    if (checked) {
        selectedFolderIds.add(folderId);
    } else {
        selectedFolderIds.delete(folderId);
    }

    updateFolderSelectAllUI();
}

function selectFolder(folderId) {
    const state = getState();
    if (!state.folders.some(f => f.id === folderId)) {
        folderId = 'all';
    }
    state.lastFolderId = folderId;
    persistSettings();
    renderFolders();
    renderChatList();
}

function filterItems() {
    const state = getState();
    const query = (searchInputEl?.value || '').trim().toLowerCase();
    const hasQuery = !!query;
    const matchSet = hasQuery && contentSearchQuery === query ? contentSearchMatches : null;
    return chatItems.filter(item => {
        const key = normalizeKey(item);
        const assignment = getAssignment(key);
        const inFolder = state.lastFolderId === 'all' || assignment === state.lastFolderId;
        if (!inFolder) return false;

        if (!hasQuery) return true;

        const nameMatch = item.chatName.toLowerCase().includes(query) || (item.ownerName || '').toLowerCase().includes(query);
        const contentMatch = matchSet ? matchSet.has(key) : false;
        return nameMatch || contentMatch;
    });
}

function renderChatList() {
    if (!chatListEl || !emptyStateEl || !selectionCountEl) return;
    const items = filterItems();
    chatListEl.innerHTML = '';
    emptyStateEl.classList.toggle('hidden', items.length > 0);

    for (const item of items) {
        chatListEl.appendChild(buildChatCard(item));
    }

    updateSelectionUI(items);
}

function buildChatCard(item) {
    const key = normalizeKey(item);
    const folderId = getAssignment(key);
    const card = document.createElement('div');
    card.className = 'chat-card';
    card.dataset.key = key;

    const checkboxWrap = document.createElement('div');
    checkboxWrap.className = 'chat-checkbox';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedKeys.has(key);
    checkbox.addEventListener('click', evt => evt.stopPropagation());
    checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
            selectedKeys.add(key);
        } else {
            selectedKeys.delete(key);
        }
        updateSelectionUI(filterItems());
    });
    checkboxWrap.appendChild(checkbox);

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'chat-avatar avatar';
    const avatarImg = document.createElement('img');
    avatarImg.src = getAvatarUrlForItem(item);
    avatarImg.alt = item.ownerName;
    avatarWrap.appendChild(avatarImg);

    const meta = document.createElement('div');
    meta.className = 'chat-meta';
    const title = document.createElement('div');
    title.className = 'chat-title';
    title.textContent = item.chatName;
    const owner = document.createElement('div');
    owner.className = 'chat-info-line';
    if (typeof item.chatItems === 'number' && item.fileSize) {
        const label = item.ownerName || (item.type === 'group' ? 'Group' : '');
        owner.textContent = `${label} • ${item.chatItems} messages • ${item.fileSize}`;
    } else {
        owner.textContent = item.ownerName || (item.type === 'group' ? 'Group' : '');
    }
    const lastActivity = document.createElement('div');
    lastActivity.className = 'chat-info-line';
    const lastText = formatLastActivity(item.lastModified);
    if (lastText) {
        lastActivity.textContent = `Last activity - ${lastText}`;
    }
    const snippet = document.createElement('div');
    snippet.className = 'chat-snippet';
    snippet.textContent = item.lastMessage ? truncate(item.lastMessage, 140) : '';
    meta.appendChild(title);
    meta.appendChild(owner);
    if (lastActivity.textContent) {
        meta.appendChild(lastActivity);
    }
    if (snippet.textContent) {
        meta.appendChild(snippet);
    }

    const actions = document.createElement('div');
    actions.className = 'chat-actions';

    const folderTag = document.createElement('span');
    folderTag.className = 'chat-folder-tag';
    folderTag.textContent = getFolderName(folderId);

    const openBtn = document.createElement('button');
    openBtn.className = 'open-btn';
    openBtn.innerHTML = '<i class="fa-solid fa-up-right-from-square"></i>';
    openBtn.title = 'Open chat';
    openBtn.setAttribute('aria-label', 'Open chat');
    openBtn.addEventListener('click', evt => {
        evt.stopPropagation();
        void openChat(item);
    });

    const renameBtn = document.createElement('button');
    renameBtn.className = 'rename-btn';
    renameBtn.innerHTML = '<i class="fa-solid fa-pen"></i>';
    renameBtn.title = 'Rename chat';
    renameBtn.setAttribute('aria-label', 'Rename chat');
    renameBtn.addEventListener('click', evt => {
        evt.stopPropagation();
        void renameChat(item);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i>';
    deleteBtn.title = 'Delete chat';
    deleteBtn.setAttribute('aria-label', 'Delete chat');
    deleteBtn.addEventListener('click', evt => {
        evt.stopPropagation();
        void deleteChat(item);
    });

    actions.append(folderTag, openBtn, renameBtn, deleteBtn);

    card.append(checkboxWrap, avatarWrap, meta, actions);
    card.addEventListener('click', () => void openChat(item));
    return card;
}

function updateSelectionUI(filteredItems) {
    if (!selectionCountEl || !selectAllEl) return;
    const total = filteredItems.length;
    const selectedInView = filteredItems.filter(item => selectedKeys.has(normalizeKey(item))).length;
    const selectedTotal = selectedKeys.size;
    selectionCountEl.textContent = `${selectedTotal} selected`;
    selectAllEl.checked = total > 0 && selectedInView === total;
    selectAllEl.indeterminate = selectedInView > 0 && selectedInView < total;

    if (selectionPreviewEl) {
        if (selectedTotal === 0) {
            selectionPreviewEl.textContent = '';
            selectionPreviewEl.classList.add('hidden');
        } else {
            const names = [];
            for (const item of chatItems) {
                if (selectedKeys.has(normalizeKey(item))) {
                    names.push(getPreviewName(item.chatName));
                    if (names.length >= 5) break;
                }
            }
            const remaining = selectedTotal - names.length;
            const more = remaining > 0 ? `, +${remaining} more` : '';
            selectionPreviewEl.textContent = `[${names.join(', ')}${more}]`;
            selectionPreviewEl.classList.remove('hidden');
        }
    }
}

function getPreviewName(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return String(name || '');
    return parts.slice(0, Math.min(parts.length, 2)).join(' ');
}

function handleSelectAll(checked) {
    const items = filterItems();
    for (const item of items) {
        const key = normalizeKey(item);
        if (checked) {
            selectedKeys.add(key);
        } else {
            selectedKeys.delete(key);
        }
    }
    renderChatList();
}

function handleSearchChange() {
    const query = (searchInputEl?.value || '').trim().toLowerCase();
    contentSearchQuery = query;
    void runContentSearch(query);
    renderChatList();
}

function getFolderName(folderId) {
    const state = getState();
    return state.folders.find(f => f.id === folderId)?.name || 'Unassigned';
}

async function runContentSearch(query) {
    const token = ++searchToken;

    if (!query) {
        contentSearchMatches = null;
        return;
    }

    try {
        const matches = await searchAcrossChats(query);
        if (token === searchToken) {
            contentSearchMatches = matches;
            renderChatList();
        }
    } catch (error) {
        if (token === searchToken) {
            contentSearchMatches = null;
        }
        console.warn('Chat Folder: content search failed', error);
    }
}

async function searchAcrossChats(query) {
    const headers = { ...getRequestHeaders?.(), 'Content-Type': 'application/json' };
    const matches = new Set();

    const characterOwners = new Map();
    const groupOwners = new Set();

    for (const item of chatItems) {
        if (item.type === 'character') {
            characterOwners.set(item.ownerId, item.ownerAvatar);
        } else if (item.type === 'group') {
            groupOwners.add(item.ownerId);
        }
    }

    const characterPromises = Array.from(characterOwners.entries()).map(async ([ownerId, avatar]) => {
        try {
            const response = await fetch('/api/chats/search', {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, avatar_url: avatar }),
            });

            if (!response.ok) return;
            const data = await response.json();
            if (!Array.isArray(data)) return;

            for (const entry of data) {
                const chatName = String(entry?.file_name || '').replace(/\.jsonl$/, '');
                if (!chatName) continue;
                matches.add(normalizeKey({ type: 'character', ownerId, chatName }));
            }
        } catch (error) {
            console.warn('Chat Folder: character search failed', ownerId, error);
        }
    });

    const groupPromises = Array.from(groupOwners.values()).map(async ownerId => {
        try {
            const response = await fetch('/api/chats/search', {
                method: 'POST',
                headers,
                body: JSON.stringify({ query, group_id: ownerId }),
            });

            if (!response.ok) return;
            const data = await response.json();
            if (!Array.isArray(data)) return;

            for (const entry of data) {
                const chatName = String(entry?.file_name || '').replace(/\.jsonl$/, '');
                if (!chatName) continue;
                matches.add(normalizeKey({ type: 'group', ownerId, chatName }));
            }
        } catch (error) {
            console.warn('Chat Folder: group search failed', ownerId, error);
        }
    });

    await Promise.all([...characterPromises, ...groupPromises]);
    return matches;
}

function getAvatarUrlForItem(item) {
    if (item.type === 'group') {
        return item.ownerAvatar || system_avatar;
    }

    const thumbnail = getThumbnailUrl?.('avatar', item.ownerAvatar);
    return thumbnail || system_avatar;
}

async function fetchChatStats(items) {
    const payload = items.map(item => ({
        type: item.type,
        ownerId: item.ownerId,
        ownerAvatar: item.ownerAvatar,
        chatName: item.chatName,
    }));

    try {
        const response = await fetch('/api/chats/stats', {
            method: 'POST',
            headers: { ...getRequestHeaders?.(), 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            return new Map();
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            return new Map();
        }

        const map = new Map();
        for (const stat of data) {
            if (stat?.key) {
                map.set(stat.key, stat);
            }
        }
        return map;
    } catch (error) {
        console.warn('Chat Folder: stats endpoint unavailable, skipping stats.', error);
        return new Map();
    }
}

function isFolderNameTaken(name, excludeId) {
    if (!name) return false;
    const normalized = name.trim().toLowerCase();
    const state = getState();
    return state.folders.some(folder => folder.id !== excludeId && folder.name.trim().toLowerCase() === normalized);
}

async function createFolder() {
    const name = await callGenericPopup('Folder name', POPUP_TYPE.INPUT, 'New Folder');
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;

    if (isFolderNameTaken(trimmed)) {
        await callGenericPopup('A folder with that name already exists.', POPUP_TYPE.TEXT);
        return;
    }

    const state = getState();
    const id = `folder-${Date.now()}`;
    state.folders.push({ id, name: trimmed, locked: false });
    state.lastFolderId = id;
    persistSettings();
    renderFolders();
    renderChatList();
}

async function renameFolder() {
    const state = getState();
    const folder = state.folders.find(f => f.id === state.lastFolderId);
    if (!folder || folder.locked) return;

    const name = await callGenericPopup('Rename folder', POPUP_TYPE.INPUT, folder.name);
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === folder.name) return;

    if (isFolderNameTaken(trimmed, folder.id)) {
        await callGenericPopup('A folder with that name already exists.', POPUP_TYPE.TEXT);
        return;
    }

    folder.name = trimmed;
    persistSettings();
    renderFolders();
    renderChatList();
}

async function deleteFolder() {
    const state = getState();
    const selected = state.folders.filter(f => selectedFolderIds.has(f.id) && !f.locked);
    let targets = selected;

    if (!targets.length) {
        const folder = state.folders.find(f => f.id === state.lastFolderId && !f.locked);
        targets = folder ? [folder] : [];
    }

    if (!targets.length) return;

    const message = targets.length > 1
        ? 'Delete selected folders? Chats will move to Unassigned.'
        : 'Delete this folder? Chats will move to Unassigned.';
    const confirm = await callGenericPopup(message, POPUP_TYPE.CONFIRM);
    if (!confirm) return;

    for (const folder of targets) {
        removeFolderById(folder.id);
    }

    persistSettings();
    renderFolders();
    renderChatList();
}

function removeFolderById(folderId) {
    const state = getState();
    state.folders = state.folders.filter(f => f.id !== folderId);
    for (const [key, val] of Object.entries(state.assignments)) {
        if (val === folderId) {
            state.assignments[key] = 'unassigned';
        }
    }
    if (state.lastFolderId === folderId) {
        state.lastFolderId = 'all';
    }
    selectedFolderIds.delete(folderId);
}

async function moveSelected() {
    const target = getMoveTargetFolderId();
    if (!target) {
        await callGenericPopup('Select a target folder in the sidebar to move chats into.', POPUP_TYPE.TEXT);
        return;
    }

    const selectedItems = chatItems.filter(item => selectedKeys.has(normalizeKey(item)));
    if (!selectedItems.length) return;

    for (const item of selectedItems) {
        setAssignment(normalizeKey(item), target);
    }

    selectedKeys.clear();

    renderFolders();
    renderChatList();
}

function getMoveTargetFolderId() {
    const state = getState();
    for (const id of selectedFolderIds) {
        const folder = state.folders.find(f => f.id === id);
        if (folder && !folder.locked && folder.id !== 'all') {
            return folder.id;
        }
    }

    if (state.lastFolderId && state.lastFolderId !== 'all') {
        return state.lastFolderId;
    }

    return null;
}

async function deleteSelected() {
    const items = filterItems().filter(i => selectedKeys.has(normalizeKey(i)));
    if (!items.length) return;
    const confirm = await callGenericPopup('Delete selected chat files?', POPUP_TYPE.CONFIRM);
    if (!confirm) return;

    for (const item of items) {
        await deleteChat(item, { silentRefresh: true });
    }

    await refreshData();
}

async function renameChat(item) {
    const currentName = item.chatName;
    const newName = await callGenericPopup('New chat name', POPUP_TYPE.INPUT, currentName);
    if (!newName || typeof newName !== 'string') return;
    const trimmed = newName.trim();
    if (!trimmed || trimmed === currentName) return;

    await renameGroupOrCharacterChat({
        characterId: item.type === 'character' ? item.ownerId : undefined,
        groupId: item.type === 'group' ? item.ownerId : undefined,
        oldFileName: currentName,
        newFileName: trimmed,
        loader: true,
    });

    const oldKey = normalizeKey(item);
    item.chatName = trimmed;
    const newKey = normalizeKey(item);

    const state = getState();
    if (state.assignments[oldKey]) {
        state.assignments[newKey] = state.assignments[oldKey];
        delete state.assignments[oldKey];
    }

    persistSettings();
    updateWelcomePanelName(currentName, trimmed);
    await refreshData();
}

function updateWelcomePanelName(oldName, newName) {
    const nodes = document.querySelectorAll(`.recentChat[data-file="${CSS.escape(oldName)}"]`);
    if (!nodes.length) return;

    nodes.forEach(node => {
        node.dataset.file = newName;
        const chatNameSpan = node.querySelector('.chatName span:last-child');
        if (chatNameSpan) {
            chatNameSpan.textContent = newName;
        }
        const chatNameContainer = node.querySelector('.chatName');
        if (chatNameContainer) {
            chatNameContainer.setAttribute('title', `${newName}.jsonl`);
        }
    });
}

function removeWelcomePanelEntry(name) {
    const nodes = document.querySelectorAll(`.recentChat[data-file="${CSS.escape(name)}"]`);
    if (!nodes.length) return;

    nodes.forEach(node => node.remove());
}

async function deleteChat(item, options = { silentRefresh: false }) {
    const confirm = options.silentRefresh ? true : await callGenericPopup('Delete this chat file?', POPUP_TYPE.CONFIRM);
    if (!confirm) return;

    try {
        if (item.type === 'group') {
            await deleteGroupChatByName(item.ownerId, item.chatName);
        } else {
            await deleteCharacterChatByName(item.ownerId, item.chatName);
        }
    } catch (error) {
        // Ignore missing files so batch delete is resilient to stale lists.
        if (error?.code !== 'ENOENT') {
            throw error;
        }
        console.warn('Chat Folder: chat already missing, skipping', item.chatName, error);
    }

    removeAssignment(normalizeKey(item));
    removeWelcomePanelEntry(item.chatName);
    if (!options.silentRefresh) {
        await refreshData();
    }
}

async function openChat(item) {
    if (item.type === 'group') {
        await openGroupById(item.ownerId);
        await openGroupChat(item.ownerId, item.chatName);
    } else {
        const characterIndex = Number(item.ownerId);
        await selectCharacterById(characterIndex);
        setActiveCharacter(item.ownerAvatar);
        saveSettingsDebounced();
        const currentId = getCurrentChatId();
        if (currentId !== item.chatName) {
            await openCharacterChat(item.chatName);
        }
    }
    togglePanel(false);
}

function truncate(text, max) {
    if (!text) return '';
    if (text.length <= max) return text;
    return `${text.slice(0, max - 3)}...`;
}

function registerEvents() {
    eventSource.on(event_types.CHAT_CHANGED, () => {
        if (isPanelVisible) {
            void refreshData();
        }
    });
    eventSource.on(event_types.CHAT_DELETED, () => {
        if (isPanelVisible) {
            void refreshData();
        }
    });
}

function registerCloseOnOtherMenus() {
    document.addEventListener('click', event => {
        const toggle = event.target instanceof HTMLElement ? event.target.closest('.drawer-toggle') : null;
        if (!toggle) return;
        if (toggle.closest('#chat-folder-button')) return;
        if (isPanelVisible) {
            togglePanel(false);
        }
    });
}

(function init() {
    ensureSettings();
    injectMenuButton();
    registerEvents();
    registerCloseOnOtherMenus();
})();
