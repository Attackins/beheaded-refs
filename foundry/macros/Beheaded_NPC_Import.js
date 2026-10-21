// The Beheaded: NPC import (Foundry v14, PF2e 8.4.x)
// Creates or updates every Beheaded NPC from beheaded-npcs.json, with portrait art
// and dynamic-ring tokens. All files load from the public beheaded-refs repo.
// Run as a GM from a Script macro. Run order with the other Beheaded macros:
// Armory Builder, then this, then NPC Inventories, then Sholtan Journals.
// Actors made by the older importer are adopted by name, not duplicated.

const BASE = "https://raw.githubusercontent.com/Attackins/beheaded-refs/main/foundry/";
const ROOT_FOLDER = "The Beheaded";
// Flags live in the "world" scope: Foundry rejects getFlag/setFlag on any scope that
// isn't a system, module or "world".
const FLAG = "world";

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

console.log(`Beheaded import | Foundry ${game.version}, PF2e ${game.system.version}`);
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
    // Keep only traits the system knows; the full attack line stays in the description.
    const allowed = it.type === "melee" ? CONFIG.PF2E.npcAttackTraits : CONFIG.PF2E.actionTraits;
    if (allowed && it.system?.traits?.value) it.system.traits.value = it.system.traits.value.filter((t) => t in allowed);
    it.flags = { [FLAG]: { beheadedImported: true } };
    items.push(it);
  }
  for (const [slug, s] of Object.entries(entry.skills ?? {})) {
    if (slug in CONFIG.PF2E.skills) continue;
    items.push({
      name: slug.endsWith("-lore") ? titleCase(slug) : `${titleCase(slug)} Lore`,
      type: "lore",
      system: { mod: { value: s.base } },
      flags: { [FLAG]: { beheadedImported: true } },
    });
  }
  return items;
}

function splitLanguages(entry) {
  // Only real language slugs go in the list; "two regional" and the like go to the details line.
  const known = CONFIG.PF2E.languages ?? {};
  const value = [], extra = [];
  for (const l of entry.languages ?? []) {
    const slug = String(l).toLowerCase().trim().replace(/\s+/g, "-");
    if (slug in known) value.push(slug); else extra.push(String(l).trim());
  }
  const details = [entry.languageDetails, ...extra].filter(Boolean).join(", ");
  return { value: [...new Set(value)], details };
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
      languages: splitLanguages(entry),
      publication: { title: "The Beheaded", authors: "", license: "OGL", remaster: true },
    },
    traits: {
      value: (entry.traits ?? []).filter((t) => !CONFIG.PF2E.creatureTraits || t in CONFIG.PF2E.creatureTraits),
      rarity: entry.rarity ?? "common",
      size: { value: entry.size ?? "med" },
    },
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
const existing = new Map(game.actors.filter((a) => a.getFlag(FLAG, "beheadedKey")).map((a) => [a.getFlag(FLAG, "beheadedKey"), a]));
for (const a of game.actors) {
  if (a.type === "npc" && !a.getFlag(FLAG, "beheadedKey") && inRoot(a) && !existing.has(a.name)) existing.set(a.name, a);
}
const STAT_TYPES = new Set(["melee", "action", "lore", "spellcastingEntry", "spell", "effect"]);
let created = 0, updated = 0, skipped = 0;
const failed = [], badItems = [];
ui.notifications.info(`Importing ${data.length} Beheaded NPCs...`);

for (const entry of data) {
  try {
    const actor = existing.get(entry.name);
    const art = buildArt(entry);
    if (!actor) {
      const base = {
        name: entry.name,
        type: "npc",
        folder: folders[entry.folder].id,
        system: buildSystem(entry),
        flags: { [FLAG]: { beheadedKey: entry.name } },
        ...art,
        prototypeToken: { name: entry.name, disposition: CONST.TOKEN_DISPOSITIONS.NEUTRAL, ...(art.prototypeToken ?? {}) },
      };
      try {
        await Actor.create({ ...base, items: buildItems(entry) });
      } catch (err) {
        // One bad item shouldn't lose the whole NPC: create it bare, then add items one at a time.
        console.warn(`Beheaded import | ${entry.name}: retrying item by item`, err);
        const made = await Actor.create(base);
        for (const it of buildItems(entry)) {
          try { await made.createEmbeddedDocuments("Item", [it]); }
          catch (e) { badItems.push(`${entry.name}: ${it.name}`); console.warn(`Beheaded import | ${entry.name} / ${it.name}`, e); }
        }
      }
      created++;
    } else if (mode === "new") {
      skipped++;
    } else if (mode === "art") {
      if (entry.art) { await actor.update({ ...art, [`flags.${FLAG}.beheadedKey`]: entry.name }); updated++; } else skipped++;
    } else {
      const adopted = !actor.getFlag(FLAG, "beheadedKey");
      await actor.update({ system: buildSystem(entry), ...art, folder: folders[entry.folder].id, [`flags.${FLAG}.beheadedKey`]: entry.name });
      // Replace the stat items (strikes, abilities, lores). Carried gear stays.
      const old = actor.items.filter((it) => it.getFlag(FLAG, "beheadedImported") || (adopted && STAT_TYPES.has(it.type))).map((it) => it.id);
      if (old.length) await actor.deleteEmbeddedDocuments("Item", old);
      await actor.createEmbeddedDocuments("Item", buildItems(entry));
      updated++;
    }
  } catch (err) {
    console.error(`Beheaded import | ${entry.name}`, err);
    failed.push(`${entry.name}: ${err.message}`);
  }
}

const msg = `Beheaded import: ${created} created, ${updated} updated, ${skipped} skipped` +
  (failed.length ? `, ${failed.length} failed. First error: ${failed[0]}` : "") +
  (badItems.length ? `. ${badItems.length} items skipped (console).` : ".");
failed.length || badItems.length ? ui.notifications.warn(msg, { permanent: true }) : ui.notifications.info(msg);
if (failed.length) console.warn("Beheaded import | failed:", failed);
if (badItems.length) console.warn("Beheaded import | items skipped:", badItems);
