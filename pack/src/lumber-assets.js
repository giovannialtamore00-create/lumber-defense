/*
 * Lumber Defense asset loader.
 *
 *   LumberAssets.load('assets/').then(function(A){
 *     A.draw(ctx, 'outpost.archer', x, y, {player:2});     // x,y = hex centre on screen
 *     A.draw(ctx, 'hex_forest', x, y);
 *     var p = A.hexToScreen(q, r);                          // axial hex coords -> hex centre
 *     var h = A.screenToHex(px, py);                        // screen -> axial hex coords
 *   });
 *
 * Sprite names are listed in manifest.json. Sprites that belong to a player get a ".p1".."p4" suffix;
 * pass {player:n} to draw() and it adds the suffix for you. Every sprite is drawn with its anchor
 * (the hex centre at ground level) on x,y, so a structure lands exactly on a tile drawn at the same x,y.
 */
(function(root){
  function make(manifest,image){
    var T=manifest.tile,SQ3=Math.sqrt(3);
    var api={manifest:manifest,image:image,tile:T};
    api.has=function(name){return !!manifest.sprites[name];};
    api.spriteName=function(name,player){return player?name+'.p'+player:name;};
    api.draw=function(ctx,name,x,y,opts){
      opts=opts||{};
      var full=opts.player?name+'.p'+opts.player:name,s=manifest.sprites[full];
      if(!s)throw new Error('Unknown sprite: '+full);
      var sc=opts.scale||1;
      ctx.imageSmoothingEnabled=false;
      var prev=ctx.globalAlpha;if(opts.alpha!==undefined)ctx.globalAlpha=opts.alpha;
      ctx.drawImage(image,s.x,s.y,s.w,s.h,Math.round(x-s.ax*sc),Math.round(y-s.ay*sc),s.w*sc,s.h*sc);
      ctx.globalAlpha=prev;
    };
    // Axial hex coordinates (q, r) -> screen position of the hex centre. Matches the tile orientation in the manifest.
    var pointy=T.orientation==='pointy-top',SQ=T.sq||0.5;
    api.hexToScreen=function(q,r,scale){
      var sc=scale||1,R=T.size*sc;
      return pointy?{x:R*SQ3*(q+r/2),y:R*1.5*SQ*r}:{x:R*1.5*q,y:R*SQ3*SQ*(r+q/2)};
    };
    api.screenToHex=function(px,py,scale){
      var sc=scale||1,R=T.size*sc,x=px,y=py/SQ,q,r;
      if(pointy){r=y/(R*1.5);q=x/(R*SQ3)-r/2;}
      else{q=(2/3)*x/R;r=(-1/3)*x/R+(SQ3/3)*y/R;}
      var cx=q,cz=r,cy=-cx-cz,rx=Math.round(cx),ry=Math.round(cy),rz=Math.round(cz),dx=Math.abs(rx-cx),dy=Math.abs(ry-cy),dz=Math.abs(rz-cz);
      if(dx>dy&&dx>dz)rx=-ry-rz;else if(dy>dz)ry=-rx-rz;else rz=-rx-ry;
      return {q:rx+0,r:rz+0};
    };
    // Six corner points of a hex at x,y (for outlines or hit tests).
    api.hexCorners=function(x,y,scale){
      var sc=scale||1,pts=[],i,off=pointy?-Math.PI/6:0;
      for(i=0;i<6;i++){var a=Math.PI/3*i+off;pts.push({x:x+T.size*sc*Math.cos(a),y:y+T.size*sc*SQ*Math.sin(a)});}
      return pts;
    };
    // Water: bake once, then drawWater every frame.
    if(root.LumberWater){
      api.water=api.waterApi||root.LumberWater;
      api.waterSheet=null;
      api.drawWater=function(ctx,x,y,time,strength,opts){
        var w=api.waterApi||root.LumberWater;
        if(!api.waterSheet)api.waterSheet=w.createSheet();
        w.draw(ctx,api.waterSheet,x,y,time,strength,opts);
      };
    }
    return api;
  }
  function load(base){
    base=base||'assets/';
    return fetch(base+'manifest.json').then(function(r){return r.json();}).then(function(m){
      return new Promise(function(res,rej){
        var img=new Image();img.onload=function(){res(make(m,img));};img.onerror=rej;img.src=base+m.atlas;
      });
    });
  }
  var api={load:load,fromData:make};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LumberAssets=api;
})(typeof window!=='undefined'?window:this);
