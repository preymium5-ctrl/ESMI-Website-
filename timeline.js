export const STORY = Object.freeze({ begin: .055, assembled: .9, film: .965 });
export const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));

export function chapterAtProgress(value, chapters = 6) {
  const progress = clamp(Number(value) || 0);
  if (!Array.isArray(chapters)) {
    const count = Math.max(1, Number(chapters) || 1);
    return Math.min(count - 1, Math.floor(progress * count));
  }
  if (!chapters.length) return 0;
  let index = 0;
  for (let i = 1; i < chapters.length; i++) {
    if (progress + 1e-9 < Number(chapters[i].start ?? i / chapters.length)) break;
    index = i;
  }
  return index;
}

export function chapterCenter(index, chapters) {
  const count = Math.max(1, chapters.length);
  const start = Number(chapters[index]?.start ?? index / count);
  const end = Number(chapters[index]?.end ?? chapters[index + 1]?.start ?? (index + 1) / count);
  return clamp((start + end) / 2);
}

export function storyAt(value, frameCount = 1, chapters = 6) {
  const scroll = clamp(Number(value) || 0);
  const assembly = clamp((scroll - STORY.begin) / (STORY.assembled - STORY.begin));
  return {
    scroll, assembly,
    frame: Math.round(assembly * Math.max(0, frameCount - 1)),
    chapter: chapterAtProgress(assembly, chapters),
    phase: scroll < STORY.begin ? 'intro' : scroll < STORY.film ? 'assembly' : 'film',
  };
}

// Studio framing leaves room for the component notes, then settles into the
// film rectangle before completion. Both sources share the exact handoff pose.
export function mediaRect(width, height, sourceWidth = 16, sourceHeight = 9, assembly = 1) {
  const ratio = sourceWidth / sourceHeight;
  const scale = Math.min(width / sourceWidth, height / sourceHeight);
  const w = sourceWidth * scale, h = w / ratio;
  const centerY = width <= 760 ? height * .43 : height * .5;
  const settle = clamp((assembly - .9) / .1);
  const ease = settle * settle * (3 - 2 * settle);
  const studioScale = width > 760 ? .82 + .18 * ease : 1;
  return { x: (width - w) / 2, y: centerY - h * studioScale / 2, width: w * studioScale, height: h * studioScale };
}
