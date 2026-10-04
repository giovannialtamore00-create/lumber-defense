/*
 * Lumber Defense running water.
 * Draws river hexes and waterfall hexes in the same isometric pixel style as the sprite pack.
 * Frames loop seamlessly (8 frames). Water flows north to south.
 *
 *   var Water = LumberWater.create({pointy:true, sq:0.62});   // or LumberWater (flat-top, 2:1)
 *   var sheet = Water.createSheet();                          // bake once (browser)
 *   Water.draw(ctx, sheet, x, y, timeSeconds, strength, {flow:'SE'});  // x,y = hex centre
 *   Water.draw(ctx, sheet, x, y, timeSeconds, 0, {waterfall:true});
 *
 * strength 0 is a weak light blue river, 1 is a strong dark blue one.
 * flow: 'S' (flat-top, straight down), or 'SE' / 'SW' (pointy-top, down-right / down-left).
 */
(function(root){
  var W=140,H=112,OX=70,OY=76,S=5,FRAMES=8,STEPS=6,RIVER_H=0.6,FALL_H=2.4;
  var OUT=[43,29,20];
  var LIGHT=[143,212,245],DARK=[42,105,181],DIRT=[138,106,74];
  var ANGLE={S:90,SE:60,SW:120};

  function mix(a,b,t){return [a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,a[2]+(b[2]-a[2])*t];}
  function toward(c,white,amt){var tgt=white?255:15;return [c[0]+(tgt-c[0])*amt,c[1]+(tgt-c[1])*amt,c[2]+(tgt-c[2])*amt];}
  function hash(n){var x=Math.sin(n*127.1)*43758.5453;return x-Math.floor(x);}

  function create(cfg){
    cfg=cfg||{};
    if(cfg.H){H=cfg.H;OY=cfg.OY;} // taller cells (room for big stage-3 sprites)
    var pointy=!!cfg.pointy,SQ=cfg.sq||0.5,R=cfg.R||64,off=pointy?-Math.PI/6:0;
    var flows=pointy?['SE','SW']:['S'];
    var verts=[],i;
    for(i=0;i<6;i++){var t=Math.PI/3*i+off;verts.push([R*Math.cos(t),SQ*R*Math.sin(t)]);}
    function inHex(u,v){ // convex polygon test, hex centred on (0,0)
      var sgn=0,k;
      for(k=0;k<6;k++){var a=verts[k],b=verts[(k+1)%6],c=(b[0]-a[0])*(v-a[1])-(b[1]-a[1])*(u-a[0]);
        if(c!==0){if(!sgn)sgn=c>0?1:-1;else if((c>0?1:-1)!==sgn)return false;}}
      return true;
    }
    function surface(u,v,phase,s,flow){
      var base=mix(LIGHT,DARK,s),a=ANGLE[flow]*Math.PI/180,vv=v/SQ;
      var f=u*Math.cos(a)+vv*Math.sin(a),l=-u*Math.sin(a)+vv*Math.cos(a),TAU=Math.PI*2;
      var val=0.6*Math.sin(TAU*(f/46-phase)+0.09*l)+0.4*Math.sin(TAU*(f/27-phase*2)-0.07*l+1.3);
      var crestAt=0.80-0.12*s;
      if(val>crestAt)return toward(base,true,0.42);
      if(val<-0.58)return toward(base,false,0.14);
      return base;
    }
    function curtain(u,h,phase){
      var col=Math.floor((u+200)/3),off2=hash(col),spd=1+Math.floor(hash(col+9)*2);
      var p=(h/14+phase*spd+off2)%1,base=mix(LIGHT,DARK,0.35);
      if(h<=3)return [236,247,252];
      return p<0.3?toward(base,true,0.7):(p<0.45?toward(base,true,0.3):base);
    }
    // One frame as an RGBA array (W*H*4). mode 'river' or 'fall'.
    function renderFrame(frame,strength,mode,flow){
      flow=flow||flows[0];
      var phase=(frame%FRAMES)/FRAMES,fall=mode==='fall',topZ=fall?FALL_H:RIVER_H,topY=OY-topZ*S,sideH=Math.round(topZ*S);
      var px=new Array(W*H),x,y,k;
      for(y=0;y<H;y++)for(x=0;x<W;x++){
        var u=x+.5-OX,vTop=y+.5-topY,c=null;
        if(inHex(u,vTop))c=surface(u,vTop,phase,strength,flow);
        else for(k=1;k<=sideH;k++){
          if(inHex(u,y+.5-k-topY)){
            if(fall)c=curtain(u,sideH-k,phase);
            else c=toward(DIRT,false,u<-R*0.25?0:(u>R*0.25?0.3:0.15));
            break;
          }
        }
        px[y*W+x]=c;
      }
      var out=typeof Uint8ClampedArray!=='undefined'?new Uint8ClampedArray(W*H*4):new Array(W*H*4),nb=[[1,0],[-1,0],[0,1],[0,-1]],j;
      for(y=0;y<H;y++)for(x=0;x<W;x++){
        var cc=px[y*W+x],o=(y*W+x)*4;
        if(!cc)for(j=0;j<4;j++){var xx=x+nb[j][0],yy=y+nb[j][1];if(xx>=0&&yy>=0&&xx<W&&yy<H&&px[yy*W+xx]){cc=OUT;break;}}
        if(cc){out[o]=Math.round(cc[0]);out[o+1]=Math.round(cc[1]);out[o+2]=Math.round(cc[2]);out[o+3]=255;}
      }
      return out;
    }
    // Sheet layout: for each flow, STEPS rows of river (strength 0..1); the last row is the waterfall.
    function createSheet(){
      var cv=document.createElement('canvas');cv.width=W*FRAMES;cv.height=H*(STEPS*flows.length+1);
      var ctx=cv.getContext('2d'),fi,r,f;
      for(fi=0;fi<flows.length;fi++)for(r=0;r<STEPS;r++)for(f=0;f<FRAMES;f++){
        var img=ctx.createImageData(W,H);img.data.set(renderFrame(f,r/(STEPS-1),'river',flows[fi]));ctx.putImageData(img,f*W,(fi*STEPS+r)*H);
      }
      for(f=0;f<FRAMES;f++){var im2=ctx.createImageData(W,H);im2.data.set(renderFrame(f,0.4,'fall',flows[0]));ctx.putImageData(im2,f*W,STEPS*flows.length*H);}
      return cv;
    }
    function draw(ctx,sheet,x,y,time,strength,opts){
      opts=opts||{};
      var fps=opts.fps||6,f=Math.floor(time*fps)%FRAMES,fi=Math.max(0,flows.indexOf(opts.flow||flows[0])),sc=opts.scale||1;
      var row=opts.waterfall?STEPS*flows.length:fi*STEPS+Math.max(0,Math.min(STEPS-1,Math.round((strength||0)*(STEPS-1))));
      ctx.imageSmoothingEnabled=false;
      ctx.drawImage(sheet,f*W,row*H,W,H,Math.round(x-OX*sc),Math.round(y-OY*sc),W*sc,H*sc);
    }
    return {W:W,H:H,anchor:{x:OX,y:OY},frames:FRAMES,strengthSteps:STEPS,flows:flows,renderFrame:renderFrame,createSheet:createSheet,draw:draw};
  }
  var api=create({pointy:false});
  api.create=create;
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LumberWater=api;
})(typeof window!=='undefined'?window:this);
