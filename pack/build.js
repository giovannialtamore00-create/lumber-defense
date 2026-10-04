// Builds the asset pack for one hex geometry, or both plus a side-by-side preview.
//   node build.js flat      -> dist-flat/     (flat-top hexes, 2:1 view, straight-down rivers)
//   node build.js pointy    -> dist-pointy/   (pointy-top hexes, squash 0.62 like src/game/iso.ts, diagonal rivers)
//   node build.js compare   -> both, plus dist-compare/preview.html
var fs=require('fs'),path=require('path'),zlib=require('zlib');
var ISO=require('./src/engine.js'),D=require('./src/defs.js'),WaterLib=require('./src/water.js');

var GEO={
  flat:{name:'flat',pointy:false,sq:0.5,orientation:'flat-top',label:'Flat-top hexes, 2:1 view'},
  pointy:{name:'pointy',pointy:true,sq:0.62,orientation:'pointy-top',label:'Pointy-top hexes, squash 0.62 (matches iso.ts)'}
};
var PLAYERS=['#d9443a','#3a78d8','#3fae5a','#8e5ad0'],PLAYER_NAMES=['red','blue','green','purple'];

function crc(buf){var c,r=~0;for(var n=0;n<buf.length;n++){c=(r^buf[n])&255;for(var k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;r=(r>>>8)^c;}return ~r>>>0;}
function chunk(t,d){var l=Buffer.alloc(4);l.writeUInt32BE(d.length);var td=Buffer.concat([Buffer.from(t),d]);var c=Buffer.alloc(4);c.writeUInt32BE(crc(td));return Buffer.concat([l,td,c]);}
function pngRGBA(w,h,rgba){
  var raw=Buffer.alloc((w*4+1)*h);
  for(var y=0;y<h;y++){raw[y*(w*4+1)]=0;for(var x=0;x<w*4;x++)raw[y*(w*4+1)+1+x]=rgba[y*w*4+x];}
  var ih=Buffer.alloc(13);ih.writeUInt32BE(w,0);ih.writeUInt32BE(h,4);ih[8]=8;ih[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ih),chunk('IDAT',zlib.deflateSync(raw,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function toRGBA(px){var o=new Uint8Array(ISO.W*ISO.H*4);px.forEach(function(c,i){if(c){o[i*4]=c[0];o[i*4+1]=c[1];o[i*4+2]=c[2];o[i*4+3]=255;}});return o;}

function buildGeometry(g,outDir,writeSprites){
  ISO.configure({pointy:g.pointy,sq:g.sq});
  var AS=path.join(outDir,'assets'),SP=path.join(AS,'sprites');
  fs.mkdirSync(AS,{recursive:true});if(writeSprites)fs.mkdirSync(SP,{recursive:true});
  var list=[];
  function add(name,group,ops,opts){
    var px=ISO.render(ops,opts),x;
    // A sprite touching the cell's edge is clipped: make it smaller in defs.js.
    for(x=0;x<ISO.W;x++)if(px[x]||px[ISO.W+x])console.warn('CLIPPED at the top:',name);
    list.push({name:name,group:group,px:px});
  }
  // [state name, builder index, optional argument for the builder]
  // [state name, builder, optional argument]. Upgradable types have 3 stages (D.stages), the rest fixed looks.
  var flows=g.pointy?['SE','SW']:['S'];
  function stages(id){return [0,1,2].map(function(i){return ['s'+(i+1),D.stages[id][i]];});}
  var structures={
    outpost:stages('outpost'),mill:stages('mill'),dock:stages('dock'),workshop:stages('workshop'),
    bridge:flows.reduce(function(acc,f){return acc.concat([0,1,2].map(function(i){return ['s'+(i+1)+'.flow'+f,D.stages.bridge[i],f];}));},[]),
    dam:flows.reduce(function(acc,f){return acc.concat([[g.pointy?'flow'+f:'base',D.dam[0],f],[g.pointy?'damaged_flow'+f:'damaged',D.dam[1],f]]);},[]),
    excavator:[['base',D.excavator[0]],['digging',D.excavator[1]]]
  };
  var units={woodchopper:stages('woodchopper'),carrier:stages('carrier'),catapult:stages('catapult'),forestGuard:stages('forestGuard'),
    stoneCutter:[['base',D.stoneCutter]]};
  function withPlayers(group,table){
    Object.keys(table).forEach(function(id){table[id].forEach(function(st){
      PLAYERS.forEach(function(col,p){add(id+'.'+st[0]+'.p'+(p+1),group,st[1](st[2]),{accent:col});});});});
  }
  withPlayers('structures',structures);withPlayers('units',units);
  ['hex_land','hex_dug','hex_forest','hex_forest_depleted','hex_forest_baby','hex_rock'].forEach(function(n){add(n,'terrain',D[n]());});
  ['tree_pine','tree_round','tree_baby','tree_stump','rock_s','rock_m','rock_l','stone','logstack_1','logstack_2','logstack_3','debris','debris_burnt'].forEach(function(n){add(n,'nature',D[n]());});
  list.push({name:'hex_outline',group:'terrain',px:ISO.hexOutline()});

  var COLS=10,rows=Math.ceil(list.length/COLS),AW=COLS*ISO.W,AH=rows*ISO.H,atlas=new Uint8Array(AW*AH*4);
  var R=ISO.R,SQ3=Math.sqrt(3);
  var tile=g.pointy?{w:Math.round(SQ3*R*100)/100,h:2*R*g.sq,stepX:Math.round(SQ3*R*100)/100,stepY:1.5*R*g.sq}
                   :{w:2*R,h:Math.round(SQ3*R*g.sq*100)/100,stepX:1.5*R,stepY:Math.round(SQ3*R*g.sq*100)/100};
  var manifest={version:1,geometry:g.name,atlas:'atlas.png',
    tile:Object.assign({size:R,sq:g.sq,orientation:g.orientation,topOffsetPx:ISO.TH*ISO.S,anchor:{x:ISO.OX,y:ISO.OY},
      note:'Draw every sprite with its anchor on the hex centre.'},tile),
    players:PLAYERS.map(function(c,i){return {id:i+1,name:PLAYER_NAMES[i],color:c};}),
    water:{sheet:'water.png',frames:8,strengthSteps:6,flows:flows,frameW:ISO.W,frameH:ISO.H,
      note:'Per flow: 6 rows of river strength (light to dark). Last row is the waterfall.'},
    sprites:{}};
  list.forEach(function(s,i){
    var cx=(i%COLS)*ISO.W,cy=Math.floor(i/COLS)*ISO.H,rgba=toRGBA(s.px),y;
    for(y=0;y<ISO.H;y++)atlas.set(rgba.subarray(y*ISO.W*4,(y+1)*ISO.W*4),((cy+y)*AW+cx)*4);
    // Visible bounds (bx, bw: left edge and width of the drawn pixels), so the game can enlarge small sprites
    // without letting them outgrow their hex.
    var minX=ISO.W,maxX=-1,xx2,yy2;
    for(yy2=0;yy2<ISO.H;yy2++)for(xx2=0;xx2<ISO.W;xx2++)if(s.px[yy2*ISO.W+xx2]){if(xx2<minX)minX=xx2;if(xx2>maxX)maxX=xx2;}
    manifest.sprites[s.name]={x:cx,y:cy,w:ISO.W,h:ISO.H,ax:ISO.OX,ay:ISO.OY,group:s.group,bx:maxX<0?0:minX,bw:maxX<0?0:maxX-minX+1};
    if(writeSprites)fs.writeFileSync(path.join(SP,s.name+'.png'),pngRGBA(ISO.W,ISO.H,rgba));
  });
  var atlasPng=pngRGBA(AW,AH,atlas);
  fs.writeFileSync(path.join(AS,'atlas.png'),atlasPng);
  fs.writeFileSync(path.join(AS,'manifest.json'),JSON.stringify(manifest,null,1));
  // Phaser texture-atlas JSON (hash format). The pivot is the hex-centre anchor, so setOrigin comes for free.
  var ph={frames:{},meta:{app:'lumber-pack',version:'1',image:'atlas.png',format:'RGBA8888',size:{w:AW,h:AH},scale:'1'}};
  Object.keys(manifest.sprites).forEach(function(n){var s=manifest.sprites[n];
    ph.frames[n]={frame:{x:s.x,y:s.y,w:s.w,h:s.h},rotated:false,trimmed:false,spriteSourceSize:{x:0,y:0,w:s.w,h:s.h},sourceSize:{w:s.w,h:s.h},pivot:{x:s.ax/s.w,y:s.ay/s.h}};});
  fs.writeFileSync(path.join(AS,'atlas.phaser.json'),JSON.stringify(ph));
  // baked water sheet (same layout WaterLib.createSheet() makes in the browser)
  var Water=WaterLib.create({pointy:g.pointy,sq:g.sq,R:R,H:ISO.H,OY:ISO.OY}),WS=Water.strengthSteps,WF=Water.frames,rowsW=WS*flows.length+1;
  var wsheet=new Uint8Array(WF*ISO.W*rowsW*ISO.H*4),fi,wr,wf,yy;
  function put(fr,r,f){for(yy=0;yy<ISO.H;yy++)wsheet.set(fr.subarray(yy*ISO.W*4,(yy+1)*ISO.W*4),((r*ISO.H+yy)*WF*ISO.W+f*ISO.W)*4);}
  for(fi=0;fi<flows.length;fi++)for(wr=0;wr<WS;wr++)for(wf=0;wf<WF;wf++)put(Water.renderFrame(wf,wr/(WS-1),'river',flows[fi]),fi*WS+wr,wf);
  for(wf=0;wf<WF;wf++)put(Water.renderFrame(wf,0.4,'fall',flows[0]),WS*flows.length,wf);
  fs.writeFileSync(path.join(AS,'water.png'),pngRGBA(WF*ISO.W,rowsW*ISO.H,wsheet));
  fs.copyFileSync(path.join(__dirname,'src','water.js'),path.join(outDir,'water.js'));
  fs.copyFileSync(path.join(__dirname,'src','lumber-assets.js'),path.join(outDir,'lumber-assets.js'));
  console.log(g.name,'sprites',list.length,'atlas',AW+'x'+AH);
  return {manifest:manifest,atlasPng:atlasPng};
}

var mode=process.argv[2]||'compare';
if(mode==='flat'||mode==='pointy'){buildGeometry(GEO[mode],path.join(__dirname,'dist-'+mode),true);}
else{
  var res={};
  ['flat','pointy'].forEach(function(n){res[n]=buildGeometry(GEO[n],path.join(__dirname,'dist-'+n),true);});
  var out=path.join(__dirname,'dist-compare');fs.mkdirSync(out,{recursive:true});
  var tpl=fs.readFileSync(path.join(__dirname,'compare.tpl.html'),'utf8');
  var data={};['flat','pointy'].forEach(function(n){data[n]={manifest:res[n].manifest,atlas:'data:image/png;base64,'+res[n].atlasPng.toString('base64')};});
  var html=tpl.replace('/*WATER*/',function(){return fs.readFileSync(path.join(__dirname,'src','water.js'),'utf8');})
    .replace('/*LOADER*/',function(){return fs.readFileSync(path.join(__dirname,'src','lumber-assets.js'),'utf8');})
    .replace('/*DATA*/',function(){return JSON.stringify(data);});
  fs.writeFileSync(path.join(out,'compare.html'),html);
  console.log('compare.html',html.length);
}
