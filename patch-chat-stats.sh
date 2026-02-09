#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

# Build candidate roots: explicit REPO_ROOT, git root, then five-levels-up fallback.
ROOT_CANDIDATES=()

if [ -n "${REPO_ROOT:-}" ]; then
    ROOT_CANDIDATES+=("$REPO_ROOT")
fi

if git -C "$SCRIPT_DIR" rev-parse --show-toplevel >/dev/null 2>&1; then
    ROOT_CANDIDATES+=("$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel)")
fi

ROOT_CANDIDATES+=("$(cd "$SCRIPT_DIR/../../../../.." && pwd)")

REPO_ROOT=""
for candidate in "${ROOT_CANDIDATES[@]}"; do
    if [ -f "$candidate/src/endpoints/chats.js" ]; then
        REPO_ROOT="$candidate"
        break
    fi
done

if [ -z "$REPO_ROOT" ]; then
    echo "Could not find src/endpoints/chats.js. Set REPO_ROOT to your SillyTavern root and retry." >&2
    exit 1
fi

FILE="$REPO_ROOT/src/endpoints/chats.js"
MARKER="Chat Folder extension: optional stats endpoint"

if grep -q "$MARKER" "$FILE"; then
    echo "Already patched: $FILE"
    exit 0
fi

    cat <<'EOF' >>"$FILE"

// Chat Folder extension: optional stats endpoint
router.post('/stats', validateAvatarUrlMiddleware, async (request, response) => {
    try {
        const entries = request.body;
        if (!Array.isArray(entries)) {
            return response.status(400).send({ error: 'Body must be an array' });
        }

        const results = [];

        for (const entry of entries) {
            const { type, ownerId, ownerAvatar, chatName } = entry || {};
            if (!type || !chatName) continue;

            try {
                let filePath;
                if (type === 'character') {
                    const dirName = sanitize(String(ownerAvatar || '')).replace('.png', '');
                    if (!dirName) continue;
                    filePath = path.join(request.user.directories.chats, dirName, sanitize(`${chatName}.jsonl`));
                } else if (type === 'group') {
                    const candidate = path.join(request.user.directories.groupChats, sanitize(`${chatName}.jsonl`));
                    const fallback = path.join(request.user.directories.groupChats, sanitize(`${ownerId}.jsonl`));
                    filePath = fs.existsSync(candidate) ? candidate : fallback;
                }

                if (!filePath || !fs.existsSync(filePath)) continue;

                const info = await getChatInfo(filePath);
                results.push({
                    key: `${type}:${ownerId}:${chatName}`,
                    chat_items: info.chat_items ?? 0,
                    file_size: info.file_size ?? '',
                    last_modified: fs.statSync(filePath)?.mtimeMs ?? null,
                });
            } catch (err) {
                console.warn('Chat stats error', err);
            }
        }

        return response.send(results);
    } catch (error) {
        console.error(error);
        return response.status(500).send({ error: 'An error has occurred' });
    }
});
EOF

echo "Patched $FILE with stats endpoint. Restart server to apply."
