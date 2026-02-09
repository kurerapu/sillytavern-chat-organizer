# SillyTavern Chat Organizer

A SillyTavern extension that lets you organize chats into custom folders, move/bulk-delete chats. Works from desktop or mobile (responsive layout) and respects avatar shapes.

## Features
- Sidebar-driven panel to create/rename/delete folders and assign chats.
- Move or bulk delete chats, select all per-folder or visible list.
- Full-text search: type in the search box to match chat names, and in-chat content (characters and groups)
- Chat list with avatar, chat file names nad character names.
- Shows Message count, file size, and last activity (when server patch is applied).
    - Optional stats fetch: if the backend route is absent, it gracefully omits counts/size/last activity.

## Installation
Copy this repo link
```
https://github.com/kurerapu/sillytavern-chat-organizer
```
Then refresh or restart server if needed.
## Optional stats patch (message count, file size, last activity)
The extension works without patching, in that case, it simply hides stats and last activity. To enable stats:
```bash
chmod +x public/scripts/extensions/third-party/sillytavern-chat-organizer/patch-chat-stats.sh
bash public/scripts/extensions/third-party/sillytavern-chat-organizer/patch-chat-stats.sh
```

### What the script does
- Appends an `/api/chats/stats` endpoint to `src/endpoints/chats.js`.
- The endpoint reads chat files, returns message count, file size, and last modified timestamp.
- It skips if the marker already exists to avoid duplicate patching.

### Effects and expectations
- After running the patch, restart the SillyTavern server so the new route loads.
- The extension will begin showing counts/size/last activity if the route is available.
- If you do not patch, the extension still loads and functions (folders, move, delete, avatars), it just won’t show the stats fields.

## Mobile notes
- On small screens the panel stacks vertically, toolbar buttons wrap, and chat actions become vertical for easier tapping.

## Uninstall
- Remove the extension in the Extensions menu.
