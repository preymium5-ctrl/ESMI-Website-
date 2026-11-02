param(
    [string]$Source='assets/source/v2/internal-disassembly-1080.mp4',
    [string[]]$Sources=@(),
    [ValidateRange(0,120)][double]$Duration=0,
    [double[]]$Starts=@(),
    [double[]]$Durations=@(),
    [string]$ChapterFile='',
    [ValidateRange(0,24)][int]$EndpointBlendFrames=8,
    [ValidateRange(0,24)][int]$JoinBlendFrames=0
)
$ErrorActionPreference='Stop'
$siteDirectory=[IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$assetDirectory=Join-Path $siteDirectory 'assets/v2';$framesDirectory=Join-Path $assetDirectory 'frames';$handoff=Join-Path $assetDirectory 'handoff.png'
$ffmpeg=(Get-Command ffmpeg -ErrorAction Stop).Source;$ffprobe=(Get-Command ffprobe -ErrorAction Stop).Source;$culture=[Globalization.CultureInfo]::InvariantCulture
function Get-EndpointComparison([string]$Frame){
    $comparisonOutput=& $ffmpeg -hide_banner -i $Frame -i $handoff -filter_complex 'ssim' -an -f null - 2>&1
    if($LASTEXITCODE -ne 0){throw 'Endpoint comparison failed.'}
    $line=[string]($comparisonOutput|Select-String 'SSIM.*All:'|Select-Object -Last 1)
    $match=[regex]::Match($line,'All:([0-9.]+)')
    $similarity=if($match.Success){[double]::Parse($match.Groups[1].Value,$culture)}else{$null}
    return [pscustomobject]@{line=$line;ssim=$similarity}
}
if(!$Sources.Count){$Sources=@($Source)}
if($Starts.Count -and $Starts.Count -ne $Sources.Count){throw '-Starts needs one value per source.'}
if($Durations.Count -and $Durations.Count -ne $Sources.Count){throw '-Durations needs one value per source.'}
if(!(Test-Path -LiteralPath $handoff -PathType Leaf)){throw 'Build the final 1080p film before its matching assembly endpoint.'}
$inputs=@();$filters=@();$reportSources=@()
for($i=0;$i -lt $Sources.Count;$i++){
    $file=if([IO.Path]::IsPathRooted($Sources[$i])){[IO.Path]::GetFullPath($Sources[$i])}else{[IO.Path]::GetFullPath((Join-Path $siteDirectory $Sources[$i]))}
    if(!$file.StartsWith($siteDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Assembly sources must remain inside this standalone site.'}
    if(!(Test-Path -LiteralPath $file -PathType Leaf)){throw "Missing Flow 1080p assembly source: $file"}
    $json=& $ffprobe -v error -show_entries format=duration -show_entries stream=codec_type,width,height,r_frame_rate -of json $file
    if($LASTEXITCODE -ne 0){throw "Could not inspect $file"};$metadata=$json|ConvertFrom-Json;$video=$metadata.streams|Where-Object codec_type -eq 'video'|Select-Object -First 1
    if(!$video -or $video.width -ne 1920 -or $video.height -ne 1080){throw 'Assembly sources must already be 1920x1080 from Flow; this script does not resize them.'}
    $start=if($Starts.Count){$Starts[$i]}else{0}
    $used=if($Durations.Count){$Durations[$i]}elseif($Duration -gt 0){$Duration}else{[double]$metadata.format.duration-$start}
    if($start -lt 0 -or $used -lt .1 -or $start+$used -gt [double]$metadata.format.duration+.04){throw 'An assembly interval lies outside its source clip.'}
    $startText=$start.ToString($culture);$durationText=$used.ToString($culture);$inputs+=@('-i',$file)
    $filters+="[$($i):v]trim=start=$($startText):duration=$durationText,setpts=PTS-STARTPTS,fps=24,settb=AVTB,setsar=1[v$i]"
    $reportSources+=[ordered]@{file=$Sources[$i];sourceDuration=[double]$metadata.format.duration;start=$start;duration=$used}
}
$joinSeconds=$JoinBlendFrames/24.0
if($Sources.Count -gt 1 -and $JoinBlendFrames -gt 0){
    $previous='v0';$runningDuration=[double]$reportSources[0].duration
    for($i=1;$i -lt $Sources.Count;$i++){
        if($runningDuration -le $joinSeconds -or [double]$reportSources[$i].duration -le $joinSeconds){throw 'A source segment is too short for the requested join blend.'}
        $offset=($runningDuration-$joinSeconds).ToString('0.########',$culture)
        $joinText=$joinSeconds.ToString('0.########',$culture);$next="join$i"
        $filters+="[$previous][v$i]xfade=transition=fade:duration=$($joinText):offset=$offset[$next]"
        $runningDuration+=[double]$reportSources[$i].duration-$joinSeconds;$previous=$next
    }
    # Only the matching static pose at each pass boundary is blended. Returning
    # to source chroma format also bounds the reverse filter's memory footprint.
    $filters+="[$previous]format=yuv420p,reverse[vout]"
}elseif($Sources.Count -gt 1){
    $labels=(0..($Sources.Count-1)|ForEach-Object{"[v$_]"}) -join ''
    $filters+="$($labels)concat=n=$($Sources.Count):v=1:a=0,format=yuv420p,reverse[vout]"
}else{$filters+='[v0]reverse[vout]'}
New-Item -ItemType Directory -Path $framesDirectory -Force|Out-Null
$resolvedFrames=[IO.Path]::GetFullPath($framesDirectory);$expectedFrames=[IO.Path]::GetFullPath((Join-Path $siteDirectory 'assets/v2/frames'))
if($resolvedFrames -ne $expectedFrames -or !$resolvedFrames.StartsWith($siteDirectory+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Unexpected frame output directory.'}
# Replace only generated frames in this exact, verified new release directory.
Get-ChildItem -LiteralPath $resolvedFrames -Filter 'frame-*.webp' -File|ForEach-Object{Remove-Item -LiteralPath $_.FullName}
$arguments=@('-hide_banner','-loglevel','error','-y')+$inputs+@('-an','-filter_complex',($filters -join ';'),'-map','[vout]','-start_number','0','-c:v','libwebp','-quality','88','-compression_level','4',(Join-Path $framesDirectory 'frame-%04d.webp'))
& $ffmpeg @arguments;if($LASTEXITCODE -ne 0){throw '1080p assembly extraction failed.'}
$frames=@(Get-ChildItem -LiteralPath $framesDirectory -Filter 'frame-*.webp' -File|Sort-Object Name)
if($frames.Count -lt 2){throw 'The assembly source produced too few frames.'}
$rawEndpoint=Get-EndpointComparison $frames[-1].FullName
$blendCount=[Math]::Min($EndpointBlendFrames,$frames.Count)
# The source begins with an assembled static hold. After reversal only its
# final 8 frames (one third of a second) dissolve into the exact film opening.
# Keep this count inside that hold so moving internal assemblies never ghost.
for($blendIndex=0;$blendIndex -lt $blendCount;$blendIndex++){
    $frame=$frames[$frames.Count-$blendCount+$blendIndex]
    $amount=($blendIndex+1)/[double]$blendCount
    $weight=($amount*$amount*(3-2*$amount)).ToString('0.########',$culture)
    $temporaryFrame=Join-Path $framesDirectory ($frame.BaseName+'.build.webp')
    $blend="[0:v][1:v]blend=all_expr='A*(1-$weight)+B*$weight'[vout]"
    & $ffmpeg -hide_banner -loglevel error -y -i $frame.FullName -i $handoff -filter_complex $blend -map '[vout]' -frames:v 1 -c:v libwebp -quality 88 -compression_level 4 $temporaryFrame
    if($LASTEXITCODE -ne 0){throw 'The static endpoint blend failed.'}
    Move-Item -LiteralPath $temporaryFrame -Destination $frame.FullName -Force
}
$frames=@(Get-ChildItem -LiteralPath $framesDirectory -Filter 'frame-*.webp' -File|Sort-Object Name)
$blendedEndpoint=Get-EndpointComparison $frames[-1].FullName
$paths=@($frames|ForEach-Object{'./assets/v2/frames/'+$_.Name})+@('./assets/v2/handoff.png')
$manifest=[ordered]@{width=1920;height=1080;fps=24;source='Google Flow';enhancement='Google Flow-enhanced 1080p';internalLayout=$true;handoff='./assets/v2/handoff.png';illustrativeInternals=$true;frames=$paths}
$filmFile=Join-Path $assetDirectory 'film.json';if(Test-Path -LiteralPath $filmFile){$manifest.film=Get-Content -LiteralPath $filmFile -Raw|ConvertFrom-Json}
if($ChapterFile){$chapterPath=if([IO.Path]::IsPathRooted($ChapterFile)){$ChapterFile}else{Join-Path $siteDirectory $ChapterFile};$manifest.chapters=@(Get-Content -LiteralPath $chapterPath -Raw|ConvertFrom-Json)}
$manifestPath=Join-Path $assetDirectory 'assembly.json';$temporaryManifest=Join-Path $assetDirectory 'assembly.build.json'
$manifest|ConvertTo-Json -Depth 10|Set-Content -LiteralPath $temporaryManifest -Encoding utf8NoBOM
Move-Item -LiteralPath $temporaryManifest -Destination $manifestPath -Force
[ordered]@{source='Google Flow';sources=$reportSources;extractedFrames=$frames.Count;manifestFrames=$paths.Count;dimensions=@(1920,1080);fps=24;joinBlendFrames=$JoinBlendFrames;joinBlendSeconds=$joinSeconds;endFrame='./assets/v2/handoff.png';rawEndpointSSIM=$rawEndpoint.ssim;rawEndpointComparison=$rawEndpoint.line;endpointBlendFrames=$blendCount;endpointBlendSeconds=$blendCount/24.0;blendedEndpointSSIM=$blendedEndpoint.ssim;endFrameComparison=$blendedEndpoint.line;totalFrameBytes=($frames|Measure-Object Length -Sum).Sum;illustrativeInternals=$true}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath (Join-Path $assetDirectory 'assembly-metadata.json') -Encoding utf8NoBOM
Write-Output "Built $manifestPath"
Write-Output "1920x1080; $($frames.Count) extracted frames plus exact film endpoint; illustrative internals"
