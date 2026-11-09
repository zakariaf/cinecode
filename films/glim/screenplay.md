# Glim

## Logline

A little mouse, caught out in the forest after dark and too frightened to find her way, is led home by a firefly.

**Theme:** the dark is less frightening when you find the light in it. Tilly's first line ("It's so dark") is answered
by her last ("The dark has lights in it"), said looking up at a forest full of fireflies.

## Characters

### Tilly, a field mouse (lead)
- **Rig:** `mouse`
- **Look:** default grey-brown fur, cast `scale` 1.15.
- **Personality:** small and quick, but frozen by the dark; once she has a light to follow she runs.
- **Voice:** `Leda`, tone "small, high"

### Glim, a firefly
- **Rig:** `butterfly` (there is no firefly rig): dark brown wings (`col` `#4a3a2c`, `col2` `#5e4632`, `tip` `#2a1e18`),
  a glowing yellow body (`body` `#f6d94a`), cast `scale` 0.6; a warm glow drawn around him by a custom overlay
  (`firefly-glow`, on the `grade` layer so the night grade doesn't grey it).
- **Personality:** bright, kind, unafraid; comes from the direction of home.
- **Voice:** `Puck`, tone "bright, kind"

No narrator.

## Locations and times

| # | Location (kit) | Time | Anchors used | Purpose | Length |
|---|---|---|---|---|---|
| 1 | the forest path (`forest`) | `night` | `path_mid`, `oak_front`, `den` | lost, found, led home | 20 s |

**Length target:** about 25 s with a 3 s opening card and a 3 s end card: 6 shots, 4 lines.

## Music plan

**Motif:** `G4:1 C5:0.5 E5:0.5 D5:1 C5:2` in `C`. The firefly's tune: a hint when he arrives, in full on the music box
over the last image.

| Scene | Mood | Motif | Stings and sound |
|---|---|---|---|
| 1.1–1.2 | `night` 0.3 | none | `owl-hoot` in 1.1, `gasp` from Tilly |
| 1.3 | `night` 0.3 | | `magic` sting as Glim arrives |
| 1.4 | `tender` 0.4 | first 3 notes on `flute` | footsteps automatic |
| 1.6 | `tender` 0.45 | full motif on `music-box`, `hold` | |

Lengths after voicing: 2.5 s card + 1.1 2.6 s, 1.2 4.5 s, 1.3 3.9 s, 1.4 4.9 s, 1.5 2.0 s, 1.6 4.3 s + 2.5 s card = 27.2 s.

## Screenplay

### Scene 1: The forest path, night (0:02.5–0:24.7)

**Starting places:** Tilly on the path at `x:1820` facing left, standing; Glim offstage left.

**1.1** wide on Tilly at 0.45 zoom, push-in. The dark forest; a tiny mouse alone on the path. An owl hoots somewhere.

**1.2** close on Tilly, static. She flinches at the hoot (gasp), scared.
TILLY (small, scared): "It's so dark. Where's home?"

**1.3** full on Tilly and Glim, static. A warm light floats in from the left: Glim flies in and settles on the path a
little way ahead of her (`x:1760`). She looks at him.
GLIM (bright, kind): "Don't be scared. Follow me!"

**1.4** wide on both, track. Glim flies left along the path toward the great oak; Tilly runs after him, past him and
up into her den (`den`) in the oak.

**1.5** close on Tilly in the den's doorway, static. She turns back to Glim (below, off frame).
TILLY (soft, grateful): "Thank you, Glim."

**1.6** full on Tilly, pull-out (to 0.22×). Glim flies up and settles on her head; fireflies wake all around the oak
(custom overlay `firefly-swarm` from the `lights` mark). Tilly sits up and looks up, happy.
TILLY (soft): "The dark has lights in it."

## Ending and final image

Tilly at the door of her den in the oak, Glim glowing on her head, looking up at a forest full of fireflies. The opening's "It's so dark" is
answered: the same dark, now full of small lights.
