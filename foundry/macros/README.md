# Beheaded Foundry macros: build from nothing

Foundry v14, PF2e 8.4.x. Every macro loads its files from this repo on GitHub, so push before running anything.

## Before you start

1. Push the repo: `powershell -ExecutionPolicy Bypass -File "C:\Dev\attackins\beheaded-refs\push.ps1" "message"`
2. Make a world on PF2e. Install and enable Anachronism (the Armory pulls SF2e base items through it; without it those items fall back to plain equipment).
3. Create the player characters and give each player ownership, so the journal macro can match private pages.

## Run order

For each macro: Macro Directory, Create Macro, Type: Script, paste the whole file, save, click it as GM.

| Step | Macro | What it makes | Needs |
| --- | --- | --- | --- |
| 1 | Beheaded_Armory_Builder.js | World compendium "Beheaded Armory", 333 items | Nothing |
| 2 | Beheaded_NPC_Import.js | Every NPC actor with art and ring tokens, in "The Beheaded" actor folder. Choose "Refresh stats, items and art" | Nothing |
| 3 | Beheaded_NPC_Inventories.js | Carried gear on 102 actors, worn armour, lootable | Steps 1 and 2 |
| 4 | Beheaded_Sholtan_Journals.js | GM module journals and "Sholtan: What You Know" with private character pages | Player characters owned by their players |
| 5 | Beheaded_Sholtan_Places.js | "Sholtan: Places": the world and six towns, with maps and city scenes | Nothing |

## Later

| Change | Do this |
| --- | --- |
| New or changed portraits or tokens | Push, then run step 2 with "Refresh art and tokens only" |
| Changed stat blocks | Push, run step 2 with "Refresh stats, items and art", then step 3 |
| Changed module or handout text | Set `REBUILD = true` in step 4, run once, set it back |
| New city scene | Set `REBUILD = true` in step 5, run once, set it back |
| Revealing a town's "On arrival" page | Right-click the page, Configure Ownership, Default: Observer |
