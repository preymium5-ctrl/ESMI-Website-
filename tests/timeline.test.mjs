import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY, storyAt, chapterAtProgress, chapterCenter, mediaRect } from '../timeline.js';

test('the film boundary is reached only after the exact assembled frame',()=>{
  for (const p of [STORY.assembled, .92, STORY.film-.001, STORY.film]) {
    assert.equal(storyAt(p,192).frame,191);
    assert.equal(storyAt(p,192).assembly,1);
  }
  assert.equal(storyAt(STORY.film-.001,192).phase,'assembly');
  assert.equal(storyAt(STORY.film,192).phase,'film');
});
test('reverse scrolling returns through all frames without skipping the boundaries',()=>{
  const forward=Array.from({length:1001},(_,i)=>storyAt(i/1000,192).frame);
  assert.equal(forward[0],0);assert.equal(forward.at(-1),191);
  assert.ok(forward.every((v,i)=>i===0||v>=forward[i-1]));
  assert.deepEqual([...forward].reverse(),Array.from({length:1001},(_,i)=>storyAt(1-i/1000,192).frame));
});
test('portrait and desktop handoffs preserve a 16:9 frame inside the viewport',()=>{
  for (const [w,h] of [[1440,900],[1920,1080],[390,844],[360,640]]) {
    const assembly=mediaRect(w,h,1280,720);
    const film=mediaRect(w,h,1280,720);
    assert.deepEqual(assembly,film);
    assert.ok(Math.abs(assembly.width/assembly.height-16/9)<1e-9);
    assert.ok(assembly.x>=0 && assembly.y>=0);
    assert.ok(assembly.x+assembly.width<=w+.001 && assembly.y+assembly.height<=h+.001);
  }
});

test('internal components follow their actual, uneven frame ranges in both scroll directions',()=>{
  const chapters=[
    {start:0,end:.08}, {start:.08,end:.23}, {start:.23,end:.35},
    {start:.35,end:.48}, {start:.48,end:.59}, {start:.59,end:.7},
    {start:.7,end:.82}, {start:.82,end:.9}, {start:.9,end:1},
  ];
  for (let index=0;index<chapters.length;index++) {
    const center=chapterCenter(index,chapters);
    assert.equal(chapterAtProgress(center,chapters),index);
    const scroll=STORY.begin+center*(STORY.assembled-STORY.begin);
    assert.equal(storyAt(scroll,240,chapters).chapter,index);
  }
  assert.equal(chapterAtProgress(.2299,chapters),1);
  assert.equal(chapterAtProgress(.23,chapters),2);
  assert.equal(chapterAtProgress(.3499,chapters),2);
  assert.equal(chapterAtProgress(.35,chapters),3);
  const forward=Array.from({length:1001},(_,i)=>chapterAtProgress(i/1000,chapters));
  assert.deepEqual([...forward].reverse(),Array.from({length:1001},(_,i)=>chapterAtProgress(1-i/1000,chapters)));
});

test('1080p stills and film keep exactly the same placement as their 16:9 stage',()=>{
  for (const [width,height] of [[1920,1080],[1440,900],[390,844]]) {
    assert.deepEqual(mediaRect(width,height,1920,1080),mediaRect(width,height,1280,720));
  }
});

test('studio reframing settles continuously into the film before the handoff',()=>{
  for (const [w,h] of [[1254,892],[1920,1080],[390,844]]) {
    const film=mediaRect(w,h,1920,1080);
    assert.deepEqual(mediaRect(w,h,1920,1080,1),film);
    const approaching=mediaRect(w,h,1920,1080,.9999);
    assert.ok(Math.abs(approaching.width-film.width)<.01);
    assert.ok(Math.abs(approaching.y-film.y)<.01);
    const studio=mediaRect(w,h,1920,1080,0);
    assert.ok(studio.width<=film.width);
    assert.ok(studio.x+studio.width<=w+.001);
  }
});
