import {createServer} from 'node:http';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve('.'),output=resolve('outputs/stocker-clip-20261116');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.mp3':'audio/mpeg','.mp4':'video/mp4','.webm':'video/webm','.woff2':'font/woff2'};
createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1:4176');
    if(req.method==='POST'&&['/film-save/capture.webm','/film-save/capture.h264','/film-save/capture.json','/film-save/still.png'].includes(url.pathname)){
      const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>180000000)throw Error('too large');chunks.push(c);}
      await writeFile(resolve(output,url.pathname.split('/').at(-1)),Buffer.concat(chunks));res.writeHead(200);res.end('saved');return;
    }
    if(req.method!=='GET'){res.writeHead(405);res.end();return;}
    const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/outputs/stocker-clip-20261116/index.html':url.pathname));
    if(!path.startsWith(root+sep)||path.split(sep).some(p=>p.startsWith('.'))||path.endsWith('.env')){res.writeHead(403);res.end();return;}
    const info=await stat(path);if(!info.isFile())throw Error('not file');
    const body=await readFile(path);res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-store','Content-Length':body.length});res.end(body);
  }catch{res.writeHead(404);res.end('not found');}
}).listen(4176,'127.0.0.1',()=>console.log('STOCKER_FILM http://127.0.0.1:4176'));
