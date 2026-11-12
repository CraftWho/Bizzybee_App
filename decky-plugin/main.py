# BizzyBee for Steam Deck (Decky backend). Talks to the BizzyBee server; keeps the device token on the Deck.
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
import urllib.request
import zipfile

import decky

BASE = "https://bizzybeee.netlify.app/.netlify/functions/deck"
UPDATE_BASE = "https://bizzybeee.netlify.app/decky-plugin/"
PLUGIN_DIR = decky.DECKY_PLUGIN_DIR
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


def _local_build():
    try:
        with open(os.path.join(PLUGIN_DIR, "build.json")) as f:
            return json.load(f)
    except Exception:
        return {"build": 0, "version": "0"}


def _get(url, raw=False):
    with urllib.request.urlopen(urllib.request.Request(url, headers={"cache-control": "no-cache"}), timeout=60) as r:
        data = r.read()
    return data if raw else json.loads(data.decode())


class Plugin:
    async def check_update(self):
        mine = _local_build()
        try:
            latest = _get(UPDATE_BASE + "version.json")
        except Exception:
            return {"ok": False, "current": mine.get("version")}
        return {"ok": True, "current": mine.get("version"), "latest": latest.get("version"), "available": int(latest.get("build", 0)) > int(mine.get("build", 0))}

    async def install_update(self):
        # Downloads the new zip, checks its fingerprint, copies it over this plugin, restarts Decky.
        try:
            latest = _get(UPDATE_BASE + "version.json")
            data = _get(UPDATE_BASE + "BizzyBee-decky.zip", raw=True)
            if hashlib.sha256(data).hexdigest() != latest.get("sha256"):
                return {"ok": False, "error": "Download did not match. Try again."}
            tmp = tempfile.mkdtemp()
            zp = os.path.join(tmp, "u.zip")
            with open(zp, "wb") as f:
                f.write(data)
            with zipfile.ZipFile(zp) as z:
                z.extractall(tmp)
            src = os.path.join(tmp, "BizzyBee")
            if not os.path.isfile(os.path.join(src, "main.py")):
                return {"ok": False, "error": "Bad update file."}
            for name in os.listdir(src):
                dst = os.path.join(PLUGIN_DIR, name)
                if os.path.isdir(dst):
                    shutil.rmtree(dst)
                if os.path.isdir(os.path.join(src, name)):
                    shutil.copytree(os.path.join(src, name), dst)
                else:
                    shutil.copy2(os.path.join(src, name), dst)
            subprocess.Popen("sleep 2; systemctl restart plugin_loader", shell=True, start_new_session=True)
            return {"ok": True}
        except Exception as e:
            return {"ok": False, "error": "Update failed: " + str(e)[:80]}

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
