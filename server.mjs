import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve('.');
const port=Number(process.env.PORT||5174);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.jpeg':'image/jpeg','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.xml':'application/xml; charset=utf-8','.ico':'image/x-icon','.webmanifest':'application/manifest+json','.gltf':'model/gltf+json','.glb':'model/gltf-binary','.bin':'application/octet-stream','.hdr':'application/octet-stream','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac','.mp3':'audio/mpeg','.mp4':'video/mp4','.webm':'video/webm'};
const server=http.createServer((req,res)=>{
  if(req.method!=='GET'&&req.method!=='HEAD'){
    res.writeHead(405,{'Allow':'GET, HEAD'});res.end();return;
  }
  let pathname;
  try{
    pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(pathname.includes('\0'))throw new Error('Invalid path');
  }catch{res.writeHead(400);res.end();return;}
  const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404);res.end(req.method==='HEAD'?undefined:'Not found');return;}
    const headers={
      'Content-Type':types[path.extname(file).toLowerCase()]||'application/octet-stream',
      'Cache-Control':'no-cache',
      'Accept-Ranges':'bytes',
      'Content-Length':stat.size
    };
    let start=0,end=stat.size-1,status=200;
    // A media seek requests one inclusive byte interval. HEAD describes the
    // complete resource; unsupported multi-range requests receive the full file.
    if(req.method==='GET'&&req.headers.range&&!req.headers.range.includes(',')){
      const range=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
      if(range&&(range[1]||range[2])){
        if(range[1]){
          start=Number(range[1]);
          end=range[2]?Math.min(Number(range[2]),end):end;
        }else{
          start=Math.max(0,stat.size-Number(range[2]));
        }
        if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=stat.size){
          res.writeHead(416,{'Content-Range':`bytes */${stat.size}`,'Content-Length':0,'Accept-Ranges':'bytes'});res.end();return;
        }
        status=206;
        headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length']=end-start+1;
      }
    }
    res.writeHead(status,headers);
    if(req.method==='HEAD'||stat.size===0){res.end();return;}
    const stream=fs.createReadStream(file,{start,end});
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  });
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://localhost:${server.address().port}`));
