# BizzyBee for Steam Deck (Decky backend). Talks to the BizzyBee server; keeps the device token on the Deck.
import json
import os
import urllib.request

import decky

BASE = "https://bizzybeee.netlify.app/.netlify/functions/deck"
PAIR_PAGE = "https://bizzybeee.netlify.app/src/features/pair/pair.html?c="
TOKEN_FILE = os.path.join(decky.DECKY_PLUGIN_SETTINGS_DIR, "token.json")


def _load():
    try:
        with open(TOKEN_FILE) as f:
            return json.load(f)
    except Exception:
        return {}


def _save(d):
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    with open(TOKEN_FILE, "w") as f:
        json.dump(d, f)
    try:
        os.chmod(TOKEN_FILE, 0o600)
    except Exception:
        pass


def _post(body, token=None):
    headers = {"content-type": "application/json"}
    if token:
        headers["authorization"] = "Device " + token
    req = urllib.request.Request(BASE, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            out = json.loads(e.read().decode())
        except Exception:
            out = {"ok": False, "error": "Server error"}
        out["status"] = e.code
        return out
    except Exception:
        return {"ok": False, "error": "No connection", "status": 0}


class Plugin:
    async def is_linked(self):
        return bool(_load().get("token"))

    async def start_pair(self):
        r = _post({"action": "start"})
        if r.get("ok"):
            _save({**_load(), "code": r["code"], "pollKey": r["pollKey"]})
            return {"ok": True, "url": PAIR_PAGE + r["code"]}
        return {"ok": False, "error": r.get("error", "Could not start")}

    async def poll_pair(self):
        d = _load()
        if not d.get("code"):
            return {"ok": False, "error": "Start again"}
        r = _post({"action": "poll", "code": d["code"], "pollKey": d["pollKey"]})
        if r.get("token"):
            _save({"token": r["token"]})
            return {"ok": True, "linked": True}
        if r.get("pending"):
            return {"ok": True, "linked": False}
        return {"ok": False, "error": r.get("error", "Expired")}

    async def snapshot(self):
        t = _load().get("token")
        if not t:
            return {"ok": False, "error": "Not linked"}
        r = _post({"action": "snapshot"}, t)
        if r.get("status") == 401:
            _save({})
        return r

    async def complete(self, kind, id):
        t = _load().get("token")
        return _post({"action": "complete", "kind": kind, "id": id}, t) if t else {"ok": False, "error": "Not linked"}

    async def push_games(self, games):
        t = _load().get("token")
        return _post({"action": "games", "games": games}, t) if t else {"ok": False}

    async def unlink(self):
        _save({})
        return True

    async def _main(self):
        decky.logger.info("BizzyBee loaded")

    async def _unload(self):
        pass
