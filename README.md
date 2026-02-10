# SillyTavern Chat Organizer

A SillyTavern third-party extension that lets you group chats into folders, filter by scope, and bulk-manage chat files from a tidy side panel.

## Features
- Folder management: create, rename, delete, and assign chats; default "All Chats" and "Unassigned" system folders.
- Per-scope views: switch between Global scope and current Persona scope with separate folders and counts.
- Dual tags: each chat card shows both its global and per-character folder labels.
- Search and stats: name/content search (when available) plus message/file size/last-activity metadata.
- Bulk actions: select multiple chats, move to a folder, or delete; selection preview and highlighted cards.
- UI polish: mobile-friendly tabs, version badge, scope buttons, vertical folder labels, and default scope reset to persona when opening another character from global.
- Safe defaults: on startup the panel opens to "All Chats" for every scope; missing assignments fall back to Unassigned.

## Installation
- Manual
    - Copy or clone this folder into `public/scripts/extensions/third-party/sillytavern-chat-organizer` inside your SillyTavern install.
    - Restart SillyTavern (or reload the client) to let the extension register.
    - Open the Extensions panel in SillyTavern, locate **Chat Organizer**, and enable it if needed.
- Via SillyTavern Extension Manager 
    - Copy this link below
        ```
        https://github.com/kurerapu/sillytavern-chat-organizer
        ```
    - Paste in `install extension` url field on SillyTavern
    - CLick Install. Refresh browser or restart server if needed
## Usage
1. Open the Chat Organizer drawer from the sidebar button it adds.
2. Use the Global/Persona scope buttons to view either shared folders or folders for the active character.
3. Manage folders in the left column; click a folder to filter chats. Selecting a different character from a global chat switches the default scope back to that character.
4. In the chat list, check chats to highlight them, then use Move/Delete for bulk actions. Selection preview shows up to five names.
5. Use the search box to filter by chat/owner names; content search runs when supported by the backend.

## Notes
- Folder data is stored separately per scope (global and per-character) under the extension settings.
- Locked system folders cannot be removed; deleting a folder reassigns its chats to Unassigned.
- Content search and stats endpoints may not be available in all deployments; the extension will fall back gracefully.

## Development
- Core files: `panel.html` (markup), `style.css` (styles), `index.js` (logic), `manifest.json` (registration).
- After edits, reload SillyTavern or the extension to see changes.
