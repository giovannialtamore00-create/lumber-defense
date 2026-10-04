// Sprite definitions for the pack. Everything is centred on the hex centre (0,0) and sits on the tile top (z = TH).
var LEG=require('./pieces.js').A;
var ISO=require('./engine.js');
var TH=1.2;
function bx(x,y,z,w,d,h,k){return ['box',x,y,z,w,d,h,k];}
function cy(cx,cy_,z,r,h,k,r2,n){return ['cyl',cx,cy_,z,r,h,k,r2,n];}
function dy(cx,y0,z,r,t,k,fk,teeth){return ['disc','y',cx,y0,z,r,t,k,fk,teeth];}
function dx(x0,cy_,z,r,t,k,fk,teeth){return ['disc','x',x0,cy_,z,r,t,k,fk,teeth];}
function rb(ca,cb,z,wa,wb,h,k){return ['rbox',ca,cb,z,wa,wb,h,k];}

// Move ops sideways (dx,dy) and up (dz). dz of TH puts a piece on top of a land tile.
function place(ops,dx_,dy_,dz){
  return ops.map(function(o){
    var c=o.slice(),t=c[0];
    if(t==='box'||t==='hip'||t==='gable'){c[1]+=dx_;c[2]+=dy_;c[3]+=dz;}
    else if(t==='cyl'){c[1]+=dx_;c[2]+=dy_;c[3]+=dz;}
    else if(t==='disc'){c[2]+=dx_;c[3]+=dy_;c[4]+=dz;}
    else if(t==='rbox'){c[3]+=dz;}
    return c;
  });
}
function legacy(name,u,dx_,dy_){return place(LEG[name](u),dx_,dy_,TH);}
// Scale every dimension of a piece about the hex centre (z too), then lift it onto the tile.
function scaleOps(ops,f){
  return ops.map(function(o){
    var c=o.slice(),t=c[0],i;
    if(t==='box'||t==='hip'||t==='gable'){for(i=1;i<=6;i++)c[i]*=f;}
    else if(t==='cyl'){c[1]*=f;c[2]*=f;c[3]*=f;c[4]*=f;c[5]*=f;if(c[7]!==undefined)c[7]*=f;}
    else if(t==='disc'){c[2]*=f;c[3]*=f;c[4]*=f;c[5]*=f;c[6]*=f;}
    return c;
  });
}
function small(ops,dx_,dy_,f){return place(scaleOps(place(ops,dx_,dy_,0),f),0,0,TH);}
var UNIT_SCALE=0.5;

/* ---- terrain ---- */
var D={};
function specks(seed,key){ // grass flecks on the tile top
  var a=[],i,s=seed;
  function rnd(){s=(s*9301+49297)%233280;return s/233280;}
  for(i=0;i<16;i++){var x=(rnd()-.5)*9,yy=(rnd()-.5)*9;a.push(bx(x,yy,TH,0.45,0.35,0.02,i%3?'n3':'n2'));}
  return a;
}
function landTile(){return [['hex',ISO_R(),0,TH,'gr','dirt',0]].concat(specks(7));}
function ISO_R(){return ISO.R;}
D['hex_land']=function(){return landTile();};
D['hex_dug']=function(){return [['hex',ISO_R(),0,0.6,'dirt','dirt2',0],bx(-3,-2,0.6,1.2,1,0.02,'dirt2'),bx(2,2,0.6,1.4,1,0.02,'dirt2'),bx(-1,3,0.6,1,0.8,0.02,'dirt2'),bx(3,-3,0.6,1.2,1,0.02,'dirt2')];};

/* ---- trees and rocks (positions are in world units from the hex centre) ---- */
function pine(x,y,s){s=s||1;return [bx(x-.25,y-.25,TH,.5,.5,.9,'d'),cy(x,y,TH+.6,1.25*s,1.3*s,'n2',.2*s,10),cy(x,y,TH+1.5*s,1.0*s,1.2*s,'n',.15*s,10),cy(x,y,TH+2.3*s,.72*s,1.2*s,'n3',.05*s,10)];}
function roundTree(x,y,s){s=s||1;return [bx(x-.28,y-.28,TH,.56,.56,1.1,'d'),cy(x,y,TH+.9,1.0*s,.7*s,'n2',1.3*s,12),cy(x,y,TH+1.6*s,1.3*s,.8*s,'n',1.0*s,12),cy(x,y,TH+2.4*s,1.0*s,.6*s,'n3',.5*s,12)];}
function sapling(x,y){return [bx(x-.12,y-.12,TH,.24,.24,.5,'d'),cy(x,y,TH+.35,.45,.75,'n3',.05,8)];}
function stump(x,y){return [cy(x,y,TH,.5,.35,'d',.5,10),cy(x,y,TH+.35,.4,.05,'l',.4,10)];}
function rock(x,y,s,z){s=s||1;z=z===undefined?TH:z;return [cy(x,y,z,1.3*s,.9*s,'st',1.0*s,7),cy(x+.15*s,y-.1*s,z+.9*s,.85*s,.55*s,'st2',.45*s,7)];}
function byDepth(list){return list.slice().sort(function(a,b){return (a.x+a.y)-(b.x+b.y);});}
function compose(items){return byDepth(items).reduce(function(acc,it){return acc.concat(it.ops);},[]);}
var FOREST=[[-3.8,-1.2,'p',1.0],[-1.0,-3.8,'r',1.0],[1.8,-3.2,'p',1.1],[3.8,-0.6,'r',0.9],[-2.6,1.6,'r',1.0],[0.2,-0.3,'p',1.2],[2.6,1.9,'p',1.0],[-0.4,3.6,'r',1.0],[4.0,3.0,'p',0.8]];
var TREE_GROW=1.35,ROCK_GROW=1.3; // bigger, taller trees and rocks on the terrain tiles
D['hex_forest']=function(){var it=FOREST.map(function(f){return {x:f[0],y:f[1],ops:f[2]==='p'?pine(f[0],f[1],f[3]*TREE_GROW):roundTree(f[0],f[1],f[3]*TREE_GROW)};});return landTile().concat(compose(it));};
D['hex_forest_depleted']=function(){var it=FOREST.map(function(f){return {x:f[0],y:f[1],ops:stump(f[0],f[1])};});return landTile().concat(compose(it));};
D['hex_forest_baby']=function(){var it=FOREST.map(function(f){return {x:f[0],y:f[1],ops:sapling(f[0],f[1])};});return landTile().concat(compose(it));};
D['hex_rock']=function(){var g=ROCK_GROW;return landTile().concat(compose([{x:-2.8,y:-1.5,ops:rock(-2.8,-1.5,1.2*g)},{x:1.2,y:-2.8,ops:rock(1.2,-2.8,0.9*g)},{x:0.4,y:0.4,ops:rock(0.4,0.4,1.6*g)},{x:3.2,y:1.2,ops:rock(3.2,1.2,1.0*g)},{x:-1.6,y:3.0,ops:rock(-1.6,3.0,0.8*g)}]));};
D['tree_pine']=function(){return pine(0,0,1.3);};
D['tree_round']=function(){return roundTree(0,0,1.3);};
D['tree_baby']=function(){return sapling(0,0);};
D['tree_stump']=function(){return stump(0,0);};
D['rock_s']=function(){return rock(0,0,0.7);};
D['rock_m']=function(){return rock(0,0,1.1);};
D['rock_l']=function(){return rock(0,0,1.7);};
D['stone']=function(){return rock(0,0,0.6);};

/* ---- log stacks (bottom of the hex, slightly right) ---- */
function logs(n){
  var a=[dx(1.2,2.4,TH+.55,.55,3.0,'w','l')];
  if(n>=2)a=[dx(1.2,1.5,TH+.55,.55,3.0,'w','l'),dx(1.2,2.7,TH+.55,.55,3.0,'w','l')];
  if(n>=3)a.push(dx(1.2,2.1,TH+1.55,.55,3.0,'w','l'));
  return a;
}
D['logstack_1']=function(){return logs(1);};
D['logstack_2']=function(){return logs(2);};
D['logstack_3']=function(){return logs(3);};

/* ---- structures. Each builder takes the state index. ---- */
D['outpost']=[function(){return legacy('Outpost',0,-4,-4);},function(){return legacy('Outpost',1,-4,-4);}];
D['workshop']=[function(){return legacy('Workshop',0,-3.8,-3.2);},function(){return legacy('Workshop',1,-3.8,-3.2);}];

function mill(u){
  var a=[bx(-3.2,-3.2,0,5.4,4.0,0.6,'d'),bx(-3.2,-3.2,0.6,5.4,4.0,2.6,'w'),
   bx(3.0,-2.0,0,0.15,1.4,2.0,'d'),bx(3.0,-0.2,1.6,0.15,0.8,0.9,'a'),
   ['gable',-3.5,-3.5,3.2,6.0,4.6,1.8,'r','x'],cy(-2.3,-2.1,3.4,0.5,2.6,'g')];
  if(u)a.push(cy(-0.8,-2.1,3.8,0.45,2.0,'g'),bx(3.2,0.6,0,1.2,2.0,0.8,'l'),bx(3.4,0.7,0.8,1.0,1.8,0.6,'l'));
  a.push(bx(-2.7,-3.6,6.0,0.8,0.8,0.7,'wh'));
  a.push(dy(-0.5,0.8,2.3,2.2,0.8,'w','w'),dy(-0.5,1.65,2.3,1.6,0.02,'d','d'),
   bx(-2.7,1.7,2.1,4.4,0.1,0.35,'l'),bx(-0.7,1.7,0.1,0.4,0.1,4.4,'l'),bx(-0.8,1.7,2.0,0.6,0.25,0.6,'k'));
  if(u)a.push(bx(-2.0,1.8,3.6,0.5,0.15,0.5,'y'));
  return place(a,0,-0.5,TH);
}
D['mill']=[function(){return mill(0);},function(){return mill(1);}];

function dock(u){
  var L=u?10.0:9.0,a=[bx(-1.8,-3.4,0,3.6,3.0,0.5,'d'),bx(-1.8,-3.4,0.5,3.6,3.0,0.3,'l')];
  // pier running out toward the river, past the hex edge
  a.push(bx(-1.8,-0.4,0,3.6,L,0.2,'d'),bx(-1.8,-0.4,0.2,3.6,L,0.3,'l'));
  for(var i=0;i<6;i++)a.push(bx(-1.8,0.6+i*1.5,0.5,3.6,0.1,0.02,'d'));
  a.push(cy(-1.6,L-0.8,-0.8,0.32,2.1,'d'),cy(1.6,L-0.8,-0.8,0.32,2.1,'d'),cy(-1.6,3.2,-0.8,0.32,2.1,'d'),cy(1.6,3.2,-0.8,0.32,2.1,'d'));
  a.push(bx(-1.8,0.2,0.5,0.18,L-1.0,0.6,'d'));
  a.push(bx(-4.4,-3.8,0,0.25,0.25,3.2,'d'),bx(-4.15,-3.8,2.4,1.5,0.12,0.8,'r'));
  a.push(bx(1.9,0.2,0.5,0.18,L-1.0,0.6,'d'));
  if(!u)a.push(dx(0.6,5.6,1.05,0.5,1.8,'w','l'),dx(0.6,6.8,1.05,0.5,1.8,'w','l'));
  else a.push(bx(2.2,-0.4,0,0.5,0.5,3.6,'d'),bx(2.25,-0.4,3.4,0.4,4.2,0.35,'d'),bx(2.35,3.5,2.2,0.1,0.1,1.4,'k'),
    dx(0.2,6.0,1.05,0.5,1.8,'w','l'),dx(0.2,7.2,1.05,0.5,1.8,'w','l'),dx(0.2,6.6,1.95,0.5,1.8,'w','l'),bx(-1.4,4.4,0.5,1.0,1.0,1.0,'l'));
  return place(a,0,0,TH);
}
D['dock']=[function(){return dock(0);},function(){return dock(1);}];

/* River pieces. The river runs north to south on screen: straight down on a flat-top grid ('S'),
   down-right ('SE') or down-left ('SW') on the pointy-top grid. Bridge and dam lie across the flow. */
var FLOW_DEG={S:90,SE:60,SW:120};
function dirS(deg,p){var a=deg*Math.PI/180;return [p*Math.cos(a),p*Math.sin(a)*ISO.SQ];} // distance p in the hex plane -> screen px
function toWorld(u,v){return [(u/ISO.S+v/(ISO.S*ISO.SQ))/2,(v/(ISO.S*ISO.SQ)-u/ISO.S)/2];}
function sb(c,z,e1,e2,h,k){return ['sbox',c[0],c[1],z,e1[0],e1[1],e2[0],e2[1],h,k];}
function bridge(flow,stage){
  stage=stage||2;
  var fd=FLOW_DEG[flow],cd=fd-90,Lh=ISO.POINTY?52:58,n=13,a=[],i,w=15;
  for(i=0;i<n;i++){var t=(i/(n-1))*2-1,c=dirS(cd,t*Lh),z=0.6+1.9*(1-t*t),seg=dirS(cd,(2*Lh/(n-1))*1.2);
    a.push(sb(c,z-0.2,seg,dirS(fd,w),0.7,'l'));}
  [-1,1].forEach(function(sg){a.push(sb(dirS(cd,sg*Lh*0.72),-0.6,dirS(cd,6),dirS(fd,w-3),3.0,'d'));});
  if(stage>=2){ // railing posts and the owner's rail
    for(i=0;i<n;i+=2){var t2=(i/(n-1))*2-1,c2=dirS(cd,t2*Lh),f2=dirS(fd,w/2+1),z2=0.6+1.9*(1-t2*t2);
      a.push(sb([c2[0]+f2[0],c2[1]+f2[1]],z2+0.5,[3,0],[0,2],1.0,'d'));}
    var rf=dirS(fd,w/2+1);
    a.push(sb([rf[0],rf[1]],3.0,dirS(cd,2*Lh),dirS(fd,2),0.35,'r'));
  }
  if(stage>=3)[-1,1].forEach(function(sg){ // gate towers at both ends
    var c3=dirS(cd,sg*Lh*0.92);
    a.push(sb(c3,0,dirS(cd,9),dirS(fd,12),5.2,'st'),sb(c3,5.2,dirS(cd,11),dirS(fd,14),0.6,'d'),sb(c3,5.8,dirS(cd,3),dirS(fd,3),2.2,'d'),sb([c3[0]+4,c3[1]-2],7.2,[6,0],[0,1.5],0.8,'r'));
  });
  return place(a,0,0,0.6);
}
D['bridge']=[function(f){return bridge(f||'S');}];

function dam(flow,dmg){
  var fd=FLOW_DEG[flow],cd=fd-90,Lh=ISO.POINTY?52:58,a=[],i,n=14;
  for(i=0;i<5;i++){var c=dirS(cd,-Lh+ i*(2*Lh/4)),b=dirS(fd,-14),xy=toWorld(c[0]+b[0],c[1]+b[1]);
    a.push(['box',xy[0]-1.4,xy[1]-0.5,-0.2+(i%2)*0.3,2.8,1.0,0.8,'l']);}
  for(i=0;i<n;i++){
    if(dmg&&(i===5||i===6||i===10))continue;
    var p=-Lh+i*(2*Lh/(n-1)),pt=dirS(cd,p),xy2=toWorld(pt[0],pt[1]),h=dmg&&(i===4||i===7||i===11)?2.2:4.2;
    a.push(cy(xy2[0],xy2[1],-0.6,0.65,h+0.6,'w',0.65,10));
  }
  var bf=dirS(fd,4);
  a.push(sb(bf,1.9,dirS(cd,2*Lh),dirS(fd,4),0.5,'d'),sb(bf,0.1,dirS(cd,2*Lh),dirS(fd,4),0.5,'d'));
  [-1,1].forEach(function(sg){var pe=dirS(cd,sg*(Lh+2)),xe=toWorld(pe[0],pe[1]);a.push(['box',xe[0]-0.3,xe[1]-0.3,-0.6,0.6,0.6,5.6,'d']);});
  var pf=dirS(cd,Lh+2),xf=toWorld(pf[0],pf[1]);a.push(['box',xf[0]-0.2,xf[1]-0.2,4.4,1.8,0.2,1.0,'r']);
  if(dmg)a.push(sb(dirS(cd,-6),1.6,dirS(cd,16),dirS(fd,2),0.15,'k'),sb(dirS(cd,20),1.0,dirS(cd,12),dirS(fd,2),0.15,'k'));
  return place(a,0,0,0.6);
}
D['dam']=[function(f){return dam(f||'S',0);},function(f){return dam(f||'S',1);}];

function excavator(u){
  var a=[bx(-4.2,-4.2,0,8.4,8.4,0.15,'dirt'),bx(-3.0,2.0,0.15,1.6,1.2,0.02,'dirt2'),bx(1.5,-3.0,0.15,1.8,1.4,0.02,'dirt2'),
   bx(-3.2,-3.0,0.15,5.0,1.5,1.0,'k'),bx(-3.2,1.7,0.15,5.0,1.5,1.0,'k'),
   bx(-2.8,-1.9,1.2,4.2,3.8,1.2,'y'),
   bx(-2.4,-1.4,2.4,2.4,2.8,1.5,'l'),bx(-2.2,1.35,2.8,1.6,0.12,0.8,'a'),bx(-2.6,-1.6,3.9,2.8,3.2,0.5,'r'),
   cy(-1.8,-1.2,2.4,0.3,2.4,'g',0.3,8)];
  var i;
  for(i=0;i<6;i++)a.push(bx(1.2+i*0.55,-0.4,1.8+i*0.4,0.8,0.8,0.6,'y'));
  if(!u){
    for(i=0;i<5;i++)a.push(bx(4.2+i*0.35,-0.4,3.7-i*0.7,0.6,0.6,0.6,'g'));
    a.push(bx(5.5,-0.9,0.2,1.3,1.8,0.9,'k'));
  }else{
    for(i=0;i<5;i++)a.push(bx(4.2+i*0.35,-0.4,3.9-i*0.35,0.6,0.6,0.6,'g'));
    a.push(bx(5.7,-0.9,1.8,1.3,1.8,0.9,'k'),bx(5.8,-0.7,2.5,1.0,1.4,0.5,'dirt'),bx(-0.5,3.3,0.15,1.8,1.4,0.7,'dirt'),bx(-0.2,3.5,0.85,1.2,1.0,0.5,'dirt'));
  }
  return place(a,0,0,TH);
}
D['excavator']=[function(){return excavator(0);},function(){return excavator(1);}];

/* ---- units ---- */
D['woodchopper']=[function(){return small(LEG.Woodchopper(0),-3.4,-4,UNIT_SCALE);},function(){return small(LEG.Woodchopper(1),-3.4,-4,UNIT_SCALE);}];
D['catapult']=[function(){return legacy('Catapult',0,-4,-4);},function(){return legacy('Catapult',1,-4,-4);}];
function carrierMid(){
  var a=[dy(2.0,0.7,1.15,1.15,0.8,'k','g'),dy(5.5,0.7,1.15,1.15,0.8,'k','g'),
    bx(0.8,1.5,1.2,6.0,4.2,0.85,'w'),bx(0.8,5.7,1.3,6.0,0.12,0.42,'r'),
    dy(2.0,5.7,1.15,1.15,0.8,'k','g'),dy(5.5,5.7,1.15,1.15,0.8,'k','g'),
    dx(1.3,2.3,2.7,0.72,5.2,'w','l'),dx(1.3,3.8,2.7,0.72,5.2,'w','l'),dx(1.3,5.0,2.7,0.72,5.2,'w','l'),dx(1.3,3.0,3.9,0.72,5.2,'w','l'),
    bx(-0.2,3.0,1.4,1.0,0.5,0.3,'d')];
  return small(a,-3.8,-3.8,UNIT_SCALE);
}
D['carrier']=[function(){return small(LEG.Carrier(0),-3.6,-3.4,UNIT_SCALE);},function(){return carrierMid();},function(){return small(LEG.Carrier(1),-3.6,-3.6,UNIT_SCALE);}];


/* ---- Upgrade stages (Pokemon-style): stage 1 small and simple, stage 2 ~30% bigger with a couple more parts,
   stage 3 ~30% bigger again with one more feature. One look per stage, whatever path was bought. ---- */
var F1=0.77,F3=1.3;
function grow(ops,f){return place(scaleOps(place(ops,0,0,-TH),f),0,0,TH);}
function legacyWith(name,u,dx_,dy_,before,after){return place((before||[]).concat(LEG[name](u),after||[]),dx_,dy_,TH);}

D.stages={};
D.stages.outpost=[
  function(){return grow(legacy('Outpost',0,-4,-4),F1);},
  function(){return legacy('Outpost',1,-4,-4);},
  function(){ // stone footing and a second banner
    return grow(legacyWith('Outpost',1,-4,-4,[bx(1.7,1.7,0,4.6,4.6,0.7,'st')],
      [bx(5.6,5.6,5.2,0.25,0.25,2.6,'d'),bx(5.85,5.6,7.0,1.5,0.12,0.8,'r')]),F3);}
];
D.stages.workshop=[
  function(){return grow(legacy('Workshop',0,-3.8,-3.2),F1);},
  function(){return legacy('Workshop',1,-3.8,-3.2);},
  function(){ // a golden cog on the tower and a second chimney
    return grow(legacyWith('Workshop',1,-3.8,-3.2,[],[dy(6.8,2.85,3.6,0.75,0.25,'y','y',8),cy(3.6,1.5,3.4,0.35,1.6,'g')]),F3);}
];
D.stages.mill=[
  function(){return grow(mill(0),F1);},
  function(){return mill(1);},
  function(){ // weather vane and a banner on the roof
    return grow(mill(1).concat(place([bx(0.2,-1.0,5.0,0.2,0.2,1.4,'d'),bx(0.0,-1.2,6.2,0.9,0.15,0.4,'y'),
      bx(-3.0,-3.0,4.6,0.2,0.2,2.0,'d'),bx(-2.8,-3.0,5.8,1.2,0.12,0.7,'r')],0,-0.5,TH)),F3);}
];
D.stages.dock=[
  function(){return grow(dock(0),0.85);},
  function(){return dock(1);},
  function(){ // a lantern at the end of the pier and crates on the quay
    return grow(dock(1).concat(place([bx(-1.75,8.6,0.5,0.25,0.25,2.4,'d'),bx(-1.9,8.45,2.9,0.55,0.55,0.6,'y'),
      bx(-1.5,-3.2,0.8,1.2,1.2,1.1,'w'),bx(-0.2,-3.2,0.8,1.0,1.0,0.9,'l')],0,0,TH)),1.15);}
];
D.stages.bridge=[
  function(f){return bridge(f||'S',1);},
  function(f){return bridge(f||'S',2);},
  function(f){return bridge(f||'S',3);}
];
D.stages.catapult=[
  function(){return grow(legacy('Catapult',0,-4,-4),F1);},
  function(){return legacy('Catapult',0,-4,-4);},
  function(){return grow(legacy('Catapult',1,-4,-4),F3*0.95);}
];
D.stages.woodchopper=[
  function(){return figure(lumberjack(),0.9);},
  function(){return small(LEG.Woodchopper(0),-3.4,-4,UNIT_SCALE);},
  function(){return small(LEG.Woodchopper(1),-3.4,-4,UNIT_SCALE*F3);}
];
D.stages.carrier=[
  function(){return small(LEG.Carrier(0),-3.6,-3.4,UNIT_SCALE*0.9);},
  function(){return carrierMid();},
  function(){return small(LEG.Carrier(1),-3.6,-3.6,UNIT_SCALE*1.1);}
];
D.stages.forestGuard=[
  function(){return figure(ranger(0),0.9);},
  function(){return figure(ranger(1),0.9*1.25);},
  function(){return figure(ranger(2),0.9*1.25*1.25);}
];

/* ---- People: built at full size around (0,0) on the ground, then scaled down like the other units. ---- */
function person(o){
  o=o||{};
  var a=[bx(-0.6,-0.2,0,0.5,0.5,1.8,'k'),bx(0.1,-0.2,0,0.5,0.5,1.8,'k'),
    bx(-0.8,-0.5,1.8,1.6,1.1,2.0,o.body||'r'),bx(-0.55,-0.35,3.8,1.1,0.9,1.0,'s')];
  if(o.hat==='ranger')a.push(cy(0,0.1,4.7,1.15,0.2,'n2',1.15,10),cy(0,0.1,4.9,0.6,0.75,'n2',0.15,10));
  else if(o.hat==='helmet')a.push(cy(0,0.1,4.7,0.75,0.5,'y',0.55,10));
  else a.push(bx(-0.6,-0.4,4.8,1.2,1.0,0.35,o.hatKey||'d'));
  return a;
}
function figure(ops,f){return place(scaleOps(ops,f),0,0,TH);}
function lumberjack(){ // a woodcutter with an axe and a cut log
  return [dx(-2.6,1.2,0.45,0.45,1.8,'w','l')].concat(person({hatKey:'r',body:'w'}),
    [bx(0.95,0.0,1.4,0.25,0.25,2.4,'d'),bx(0.8,-0.35,3.4,0.55,0.9,0.6,'g'),bx(-0.8,-0.5,2.6,1.6,1.1,0.3,'r')]);
}
function ranger(lv){ // forest guard: green hat; then a watering can and backpack; then a lantern staff and a sapling
  var a=[];
  if(lv>=2)a.push(cy(-2.4,1.6,0,0.35,0.5,'d',0.35,8),cy(-2.4,1.6,0.4,0.9,1.4,'n3',0.05,8));
  if(lv>=1)a.push(bx(-0.75,-1.2,2.0,1.4,0.7,1.6,'w'));
  a=a.concat(person({hat:'ranger',body:'r'}));
  if(lv>=1)a.push(bx(1.0,0.2,1.2,0.9,0.7,0.8,'a'),bx(1.9,0.4,1.7,0.7,0.2,0.2,'a'));
  if(lv>=2)a.push(bx(-1.3,0.6,0,0.25,0.25,5.6,'d'),bx(-1.45,0.45,5.4,0.55,0.55,0.6,'y'));
  return a;
}
D.stoneCutter=function(){ // helmet, pickaxe and chips of stone
  return figure([bx(1.6,1.4,0,0.6,0.5,0.4,'st'),bx(2.3,0.6,0,0.5,0.6,0.3,'st2')].concat(person({hat:'helmet',body:'r'}),
    [bx(0.95,0.0,1.4,0.25,0.25,2.4,'d'),bx(0.4,-0.1,3.6,1.6,0.4,0.35,'g')]),0.9);
};

/* ---- Debris: broken planks and a post; burnt debris is charred, with embers. ---- */
function debris(burnt){
  var w=burnt?'k':'w',l=burnt?'o':'l',d=burnt?'o':'d';
  var a=[bx(-3.0,1.4,0,1.4,1.1,0.5,burnt?'k':'t'),bx(-2.2,-1.2,0,3.4,0.7,0.4,w),bx(0.6,-0.4,0,0.7,3.2,0.4,l),
    bx(-1.0,0.8,0.4,2.8,0.6,0.35,d),bx(-0.4,-2.6,0,0.6,0.6,1.7,d),bx(1.6,1.6,0,1.2,0.9,0.6,burnt?'o':'st')];
  if(burnt)a.push(bx(-1.5,-1.0,0.45,0.3,0.3,0.1,'f'),bx(0.8,0.6,0.45,0.3,0.3,0.1,'f'),bx(-0.2,1.0,0.8,0.25,0.25,0.1,'y'));
  return place(scaleOps(a,1.5),0,0,TH);
}
D.debris=function(){return debris(false);};
D.debris_burnt=function(){return debris(true);};

module.exports=D;
