import { definePlugin, callable } from '@decky/api';
import { PanelSection, PanelSectionRow, ButtonItem, Focusable } from '@decky/ui';
import { useEffect, useState } from 'react';
import qrcode from 'qrcode-generator';

const isLinked = callable<[], boolean>('is_linked');
const startPair = callable<[], any>('start_pair');
const pollPair = callable<[], any>('poll_pair');
const getSnapshot = callable<[], any>('snapshot');
const complete = callable<[string, string], any>('complete');
const pushGames = callable<[any[]], any>('push_games');
const checkUpdate = callable<[], any>('check_update');
const installUpdate = callable<[], any>('install_update');
const unlink = callable<[], boolean>('unlink');

// ---- Games: hours played + achievements, read from the Steam client (best effort) ----
async function readGames(): Promise<any[]> {
  const out: any[] = [];
  try {
    const apps: any[] = (window as any).appStore?.allApps || [];
    for (const a of apps) {
      const minutes = a.minutes_playtime_forever || 0;
      if (!a.appid || !minutes) continue;
      let ach = 0, achTotal = 0;
      try {
        const p = await (window as any).appAchievementProgressCache?.GetAchievementProgress?.(a.appid);
        if (p) { ach = p.nAchieved ?? p.achieved ?? 0; achTotal = p.nTotal ?? p.total ?? 0; }
      } catch {}
      out.push({ appid: String(a.appid), name: a.display_name || 'Game', minutes, ach, achTotal, lastPlayed: a.rt_last_time_played || 0 });
    }
  } catch {}
  return out;
}
async function syncGames() {
  try { if (!(await isLinked())) return; const g = await readGames(); if (g.length) await pushGames(g); } catch {}
}

// ---- QR ----
function Qr({ text }: { text: string }) {
  const q = qrcode(0, 'M'); q.addData(text); q.make();
  const n = q.getModuleCount(), cell = 5, size = (n + 2) * cell;
  const rects: any[] = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) rects.push(<rect key={r * n + c} x={(c + 1) * cell} y={(r + 1) * cell} width={cell} height={cell} />);
  return <svg viewBox={`0 0 ${size} ${size}`} style={{ width: '100%', background: '#fff', borderRadius: 8 }}><g fill="#000">{rects}</g></svg>;
}

function Content() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [pairUrl, setPairUrl] = useState('');
  const [snap, setSnap] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [upd, setUpd] = useState<any>(null);
  useEffect(() => { checkUpdate().then(r => { if (r?.available) setUpd(r); }).catch(() => {}); }, []);
  const updateRow = upd ? (<PanelSection title="Update ready"><PanelSectionRow><ButtonItem layout="below" onClick={async () => { setMsg('Updating…'); const r = await installUpdate(); setMsg(r?.ok ? 'Restarting Decky…' : (r?.error || 'Failed')); }}>Install {upd.latest}</ButtonItem></PanelSectionRow></PanelSection>) : null;

  const load = async () => {
    const l = await isLinked(); setLinked(l);
    if (l) { const r = await getSnapshot(); if (r?.status === 401) setLinked(false); else setSnap(r?.snapshot || null); }
  };
  useEffect(() => { load(); }, []);

  // While a QR is showing, check every 3 seconds if the phone approved it.
  useEffect(() => {
    if (!pairUrl) return;
    const t = setInterval(async () => {
      const r = await pollPair();
      if (r?.linked) { setPairUrl(''); load(); syncGames(); }
      else if (!r?.ok) { setPairUrl(''); setMsg(r?.error || 'Code expired.'); }
    }, 3000);
    return () => clearInterval(t);
  }, [pairUrl]);

  const check = async (kind: string, id: string) => {
    const r = await complete(kind, id);
    setMsg(r?.ok ? (kind === 'habit' ? '+1 logged' : 'Done!') : (r?.error || 'Failed'));
    if (kind !== 'habit' && snap) {
      const key = kind === 'daily' ? 'dailies' : 'todos';
      setSnap({ ...snap, [key]: snap[key].map((t: any) => (t.id === id ? { ...t, done: true } : t)) });
    }
  };

  if (linked === null) return <PanelSection title="BizzyBee"><PanelSectionRow>Loading…</PanelSectionRow></PanelSection>;

  if (!linked) return (
    <><PanelSection title="BizzyBee">
      {pairUrl ? (
        <>
          <PanelSectionRow><div style={{ padding: 4 }}><Qr text={pairUrl} /></div></PanelSectionRow>
          <PanelSectionRow><div style={{ fontSize: 12, textAlign: 'center' }}>Scan with your phone (signed in to BizzyBee), then tap Link it.</div></PanelSectionRow>
          <PanelSectionRow><ButtonItem layout="below" onClick={() => setPairUrl('')}>Cancel</ButtonItem></PanelSectionRow>
        </>
      ) : (
        <PanelSectionRow>
          <ButtonItem layout="below" onClick={async () => { setMsg(''); const r = await startPair(); if (r?.ok) setPairUrl(r.url); else setMsg(r?.error || 'Failed'); }}>Link to BizzyBee</ButtonItem>
        </PanelSectionRow>
      )}
      {msg && <PanelSectionRow><div style={{ fontSize: 12 }}>{msg}</div></PanelSectionRow>}
    </PanelSection>{updateRow}</>
  );

  const group = (title: string, kind: string, list: any[], habit = false) => (
    <PanelSection title={title}>
      {(list || []).length === 0 && <PanelSectionRow><div style={{ fontSize: 12, opacity: 0.7 }}>Nothing here.</div></PanelSectionRow>}
      {(list || []).map((t: any) => (
        <PanelSectionRow key={t.id}>
          <ButtonItem layout="below" disabled={!habit && t.done} onClick={() => check(kind, t.id)}>
            {habit ? '＋ ' : t.done ? '✓ ' : '☐ '}{t.title}
          </ButtonItem>
        </PanelSectionRow>
      ))}
    </PanelSection>
  );

  return (
    <>
      {updateRow}
      <PanelSection title={snap ? `BizzyBee · Lv ${snap.level}` : 'BizzyBee'}>
        {snap && <PanelSectionRow><div style={{ fontSize: 12 }}>{snap.xpToNext} XP to next level</div></PanelSectionRow>}
        {msg && <PanelSectionRow><div style={{ fontSize: 12 }}>{msg}</div></PanelSectionRow>}
        <PanelSectionRow><ButtonItem layout="below" onClick={() => { syncGames(); load(); setMsg('Synced'); }}>Sync now</ButtonItem></PanelSectionRow>
      </PanelSection>
      {snap ? (<>{group('Dailies', 'daily', snap.dailies)}{group('To-dos', 'todo', snap.todos)}{group('Habits', 'habit', snap.habits, true)}</>) : (
        <PanelSection><PanelSectionRow><div style={{ fontSize: 12 }}>Open BizzyBee on your phone once so it can send today's tasks.</div></PanelSectionRow></PanelSection>
      )}
      <PanelSection>
        <PanelSectionRow><ButtonItem layout="below" onClick={async () => { await unlink(); setLinked(false); setSnap(null); }}>Unlink this Deck</ButtonItem></PanelSectionRow>
      </PanelSection>
    </>
  );
}

export default definePlugin(() => {
  syncGames();
  const timer = setInterval(syncGames, 10 * 60 * 1000);   // every 10 minutes
  return { name: 'BizzyBee', titleView: <div>BizzyBee</div>, content: <Content />, icon: <span>🐝</span>, onDismount() { clearInterval(timer); } };
});
