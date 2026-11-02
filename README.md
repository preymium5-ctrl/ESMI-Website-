# ESMI — From the sun. To the sea.

This is the independent cinematic website in `D:\ESMI WEB`. It does not load,
embed, or link to the previous boat explorer or driving website.

Run `npm run dev` here and open **http://localhost:5174/**. No installation or
build step is needed. The earlier website continues separately on port 5173.

## Experience

The opening landing page places the ESMI solar catamaran beside a timber dock
on blue ocean water, with tropical trees and a forested mountain coastline.
Its centered mixed serif/sans headline, minimal navigation, rounded controls,
cursor-responsive water and animated right-side menu follow the supplied Unseen
interaction reference.
`landing.css` and `landing.js` contain this presentation independently of the
engineering stage. `landing-effects.js` and `landing-effects.css` add inertial
projective camera movement, matching headline perspective, a trailing cursor,
magnetic controls and video-texture water ripples. The browser plays the native
video continuously; a transparent WebGL overlay runs only while cursor wakes
are visible. Video, poster and overlay share the same compositor perspective,
preventing a layer switch from moving the background. Texture storage is reused
between decoded frames. Actual mouse input enables
the effects even inside a narrow desktop browser pane. Effects pause offscreen
and fall back to the original video for touch, reduced motion or unavailable
WebGL. Ocean masks keep the vessel and dock rigid while cursor ripples affect
the water. Camera movement adapts to the boat's bounds to protect its framing.
This applies perspective to the Flow video; it is not a full geometric reconstruction.
The menu
slides over the right side and staggers its serif links while the fixed
two-dot control morphs into a close icon;
Escape and backdrop clicks reverse the transition before restoring focus.
Its exact font pair is Neue Montreal and Saol Display, identified from
https://unseen.co/ and stored in `assets/fonts/`.

Google Flow generated landscape and portrait dock artwork using the original
ESMI boat photo as its product reference. The desktop background is
`assets/landing/dock.mp4`; phones use `dock-portrait.mp4`, with matching WebP
posters. Both dock loops are eight seconds, 24 fps, Flow-enhanced 1080p with
native ocean ambience. Tall phone layouts use the portrait scene; wider browser
panes keep the landscape scene with a crop aligned to the boat. The original
architectural backgrounds remain in the same folder as
`hero.mp4` and `hero-portrait.mp4`. Media selection responds to
viewport changes, starts muted, pauses offscreen, and respects reduced motion.
The landing's Explore button enters at the beginning of the existing assembly;
Film opens the same cinematic stage. Media provenance and rebuild settings live
in `assets/landing/production.json` and `scripts/build-landing.ps1`.

Scroll to assemble the boat; scroll upward to reverse. The V2 sequence includes
the electric drive, battery, controller, and cable looms as separated internal
parts that move into place before the exterior assembly closes around them.
These internals use an **illustrative internal layout** approved for this visual
story, rather than undisclosed production specifications.

The final assembled image is the exact decoded opening frame of the 50-second
film. Studio framing leaves room for component descriptions, then settles into
the film's exact destination rectangle before completion. Stills and decoded
video share one canvas. There is no second video section or modal.

The film begins automatically after assembly. Watch the film jumps to that same
stage. Pause, replay, seek, return to engineering, and sound controls are
available. Autoplay starts muted; **Sound on** enables the balanced native scene
ambience. Reduced motion preferences require an explicit film start. The browser
begins normal media buffering during the last quarter of assembly without a
second copy of the film in JavaScript memory.

## Blender assembly (current)

The scroll assembly is now a Blender render. `scripts/blender/esmi_boat.py`
builds the boat from `reference/esmi-product.jpeg` in Blender 5.2 (scene
"ESMI Boat"): about 120 keyframed parts with materials, a white studio cove,
area lights and an animated camera that settles onto the film's framing.
Frames 1-241 (exploded to assembled) are rendered with Cycles to
`assets/v3/frames/`, and `assets/v3/assembly.json` is the active manifest. When
the film starts, the last rendered frame dissolves into the film's opening.
To rebuild: open Blender, run the script from the Scripting tab (or through the
Blender MCP connection), then Render > Render Animation. Battery, wiring and
outboard placement remain an illustrative internal layout.

## SVG exploded assembly (previous)

The scroll assembly is now drawn live as SVG by `svg-assembly.js` (styles in
`svg-assembly.css`). The boat is modelled from `reference/esmi-product.jpeg` as about 120
separate parts: deep two-tone hull sections with raked ends, trims and vents,
cross beams, an illustrative electric outboard, eight battery modules, bus bars,
controllers, cable looms, a flush deck, square aluminium uprights with Y-branches,
rail posts and a rounded perimeter rail, roof beams, four bucket seats on box
bases, the white ESMI console with windscreen and wheel, and twelve solar modules. Each
part has an exploded position and flies home during its chapter, with dashed
guide lines, landing pulses, cable draw-on, a spinning propeller and wheel,
callout labels and a solar glint. The manifest flag `"svgAssembly": true` in
`assets/v2/assembly.json` turns it on; its `chapters` windows drive the timing.
Near completion the SVG crossfades into the photographic handoff, so the film
still starts from its exact opening frame. Remove the flag (or restore
`reference/svg-assembly-backup/`) to return to the photographic frame sequence.

## Media

Google Flow generated the product imagery and clips using the supplied ESMI
reference. Project: https://flow.google.com/project/baaf1cc5-dd14-41a1-899d-e23a1eb31a35

V2 media is **Google Flow-enhanced 1920×1080**, 24 fps. The advertisement is
exactly **50 seconds / 1,200 frames**, with seven shots, one-second dissolves,
balanced source ambience, and a baked ESMI closing title at 47–50 seconds. The
website headline hides during that closing title to avoid duplicate text.
No voiceover or music is claimed for the native-ambience version.

The 1080p sources live in `assets/source/v2/`; the finished release and its
metadata live in `assets/v2/`. The earlier 720p / 30-second media remains in
`assets/` as a separate recoverable release. The build scripts reject 720p input
instead of stretching it into a purported 1080p source.

Rebuild the advertisement with `scripts/build-film.ps1 -SourceAudio`. The film
builder also accepts `-MusicFile` for an existing authorized soundtrack, or
neither audio option for silence; these options are mutually exclusive.

Rebuild the assembly with `scripts/build-assembly.ps1`. Its `-Sources` option
accepts the two disassembly passes in source order: assembled exterior to the
internal-installed anchor, then that anchor to the fully separated internal
parts. The builder concatenates the selected passes and reverses them into the
scroll sequence. `-Starts` and `-Durations` select each source window;
`-ChapterFile` supplies timing labels and `-EndpointBlendFrames` controls the
short static endpoint blend. Use the actual source files and windows recorded
in `assets/v2/assembly-metadata.json` when rebuilding, rather than draft clips.
The terminal PNG is always extracted from the final encoded advertisement.

The imagery is an AI visual interpretation of the product. Small fittings and
support spacing may vary between generated shots. It is not a manufacturing
model. The supplied TikTok clip is a style reference only, and is not embedded
in the website.

## Validation

`npm run check` verifies JavaScript syntax. `npm test` checks the selected media
release, reversible frame mapping, uneven internal-chapter timings, responsive
framing, film metadata, exact opening-frame pixels and every assembly frame.
Use `ESMI_MEDIA_VERSION=v2` when validating the prepared V2 media before activation.

JavaScript lives in `app.js` and `timeline.js`; the presentation is `index.html`
and `styles.css`. Canvas frame caching is bounded to 10 images on desktop and
6 images on phones. The local media
server supports byte ranges for seeking.

## Media release configuration

The active manifest is selected by the `experience-config` JSON script in
`index.html`. The active V2 release points to `./assets/v2/assembly.json`; the preserved
legacy release points to `./assets/assembly.json`. A release is built and
validated separately before changing that single manifest path.
The app also accepts a selector file using `{"selector":"./assets/experience.json"}`,
whose JSON supplies a `manifest` path. Asset paths inside manifests are relative
to the website document, so a V2 frame path should include `./assets/v2/`.

The manifest supplies `width`, `height`, `frames`, and optional `handoff`. Its
optional `chapters` array supplies `start` and `end` as fractions of the assembly,
plus `title`, `label`, `copy`, `material`, `nav`, and `illustrative`. Internal
component chapters set `illustrative: true`, which displays **Illustrative
internal layout**. The alternative `internalLayout: true` provides nine default
chapters: hulls, electric drive, battery, controller/wiring, deck, frame, seating,
helm and solar canopy.

Optional `film` metadata supplies `src`, `poster`, `duration`, `width`, `height`,
`hasAudio`, `audioKind`, `oceanAt`, `endcardAt`, and `cues`. Cues supply a `start`
time in seconds, `eyebrow`, `title` or `titleHTML`, and `copy`. Assembly chapter
headlines also accept `title` or `titleHTML`. A 50-second film gets seven default
advertisement cues when explicit cues are omitted. Dimensions, chapters,
navigation and controls update from this metadata; the preserved 30-second
release remains compatible. Stills and video use one shared framing function,
with identical placement at the completed-boat handoff.
