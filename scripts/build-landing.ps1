param(
  [string]$Source='assets/landing/hero-source-1080.mp4',
  [ValidatePattern('^(?:hero|dock)(?:-portrait)?$')][string]$Name='hero'
)
$ErrorActionPreference='Stop'
$site=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$directory=Join-Path $site 'assets/landing'
$inputPath=[IO.Path]::GetFullPath((Join-Path $site $Source))
if(!$inputPath.StartsWith($directory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Landing sources must be inside assets/landing.'}
function Inspect-Media([string]$File){
  $data=& ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels -of json $File
  if($LASTEXITCODE -ne 0){throw "Could not inspect $File"};return ($data|ConvertFrom-Json)
}
$sourceInfo=Inspect-Media $inputPath
$sourceVideo=$sourceInfo.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1
$hasAudio=[bool]($sourceInfo.streams|Where-Object codec_type -eq 'audio')
if(!(($sourceVideo.width -eq 1920 -and $sourceVideo.height -eq 1080) -or ($sourceVideo.width -eq 1080 -and $sourceVideo.height -eq 1920))){throw 'Expected an already Flow-enhanced 1080p landscape or portrait source.'}
if([Math]::Abs([double]$sourceInfo.format.duration-8) -gt .04){throw 'Expected the eight-second Flow ambient loop.'}
$temporary=Join-Path $directory "$Name.build.mp4"
$output=Join-Path $directory "$Name.mp4"
# Hold the original decoded opening frame in native YUV. The final eight frames
# gently return to that exact pose, avoiding a hard jump in the web loop.
$filter="[0:v]fps=24,setsar=1,split=2[base][head];[head]trim=end_frame=1,loop=loop=-1:size=1:start=0,setpts=N/(24*TB)[anchor];[base][anchor]blend=all_expr='A*(1-clip((T-7.625)/0.3333333333,0,1))+B*clip((T-7.625)/0.3333333333,0,1)':shortest=1[v]"
$arguments=@('-hide_banner','-loglevel','error','-y','-i',$inputPath,'-filter_complex_threads','2','-filter_complex',$filter,'-map','[v]')
if($hasAudio){$arguments+=@('-map','0:a:0','-af','afade=t=in:st=0:d=0.12,afade=t=out:st=7.88:d=0.12','-c:a','aac','-b:a','128k','-ar','48000')}else{$arguments+='-an'}
$arguments+=@('-c:v','libx264','-threads','4','-preset','medium','-crf','19','-pix_fmt','yuv420p','-r','24','-frames:v','192','-t','8','-movflags','+faststart',$temporary)
& ffmpeg @arguments
if($LASTEXITCODE -ne 0){throw 'Landing loop encoding failed.'}
$result=Inspect-Media $temporary
$video=$result.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1
if($video.width -ne $sourceVideo.width -or $video.height -ne $sourceVideo.height -or $video.nb_frames -ne '192' -or [double]$result.format.duration -ne 8){throw 'Landing output dimensions or duration changed unexpectedly.'}
Move-Item -LiteralPath $temporary -Destination $output -Force
& ffmpeg -hide_banner -loglevel error -y -i $output -frames:v 1 -c:v libwebp -quality 94 -compression_level 5 (Join-Path $directory "$Name.webp")
if($LASTEXITCODE -ne 0){throw 'Landing poster extraction failed.'}
$productionPath=Join-Path $directory 'production.json'
$production=if(Test-Path -LiteralPath $productionPath){Get-Content -LiteralPath $productionPath -Raw|ConvertFrom-Json -AsHashtable}else{@{}}
$production.source='Google Flow-enhanced 1080p'
$production.project='https://flow.google.com/project/baaf1cc5-dd14-41a1-899d-e23a1eb31a35'
$production.designReference='https://unseen.co/'
$production[$Name]=[ordered]@{sourceFile=$Source;file="./assets/landing/$Name.mp4";poster="./assets/landing/$Name.webp";width=$video.width;height=$video.height;duration=8;fps=24;frames=192;bytes=[long]$result.format.size;hasAudio=$hasAudio;audioKind=if($hasAudio){'native water ambience'}else{'silent'};audioGainDb=0;loopBlendFrames=8;audioEdgeFadeSeconds=0.12}
$production|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $productionPath -Encoding utf8NoBOM
Write-Output "$Name ready: $($video.width)x$($video.height),8s,192frames,$($result.format.size)bytes,audio=$hasAudio"
