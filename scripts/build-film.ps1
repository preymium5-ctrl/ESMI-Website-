param(
    [string[]]$Clips = @('studio-sea-1080.mp4','coast-1080.mp4','passengers-1080.mp4','solar-1080.mp4','solar-dock-1080.mp4','dock-1080.mp4','closing-1080.mp4'),
    [string]$SourceDirectory = 'assets/source/v2',
    [string]$MusicFile = '',
    [switch]$SourceAudio,
    [switch]$NoEndCard
)
$ErrorActionPreference='Stop'
$siteDirectory=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$assetDirectory=Join-Path $siteDirectory 'assets/v2'
$sourceDirectoryPath=[IO.Path]::GetFullPath((Join-Path $siteDirectory $SourceDirectory))
$ffmpeg=(Get-Command ffmpeg -ErrorAction Stop).Source
$ffprobe=(Get-Command ffprobe -ErrorAction Stop).Source
function Get-Media([string]$File){
    $json=& $ffprobe -v error -show_entries format=duration,size -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,nb_frames,sample_rate,channels,channel_layout,duration -of json $File
    if($LASTEXITCODE -ne 0){throw "Could not inspect $File"}; return ($json|ConvertFrom-Json)
}
function Escape-FilterPath([string]$File){return $File.Replace('\','/').Replace(':','\:').Replace("'","\'")}
if($Clips.Count -ne 7){throw 'The 50-second edit requires seven eight-second clips.'}
if($SourceAudio -and $MusicFile){throw 'Choose either -SourceAudio or -MusicFile, not both.'}
if(!$sourceDirectoryPath.StartsWith($siteDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Sources must remain inside this standalone site.'}
$inputs=@();$sources=@()
foreach($clip in $Clips){
    $file=[IO.Path]::GetFullPath((Join-Path $sourceDirectoryPath $clip))
    if(!$file.StartsWith($sourceDirectoryPath+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected source path.'}
    if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing Flow 1080p source: $file"}
    $info=Get-Media $file;$video=$info.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1
    $sourceAudioTrack=$info.streams|Where-Object codec_type -eq 'audio'|Select-Object -First 1
    if(!$video -or $video.width -ne 1920 -or $video.height -ne 1080){throw "$clip must already be 1920x1080 from Flow. This build will not stretch a 720p source."}
    if([double]$info.format.duration -lt 7.95){throw "$clip is shorter than eight seconds."}
    if($SourceAudio -and !$sourceAudioTrack){throw "$clip has no native audio. Inspect all clips before choosing -SourceAudio."}
    $audioMean=$null;$audioGain=0
    if($SourceAudio){
        $audit=& $ffmpeg -hide_banner -i $file -vn -af volumedetect -f null - 2>&1
        if($LASTEXITCODE -ne 0){throw "Could not inspect the native audio in $clip"}
        $match=[regex]::Match(($audit -join "`n"),'mean_volume:\s*(-?[0-9.]+) dB')
        if(!$match.Success){throw "$clip has no measurable source ambience."}
        $audioMean=[double]::Parse($match.Groups[1].Value,[Globalization.CultureInfo]::InvariantCulture)
        # Static scene gains remove abrupt differences between independently
        # generated ambience. Quiet scenes retain headroom; boosts are capped.
        $audioGain=if($audioMean -lt -60){0}else{[Math]::Clamp(-28-$audioMean,-18,12)}
    }
    $inputs+=@('-threads','2','-i',$file);$sources+=[ordered]@{file=$clip;width=$video.width;height=$video.height;duration=[double]$info.format.duration;hasAudio=[bool]$sourceAudioTrack;audioMeanDb=$audioMean;audioGainDb=$audioGain}
}
if($MusicFile){
    $musicPath=if([IO.Path]::IsPathRooted($MusicFile)){[IO.Path]::GetFullPath($MusicFile)}else{[IO.Path]::GetFullPath((Join-Path $siteDirectory $MusicFile))}
    if(!$musicPath.StartsWith($siteDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or !(Test-Path -LiteralPath $musicPath -PathType Leaf)){throw 'Music must be a supplied/generated file inside this site.'}
    $inputs+=@('-stream_loop','-1','-i',$musicPath)
}
New-Item -ItemType Directory -Path $assetDirectory -Force|Out-Null
$filters=@()
for($i=0;$i -lt 7;$i++){$filters+="[$($i):v]fps=24,trim=end_frame=192,settb=AVTB,setpts=PTS-STARTPTS,setsar=1[v$i]"}
$previous='v0'
for($i=1;$i -lt 7;$i++){$offset=$i*7;$next="mix$i";$filters+="[$previous][v$i]xfade=transition=fade:duration=1:offset=$offset[$next]";$previous=$next}
if(!$NoEndCard){
    $serif=Escape-FilterPath (Join-Path $env:WINDIR 'Fonts/georgia.ttf');$bold=Escape-FilterPath (Join-Path $env:WINDIR 'Fonts/arialbd.ttf')
    $alpha='if(lt(t,47),0,if(lt(t,47.6),(t-47)/0.6,1))'
    $filters+="[$previous]drawtext=fontfile='$bold':text='ESMI':fontsize=74:fontcolor=0xf7f0d9:x=(w-tw)/2:y=h*0.67:shadowcolor=black@0.4:shadowy=2:alpha='$alpha',drawtext=fontfile='$serif':text='From the sun. To the sea.':fontsize=42:fontcolor=0xf7f0d9:x=(w-tw)/2:y=h*0.76:shadowcolor=black@0.4:shadowy=2:alpha='$alpha',drawtext=fontfile='$bold':text='SOLAR. ELECTRIC. MARINE.':fontsize=18:fontcolor=0xf7f0d9:x=(w-tw)/2:y=h*0.83:shadowcolor=black@0.4:shadowy=1:alpha='$alpha'[vout]"
}else{$filters+="[$previous]null[vout]"}
$audioArguments=@('-an')
if($MusicFile){$filters+='[7:a]atrim=duration=50,asetpts=PTS-STARTPTS,loudnorm=I=-18:TP=-1.5:LRA=8,afade=t=in:st=0:d=0.8,afade=t=out:st=47.5:d=2.5[aout]';$audioArguments=@('-map','[aout]','-c:a','aac','-b:a','192k','-ar','48000')}
if($SourceAudio){
    for($i=0;$i -lt 7;$i++){$gain=$sources[$i].audioGainDb.ToString('0.##',[Globalization.CultureInfo]::InvariantCulture);$filters+="[$($i):a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=$($gain)dB,apad,atrim=duration=8,asetpts=PTS-STARTPTS[a$i]"}
    $previousAudio='a0'
    for($i=1;$i -lt 7;$i++){$nextAudio="amix$i";$filters+="[$previousAudio][a$i]acrossfade=d=1:c1=hsin:c2=hsin[$nextAudio]";$previousAudio=$nextAudio}
    # Keep native Flow ambience restrained; no generated music or narration is added.
    $filters+="[$previousAudio]atrim=duration=50,asetpts=PTS-STARTPTS,loudnorm=I=-22:TP=-2:LRA=11,afade=t=in:st=0:d=0.6,afade=t=out:st=47.5:d=2.5[aout]"
    $audioArguments=@('-map','[aout]','-c:a','aac','-b:a','192k','-ar','48000','-ac','2')
}
$hasAudio=[bool]($MusicFile -or $SourceAudio)
$audioKind=if($SourceAudio){'source ambience'}elseif($MusicFile){'music'}else{'silent'}
$temporaryOutput=Join-Path $assetDirectory 'esmi-film.build.mp4';$output=Join-Path $assetDirectory 'esmi-film.mp4'
$arguments=@('-hide_banner','-loglevel','error','-y')+$inputs+@('-filter_complex_threads','2','-filter_complex',($filters -join ';'),'-map','[vout]')+$audioArguments+@('-c:v','libx264','-threads','4','-preset','medium','-crf','18','-pix_fmt','yuv420p','-r','24','-frames:v','1200','-t','50','-movflags','+faststart',$temporaryOutput)
& $ffmpeg @arguments;if($LASTEXITCODE -ne 0){throw 'The 1080p advertisement encode failed.'}
$metadata=Get-Media $temporaryOutput;$video=$metadata.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1
if([double]$metadata.format.duration -ne 50 -or $video.width -ne 1920 -or $video.height -ne 1080 -or [int]$video.nb_frames -ne 1200){throw 'Expected exactly 1080p / 50 seconds / 1200 frames.'}
Move-Item -LiteralPath $temporaryOutput -Destination $output -Force
# Extract from the FINAL compressed film, keeping the handoff's decoded pixels identical.
foreach($format in @('png','jpg')){
    $frameOutput=Join-Path $assetDirectory "handoff.build.$format";$frameArguments=@('-hide_banner','-loglevel','error','-y','-i',$output,'-frames:v','1')
    if($format -eq 'jpg'){$frameArguments+=@('-q:v','1')}
    & $ffmpeg @frameArguments $frameOutput;if($LASTEXITCODE -ne 0){throw 'Opening-frame extraction failed.'}
    Move-Item -LiteralPath $frameOutput -Destination (Join-Path $assetDirectory "handoff.$format") -Force
}
$cues=@(
    @{start=0;eyebrow='FROM THE STUDIO TO THE SEA';titleHTML='A new horizon.<br><em>The same ESMI.</em>';copy='The engineering comes together. The journey begins.'},
    @{start=7;eyebrow='A DIFFERENT WAY TO MOVE';titleHTML='Find your<br><em>open horizon.</em>';copy='Take the scenic route.'},
    @{start=14;eyebrow='THE ELECTRIC JOURNEY';titleHTML='Good company.<br><em>Open horizons.</em>';copy='A little closer to the water. A little further from the everyday.'},
    @{start=21;eyebrow='THE SOLAR CANOPY';titleHTML='Bring the sun<br><em>aboard.</em>';copy='Solar collection, above every journey.'},
    @{start=28;eyebrow='POWERED BY POSSIBILITY';titleHTML='Let the daylight<br><em>do its work.</em>';copy='A moment in the sun, before the next journey.'},
    @{start=35;eyebrow='AT THE DOCK';titleHTML='Quiet moments.<br><em>More possibilities.</em>';copy='The journey continues between journeys.'},
    @{start=42;eyebrow='ESMI / SOLAR ELECTRIC';titleHTML='From the sun.<br><em>To the sea.</em>';copy='A different way to move.'}
)
[ordered]@{src='./assets/v2/esmi-film.mp4';poster='./assets/v2/handoff.jpg';duration=50;width=1920;height=1080;hasAudio=$hasAudio;audioKind=$audioKind;oceanAt=2.55;endcardAt=$(if($NoEndCard){$null}else{47});cues=$cues}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $assetDirectory 'film.json') -Encoding utf8NoBOM
$metadata|ConvertTo-Json -Depth 5|Set-Content -LiteralPath (Join-Path $assetDirectory 'film-metadata.json') -Encoding utf8NoBOM
[ordered]@{source='Google Flow-enhanced 1080p';sources=$sources;duration=50;dimensions=@(1920,1080);fps=24;endCard=!$NoEndCard;music=[bool]$MusicFile;audioKind=$audioKind}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $assetDirectory 'film-build.json') -Encoding utf8NoBOM
Write-Output "Built $output"
Write-Output "1920x1080; 50 seconds; 1200 frames; $($metadata.format.size) bytes; audio=$audioKind"
