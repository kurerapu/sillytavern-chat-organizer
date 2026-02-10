# SillyTavern Chat Organizer

A SillyTavern extension that lets you organize chats into custom folders, move/bulk-delete chats. Works from desktop or mobile

## Features
- Chat/folder management: create, rename, delete, and assign chats; default "All Chats" and "Unassigned" system folders.
- Separate folder structure for all chats and individual character chats with dual tags, making it easier to manage chats
- Open any chat directly from the extension page.
- Search and stats: name/content search.
- Message count/file size/last-activity metadata (Using `stats` patch)
- Bulk actions: select multiple chats, move to a folder, or delete; selection preview and highlighted cards.
- UI polish: mobile-friendly tabs, scope buttons, vertical folder labels, and default scope reset to persona when opening another character from global.
## Installation
- Manual
    - Download, extract and Copy the folder into `public/scripts/extensions/third-party/sillytavern-chat-organizer` inside your SillyTavern directory.
    - Restart SillyTavern (or reload the client) to let the extension register.
    - Open the Extensions panel in SillyTavern, locate **Chat Organizer**, and enable it if needed.
- Via SillyTavern Extension Manager 
    - Copy this link below
        ```
        https://github.com/kurerapu/sillytavern-chat-organizer
        ```
    - Paste in `install extension` url field on SillyTavern
    - CLick Install. Refresh browser or restart server if needed

## Optional Stats Patch
The extension works without patching, in that case, it simply hides stats and last activity. To enable stats:
```bash
chmod +x public/scripts/extensions/third-party/sillytavern-chat-organizer/patch-chat-stats.sh
bash public/scripts/extensions/third-party/sillytavern-chat-organizer/patch-chat-stats.sh
```
### What The Script Does
- Appends an `/api/chats/stats` endpoint to `src/endpoints/chats.js`.
- The endpoint reads chat files, returns message count, file size, and last modified timestamp.
- It skips if the marker already exists to avoid duplicate patching.

## Usage
Open the extension from the icon on the SillyTavern toolbar.

## Notes
- Folder data is stored separately per scope (global and per-character) under the extension settings.
- Locked system folders cannot be removed; deleting a folder reassigns its chats to Unassigned.
- This extension was originally just for personal use to suit my needs. It was built using an agent, so the code quality might not be that great, but it's usable.
- Tested on SillyTavern 1.15.0.
