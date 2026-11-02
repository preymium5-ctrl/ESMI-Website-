import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const site=fileURLToPath(new URL('../',import.meta.url));
const html=readFileSync(path.join(site,'index.html'),'utf8');
const configMatch=html.match(/<script\b[^>]*id=["']experience-config["'][^>]*>([\s\S]*?)<\/script>/i);
const selector=configMatch?JSON.parse(configMatch[1]):{};
const manifestRelative=process.env.ESMI_MEDIA_VERSION==='v2'?'./assets/v2/assembly.json':selector.manifest||'./assets/assembly.json';
const manifestPath=path.resolve(site,manifestRelative);
const releasePath=manifestRelative.replaceAll('\\','/');
const version2=releasePath.includes('/v2/')||releasePath.includes('/v3/');
const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
const assemblyExpected=version2?{width:1920,height:1080}:{width:1280,height:720};
const film=manifest.film||{};
const expected={width:Number(film.width??manifest.width),height:Number(film.height??manifest.height),duration:Number(film.duration??30),fps:Number(film.fps??manifest.fps??24)};
expected.frames=Number(film.frames??Math.round(expected.duration*expected.fps));
const releaseDirectory=path.dirname(manifestPath);
const movie=film.src?path.resolve(site,film.src):path.join(releaseDirectory,'esmi-film.mp4');
const handoff=manifest.handoff?path.resolve(site,manifest.handoff):path.join(releaseDirectory,'handoff.png');
const poster=film.poster?path.resolve(site,film.poster):handoff;
// Existing releases use a JPEG display proxy beside the lossless opening PNG.
const losslessPoster=/\.jpe?g$/i.test(poster)?poster.replace(/\.jpe?g$/i,'.png'):poster;
const withAudio=Boolean(film.hasAudio);
function run(command,args){
  const result=spawnSync(command,args,{maxBuffer:16*1024*1024});
  assert.ifError(result.error);assert.equal(result.status,0,result.stderr?.toString());return result.stdout;
}
function metadata(file){return JSON.parse(run('ffprobe',['-v','error','-show_entries','format=duration','-show_entries','stream=codec_type,width,height,nb_frames,r_frame_rate','-of','json',file]));}
function pixels(file){return run('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-frames:v','1','-an','-pix_fmt','rgb24','-f','rawvideo','pipe:1']);}

test(`the selected cinematic is exactly ${expected.duration}s at ${expected.height}p with the declared audio`,()=>{
  for(const key of ['width','height','frames'])assert.ok(Number.isSafeInteger(expected[key])&&expected[key]>0,`Invalid cinematic ${key}`);
  for(const key of ['duration','fps'])assert.ok(Number.isFinite(expected[key])&&expected[key]>0,`Invalid cinematic ${key}`);
  assert.equal(expected.frames,expected.duration*expected.fps,'The declared cinematic duration, frame rate and frame count must agree.');
  const data=metadata(movie),video=data.streams.find(stream=>stream.codec_type==='video');
  assert.equal(Number(data.format.duration),expected.duration);
  assert.equal(video.width,expected.width);assert.equal(video.height,expected.height);
  const [numerator,denominator]=video.r_frame_rate.split('/').map(Number);
  assert.equal(numerator/denominator,expected.fps);assert.equal(Number(video.nb_frames),expected.frames);
  assert.equal(data.streams.some(stream=>stream.codec_type==='audio'),withAudio);
});

test('the cinematic poster matches its final encoded opening frame',()=>{
  assert.ok(existsSync(poster),`Missing cinematic poster: ${poster}`);
  assert.ok(existsSync(losslessPoster),`Missing lossless cinematic poster: ${losslessPoster}`);
  const opening=pixels(movie),lossless=pixels(losslessPoster);
  assert.equal(opening.length,expected.width*expected.height*3);
  assert.ok(lossless.equals(opening),'The cinematic poster PNG must come from the final encoded advertisement.');
  if(poster!==losslessPoster){
    const display=pixels(poster);
    assert.equal(display.length,opening.length);
    let difference=0;
    for(let i=0;i<opening.length;i++)difference+=Math.abs(display[i]-opening[i]);
    assert.ok(difference/opening.length<=3,'The JPEG display poster must match the lossless opening within compression tolerance.');
  }
});

test('every reversible assembly frame exists at the declared resolution and ends on its own handoff',()=>{
  assert.equal(manifest.width,assemblyExpected.width);assert.equal(manifest.height,assemblyExpected.height);
  assert.equal(manifest.fps,24);assert.ok(['Google Flow','Blender'].includes(manifest.source));
  assert.ok(manifest.frames.length>=48);
  assert.equal(path.resolve(site,manifest.frames.at(-1)),handoff);
  for(const frame of manifest.frames){
    const resolved=path.resolve(site,frame);
    assert.ok(resolved.startsWith(path.join(site,'assets')+path.sep));
    assert.ok(existsSync(resolved),`Missing frame: ${frame}`);
  }
  for(const index of new Set([0,Math.floor(manifest.frames.length/2),manifest.frames.length-1])){
    const video=metadata(path.resolve(site,manifest.frames[index])).streams.find(stream=>stream.codec_type==='video');
    assert.equal(video.width,assemblyExpected.width);assert.equal(video.height,assemblyExpected.height);
  }
  if(version2){assert.equal(manifest.internalLayout,true);assert.equal(manifest.illustrativeInternals,true);}
});
