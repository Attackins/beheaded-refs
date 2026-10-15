// The Beheaded: NPC import (Foundry v14, PF2e 8.4.x)
// Creates or updates every Beheaded NPC from beheaded-npcs.json, with portrait art
// and dynamic-ring tokens. All files load from the public beheaded-refs repo.
// Run as a GM from a Script macro. Run order with the other Beheaded macros:
// Armory Builder, then this, then NPC Inventories, then Sholtan Journals.
// Actors made by the older importer are adopted by name, not duplicated.

const BASE = "https://raw.githubusercontent.com/Attackins/beheaded-refs/main/foundry/";
const ROOT_FOLDER = "The Beheaded";
const FLAG = "beheaded";

// Ring colours. Ring is the scarf red for members; the fill behind the bust is the Corps colour.
const SCARF = "#b3261e";
const CORPS = {
  "faith-militant": { ring: SCARF, background: "#2f4a32" },
  medical:          { ring: SCARF, background: "#1f3a5f" },
  engineer:         { ring: SCARF, background: "#6e1c1c" },
  natural:          { ring: SCARF, background: "#5a3e24" },
  scholarly:        { ring: SCARF, background: "#3a3a3e" },
  civil:            { ring: SCARF, background: "#a07a2c" },
  agrarian:         { ring: SCARF, background: "#c0601c" },
  arts:             { ring: SCARF, background: "#56294b" },
  automaton:        { ring: SCARF, background: "#7a5c28" },
  penitent:         { ring: SCARF, background: "#3b1414" },
  outsider:         { ring: "#9a9a9a", background: "#4a4a4a" },
};

if (!game.user.isGM) return ui.notifications.error("Run this as a GM.");

const mode = await foundry.applications.api.DialogV2.wait({
  window: { title: "Import the Beheaded NPCs" },
  content: `<p>Creates any NPC that isn't in the world yet, inside the <b>${ROOT_FOLDER}</b> folder.</p>
            <p>For NPCs already imported, choose what to refresh.</p>`,
  buttons: [
    { action: "full", label: "Refresh stats, items and art", default: true },
    { action: "art", label: "Refresh art and tokens only" },
    { action: "new", label: "Only add missing NPCs" },
  ],
  rejectClose: false,
});
if (!mode) return;

let data;
try {
  const res = await fetch(`${BASE}beheaded-npcs.json?t=${Date.now()}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  data = await res.json();
} catch (err) {
  return ui.notifications.error(`Couldn't load beheaded-npcs.json: ${err.message}`);
}

// Folders
async function getFolder(name, parent = null) {
  const found = game.folders.find((f) => f.type === "Actor" && f.name === name && (f.folder?.id ?? null) === (parent?.id ?? null));
  return found ?? Folder.create({ name, type: "Actor", folder: parent?.id ?? null });
}
const root = await getFolder(ROOT_FOLDER);
const folders = {};
for (const name of new Set(data.map((d) => d.folder))) folders[name] = await getFolder(name, root);

// Helpers
const artUrl = (slug) => `${BASE}art/${slug}.webp`;
const tokenUrl = (slug) => `${BASE}tokens/${slug}.webp`;
const titleCase = (s) => s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function parseIWR(text, kind) {
  // Keeps only entries the system recognises; everything else stays readable in the notes.
  const table = { resistances: CONFIG.PF2E.resistanceTypes, weaknesses: CONFIG.PF2E.weaknessTypes, immunities: CONFIG.PF2E.immunityTypes }[kind];
  const out = [];
  for (const raw of (text ?? "").split(/[,;]/)) {
    const lower = raw.toLowerCase();
    const except = lower.match(/\(except ([a-z -]+)\)/)?.[1]?.trim().replace(/\s+/g, "-");
    const part = lower.replace(/\(.*?\)/g, "").trim();
    if (!part) continue;
    const m = part.match(/^([a-z][a-z -]*?)(?:\s+(\d+))?$/);
    if (!m) continue;
    const type = m[1].trim().replace(/\s+/g, "-");
    if (!(type in table)) continue;
    const entryOut = kind === "immunities" ? { type } : m[2] ? { type, value: Number(m[2]) } : null;
    if (!entryOut) continue;
    if (except && kind === "resistances" && CONFIG.PF2E.materialDamageEffects?.[except]) entryOut.exceptions = [except];
    out.push(entryOut);
  }
  return out;
}

function parseSenses(notes) {
  const line = (notes ?? "").match(/Perception<\/strong>\s*[+-]?\d+;?([^<]*)/i)?.[1] ?? "";
  const senses = [];
  if (/greater darkvision/i.test(line)) senses.push({ type: "greater-darkvision" });
  else if (/darkvision/i.test(line)) senses.push({ type: "darkvision" });
  if (/low-light vision/i.test(line)) senses.push({ type: "low-light-vision" });
  return { senses, details: line.trim() };
}

function buildItems(entry) {
  const items = [];
  for (const raw of entry.items ?? []) {
    const it = foundry.utils.deepClone(raw);
    delete it._kind;
    if (it.type === "melee") {
      delete it.system.action;
      delete it.system.subjectToMAP;
    }
    it.flags = { [FLAG]: { imported: true } };
    items.push(it);
  }
  for (const [slug, s] of Object.entries(entry.skills ?? {})) {
    if (slug in CONFIG.PF2E.skills) continue;
    items.push({
      name: slug.endsWith("-lore") ? titleCase(slug) : `${titleCase(slug)} Lore`,
      type: "lore",
      system: { mod: { value: s.base } },
      flags: { [FLAG]: { imported: true } },
    });
  }
  return items;
}

function buildSystem(entry) {
  const skills = {};
  for (const [slug, s] of Object.entries(entry.skills ?? {})) if (slug in CONFIG.PF2E.skills) skills[slug] = { base: s.base };
  const { senses, details } = parseSenses(entry.notes);
  const ab = entry.abilities ?? {};
  return {
    abilities: Object.fromEntries(["str", "dex", "con", "int", "wis", "cha"].map((k) => [k, { mod: ab[k] ?? 0 }])),
    attributes: {
      ac: { value: entry.ac, details: "" },
      hp: { value: entry.hp, max: entry.hp, temp: 0, details: entry.hpDetails ?? "" },
      speed: { value: entry.speed, otherSpeeds: [], details: entry.speedDetails ?? "" },
      allSaves: { value: "" },
      resistances: parseIWR(entry.iwr?.resistances, "resistances"),
      weaknesses: parseIWR(entry.iwr?.weaknesses, "weaknesses"),
      immunities: parseIWR(entry.iwr?.immunities, "immunities"),
    },
    perception: { mod: entry.perception, details, senses, vision: true },
    saves: Object.fromEntries(["fortitude", "reflex", "will"].map((k) => [k, { value: entry.saves?.[k] ?? 0, saveDetail: "" }])),
    skills,
    details: {
      level: { value: entry.level },
      blurb: entry.blurb ?? "",
      publicNotes: entry.notes ?? "",
      privateNotes: "",
      languages: { value: entry.languages ?? [], details: entry.languageDetails ?? "" },
      publication: { title: "The Beheaded", authors: "", license: "OGL", remaster: true },
    },
    traits: { value: entry.traits ?? [], rarity: entry.rarity ?? "common", size: { value: entry.size ?? "med" } },
  };
}

function buildArt(entry) {
  if (!entry.art) return {};
  const colors = CORPS[entry.corps] ?? CORPS.outsider;
  return {
    img: artUrl(entry.art),
    prototypeToken: {
      texture: { src: tokenUrl(entry.art) },
      ring: { enabled: true, colors, effects: 1, subject: { scale: 1, texture: tokenUrl(entry.art) } },
    },
  };
}

// Import
// Actors from this macro carry a flag. Actors from the older importer don't, so any
// NPC inside the "The Beheaded" folder tree with a matching name is adopted instead
// of duplicated.
const inRoot = (a) => { let f = a.folder; while (f) { if (f.id === root.id) return true; f = f.folder; } return false; };
const existing = new Map(game.actors.filter((a) => a.getFlag(FLAG, "key")).map((a) => [a.getFlag(FLAG, "key"), a]));
for (const a of game.actors) {
  if (a.type === "npc" && !a.getFlag(FLAG, "key") && inRoot(a) && !existing.has(a.name)) existing.set(a.name, a);
}
const STAT_TYPES = new Set(["melee", "action", "lore", "spellcastingEntry", "spell", "effect"]);
let created = 0, updated = 0, skipped = 0, failed = [];
ui.notifications.info(`Importing ${data.length} Beheaded NPCs...`);

for (const entry of data) {
  try {
    const actor = existing.get(entry.name);
    const art = buildArt(entry);
    if (!actor) {
      await Actor.create({
        name: entry.name,
        type: "npc",
        folder: folders[entry.folder].id,
        system: buildSystem(entry),
        items: buildItems(entry),
        flags: { [FLAG]: { key: entry.name } },
        ...art,
        prototypeToken: { name: entry.name, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, ...(art.prototypeToken ?? {}) },
      });
      created++;
    } else if (mode === "new") {
      skipped++;
    } else if (mode === "art") {
      if (entry.art) { await actor.update({ ...art, [`flags.${FLAG}.key`]: entry.name }); updated++; } else skipped++;
    } else {
      const adopted = !actor.getFlag(FLAG, "key");
      await actor.update({ system: buildSystem(entry), ...art, folder: folders[entry.folder].id, [`flags.${FLAG}.key`]: entry.name });
      // Replace the stat items (strikes, abilities, lores). Carried gear stays.
      const old = actor.items.filter((it) => it.getFlag(FLAG, "imported") || (adopted && STAT_TYPES.has(it.type))).map((it) => it.id);
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
      await actor.createEmbeddedDocuments("Item", buildItems(entry));
      updated++;
    }
  } catch (err) {
    console.error(`Beheaded import | ${entry.name}`, err);
    failed.push(entry.name);
  }
}

const msg = `Beheaded import: ${created} created, ${updated} updated, ${skipped} skipped${failed.length ? `, ${failed.length} failed (see console)` : ""}.`;
failed.length ? ui.notifications.warn(msg) : ui.notifications.info(msg);
if (failed.length) console.warn("Beheaded import | failed:", failed);
