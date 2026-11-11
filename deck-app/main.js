// BizzyBee for Steam Deck: a window that opens the live app (same account, same data as your phone).
const { app, BrowserWindow, shell } = require('electron');
const URL_ = 'https://bizzybeee.netlify.app/';
app.commandLine.appendSwitch('no-sandbox');   // AppImage on SteamOS: no setuid sandbox helper
function open() {
    const w = new BrowserWindow({ width: 1280, height: 800, backgroundColor: '#050402', autoHideMenuBar: true, fullscreen: !!process.env.SteamDeck, webPreferences: { contextIsolation: true } });
    w.loadURL(URL_);
    w.webContents.setWindowOpenHandler(({ url }) => { if (!url.startsWith(URL_)) { shell.openExternal(url); return { action: 'deny' }; } return { action: 'allow' }; });
}
app.whenReady().then(open);
app.on('window-all-closed', () => app.quit());
