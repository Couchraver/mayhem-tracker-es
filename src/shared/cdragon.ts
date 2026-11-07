// CommunityDragon serves the game's own assets per patch branch ("latest",
// "pbe", or a patch like "16.14"). Both processes build these URLs — the
// renderer for every icon it draws, the main process when it goes looking for
// art a retired augment left behind — so the shape lives here.

// Turns a game-data icon path (as items.json and cherry-augments.json name it)
// into a raw asset URL on the given branch.
export function cdragonAssetUrl(branch: string, iconPath: string): string {
  return `https://raw.communitydragon.org/${branch}/game/${iconPath
    .replace("/lol-game-data/assets/", "")
    .toLowerCase()}`;
}

export function cherryAugmentsUrl(branch: string): string {
  return `https://raw.communitydragon.org/${branch}/plugins/rcp-be-lol-game-data/global/es_mx/v1/cherry-augments.json`;
}
