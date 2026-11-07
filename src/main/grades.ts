import { BrowserWindow } from "electron";
import * as db from "./db";
import { sendToRenderer } from "./ipc";
import { getLiveGameRef, lcuJson, onLcuStatusChange } from "./lcu";

// The client only publishes a game's mastery grades while its end-of-game
// screen is up; back in the lobby the endpoint answers 404 "not currently
// available". The update can also land a few seconds after the screen opens,
// hence the short retries, but nothing later than that can work.
const GRADE_CAPTURE_DELAYS_MS = [0, 3_000, 8_000, 20_000, 45_000];
const GRADES_PATH = "/lol-end-of-game/v1/champion-mastery-updates";

let win: BrowserWindow | null = null;
const capturePending = new Set<number>();

function shapeGrades(raw: any): db.GradeRow[] {
  const rows = new Map<string, db.GradeRow>();
  const add = (puuid: unknown, championId: unknown, grade: unknown) => {
    if (typeof puuid !== "string" || !puuid) return;
    if (typeof grade !== "string" || !grade.trim()) return;
    rows.set(puuid, { puuid, championId: Number(championId) || 0, grade: grade.trim() });
  };
  // memberGrades lists the premade, us included; the top-level grade is ours
  // alone and covers solo queue, where the list can come back empty.
  for (const member of Array.isArray(raw?.memberGrades) ? raw.memberGrades : []) {
    add(member?.puuid, member?.championId, member?.grade);
  }
  add(raw?.puuid, raw?.championId, raw?.grade);
  return [...rows.values()];
}

// 0 when the client has nothing for this game yet, or has already moved on to
// another one.
async function captureGameGrades(gameId: number): Promise<number> {
  const raw = await lcuJson(GRADES_PATH);
  if (!raw || Number(raw.gameId) !== gameId) return 0;
  const rows = shapeGrades(raw);
  if (rows.length === 0) return 0;
  db.saveGameGrades(gameId, rows);
  console.log(`Captured ${rows.length} mastery grade(s) for game ${gameId}`);
  sendToRenderer(win, "lcu:games-updated");
  return rows.length;
}

function startGameCapture(gameId: number) {
  if (capturePending.has(gameId) || db.hasGameGrades(gameId)) return;
  capturePending.add(gameId);

  void (async () => {
    try {
      for (const delay of GRADE_CAPTURE_DELAYS_MS) {
        if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
        try {
          if ((await captureGameGrades(gameId)) > 0) return;
        } catch (err) {
          console.log(`Grade capture for game ${gameId} failed:`, err);
        }
      }
    } finally {
      capturePending.delete(gameId);
    }
  })();
}

// The game the end-of-game screen is showing. The live ref covers a match this
// process watched end; for one that ended before the app opened, the gameflow
// session still names it while the screen is up.
async function capturableGameId(): Promise<number | null> {
  const live = getLiveGameRef();
  if (live) return live.gameId;
  const session = await lcuJson("/lol-gameflow/v1/session");
  const gameId = Number(session?.gameData?.gameId);
  return Number.isFinite(gameId) && gameId > 0 ? gameId : null;
}

// Leaving a match is the transition back to "connected", which is the moment
// the end-of-game screen opens. Connecting with the screen already up arrives
// the same way.
export function startGradeTracking(window: BrowserWindow) {
  win = window;
  onLcuStatusChange((status) => {
    if (status !== "connected") return;
    void (async () => {
      const gameId = await capturableGameId();
      if (gameId != null) startGameCapture(gameId);
    })();
  });
}
