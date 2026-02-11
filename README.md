# SillyTavern Chat Organizer

A SillyTavern extension that lets you organize chats into custom folders, move/bulk-delete chats. Works from desktop or mobile

<p align="center">
  <img width="600" src="https://github.com/user-attachments/assets/552ed943-d160-4ef7-ba27-e4fe75c13932">
</p>

## Features
- Folder management: create, rename, delete, and assign chats.
- Rename and delete chat files, open any chat directly from the extension page.
- Bulk actions: select multiple chats, move to a folder, or delete.
- Separate folder structure for all chats and individual character chats with dual tags, gives you the option to manage chats as you wish.
- Search and stats: name/content search.
- Message count/file size/last-activity metadata (using `stats` patch).
- UI polish: mobile-friendly tabs, fullscreen window.
## Installation
- Manual
    - Download, extract and Copy the folder into `public/scripts/extensions/third-party/sillytavern-chat-organizer` inside your SillyTavern directory.
    - Restart SillyTavern (or reload the client) to let the extension register.
    - Open the Extensions panel in SillyTavern, locate **Chat Organizer**, and enable it if needed.
- Via SillyTavern Extension Manager 
    - Copy this link below.
        ```
        https://github.com/kurerapu/sillytavern-chat-organizer
        ```
    - Paste in `install extension` url field on SillyTavern.
    - CLick Install. Refresh browser or restart server if needed.

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
- To use this extension, click the icon on SillyTavern toolbar.
- The icon on the button explains its function, use the checkbox to move more than one chat at a time.
- Click on the chat box to open the chats.
- Automatically, the extension window will change to chats list according to the character you choose when you chat with a character, and return to the list of all chats when you go to the home page.
- When you are having a conversation with a character, you can still see, manage, or open chats from all characters by using the button with the globe icon, and use the button with the person icon to return to the chat list of the character you are currently using.

## Notes
- Folder data is stored separately per scope (global and per-character) under the extension settings.
- Locked system folders cannot be removed; deleting a folder reassigns its chats to Unassigned.
- This extension was originally just for personal use to suit my needs. It was built using an agent, so the code quality might not be that great, but it's usable.
- Tested on SillyTavern 1.15.0.

## Screenshots
- Desktop  
<p align="center">
  <img width="400" src="https://github.com/user-attachments/assets/c44cee6b-ae13-4bff-99ed-eeed53802542">
  <img width="400" src="https://github.com/user-attachments/assets/357acd7a-0f36-45df-b90f-f11f65c7b199">
</p>

- Mobile  
<p align="center">
  <img width="200" src="https://github.com/user-attachments/assets/69d4f5ac-ebe8-4787-bf65-4966ee190911">
  <img width="200" src="https://github.com/user-attachments/assets/465a0f2a-0bda-44fe-8099-f65f1da5ad4d">
  <img width="200" src="https://github.com/user-attachments/assets/00e4f68b-80ef-45ef-afa6-e0e43c2c7fd3">
  <img width="200" src="https://github.com/user-attachments/assets/86c45595-8e35-41f6-b2ad-f02031a07bcd">
</p>
