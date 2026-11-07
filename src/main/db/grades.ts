import { db } from "./connection";

export type GradeRow = { puuid: string; championId: number; grade: string };

export function saveGameGrades(gameId: number, rows: GradeRow[]): void {
  const write = db.prepare(
    "INSERT OR REPLACE INTO game_grades (game_id, puuid, champion_id, grade) VALUES (?, ?, ?, ?)",
  );
  db.transaction(() => {
    for (const row of rows) write.run(gameId, row.puuid, row.championId, row.grade);
  })();
}

export function hasGameGrades(gameId: number): boolean {
  return !!db.prepare("SELECT 1 FROM game_grades WHERE game_id = ? LIMIT 1").get(gameId);
}
