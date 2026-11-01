# Drops

New drawings are published in a separate repository, `azkian1/slop-newyork-drops`, as `drops.json` on the `main` branch. This game only reads that file:

https://raw.githubusercontent.com/azkian1/slop-newyork-drops/main/drops.json

The writer of that file does not need access to this repository. `data/drops.json` in this repository is the built-in set (the lobster, the unicorn, and the other demo drawings). If the remote file is missing, too large, or not JSON, the game keeps the local drawings and shows no error.

The remote file is untrusted. `js/drop-validate.js` accepts a record only when every key is on the whitelist: a short id, an X handle, plain ASCII name and request, an ISO timestamp, a height from 0.5 m to 30 m, a position inside the playable city, and a paint spec the renderer already knows (rectangle, ellipse, polygon, line). Anything else is skipped. At most 500 remote records are added per session, and the file must be 2 MB or smaller.

Drop text is written into the page with `textContent`. The profile link is always `https://x.com/` plus the handle, and only after the handle matches the X rules. The game does not read X, and it does not call any X or AI API. Comment reading is disabled.
