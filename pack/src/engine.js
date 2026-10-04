// Isometric pixel renderer (build tool). World axes: +x runs right-down, +y runs left-down, z is up.
// Visible faces: top, +y face (left side of the screen) and +x face (right side).
// The hex tile is a flat-top hexagon squashed 2:1, centred on the anchor pixel (OX, OY).
var ISO={W:140,H:140,S:5,OX:70,OY:104,R:64,TH:1.2,SQ:0.5,POINTY:false};
// Switch geometry: flat-top at 2:1 (SQ 0.5) or pointy-top at the game's squash (SQ 0.62).
ISO.configure=function(c){ISO.POINTY=!!c.pointy;ISO.SQ=c.sq||0.5;if(c.R)ISO.R=c.R;};
ISO.pal={o:'#2b1d14',w:'#b07040',l:'#d09a5e',d:'#7a4a28',r:'#d9443a',g:'#aeb6bd',k:'#3f434c',a:'#5fb4e6',t:'#8a7a62',y:'#f2d04a',wh:'#f2f4f5',s:'#f2c79a',b:'#3d6fa8',f:'#f08a2a',
  st:'#9aa0a6',st2:'#b9bec3',n:'#5fae4d',n2:'#438a3c',n3:'#7bc45e',gr:'#76b255',dirt:'#8a6a4a',dirt2:'#6f5238'};

ISO.render=function(ops,opts){
  opts=opts||{};
  var W=ISO.W,H=ISO.H,S=ISO.S,buf=new Array(W*H),pal={},kk;
  for(kk in ISO.pal)pal[kk]=ISO.pal[kk];
  if(opts.accent)pal.r=opts.accent;
  var SQ=ISO.SQ;
  function P(x,y,z){return [ISO.OX+(x-y)*S,ISO.OY+(x+y)*S*SQ-z*S];}
  function S2(u,v,z){return [ISO.OX+u,ISO.OY+v-z*S];} // screen offset from the hex centre
  function fill(pts,k,sh){
    var minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9,i;
    pts.forEach(function(p){minx=Math.min(minx,p[0]);maxx=Math.max(maxx,p[0]);miny=Math.min(miny,p[1]);maxy=Math.max(maxy,p[1]);});
    for(var py=Math.max(0,Math.floor(miny));py<Math.min(H,Math.ceil(maxy));py++)for(var px=Math.max(0,Math.floor(minx));px<Math.min(W,Math.ceil(maxx));px++){
      var cx=px+.5,cy=py+.5,inside=false,j=pts.length-1;
      for(i=0;i<pts.length;i++){
        var a=pts[i],b=pts[j];
        if((a[1]>cy)!==(b[1]>cy)&&cx<(b[0]-a[0])*(cy-a[1])/(b[1]-a[1])+a[0])inside=!inside;
        j=i;
      }
      if(inside)buf[py*W+px]={k:k,sh:sh};
    }
  }
  function poly3(list,k,sh){fill(list.map(function(q){return P(q[0],q[1],q[2]);}),k,sh);}
  function q15(v){return Math.round(v/.15)*.15;}
  function ring(cx,cy,z,r,n){var a=[],i;for(i=0;i<n;i++){var t=Math.PI*2*i/n;a.push([cx+r*Math.cos(t),cy+r*Math.sin(t),z]);}return a;}
  function hexPts(rpx,z){var a=[],i,off=ISO.POINTY?-Math.PI/6:0;for(i=0;i<6;i++){var t=Math.PI/3*i+off,u=rpx*Math.cos(t),v=SQ*rpx*Math.sin(t);a.push([(u/S+v/(S*SQ))/2,(v/(S*SQ)-u/S)/2,z]);}return a;}
  ops.forEach(function(o){
    var t=o[0],x,y,z,w,d,h,k,i;
    if(t==='box'){
      x=o[1];y=o[2];z=o[3];w=o[4];d=o[5];h=o[6];k=o[7];
      poly3([[x+w,y,z],[x+w,y+d,z],[x+w,y+d,z+h],[x+w,y,z+h]],k,-.3);
      poly3([[x,y+d,z],[x+w,y+d,z],[x+w,y+d,z+h],[x,y+d,z+h]],k,0);
      poly3([[x,y,z+h],[x+w,y,z+h],[x+w,y+d,z+h],[x,y+d,z+h]],k,.22);
    }else if(t==='rbox'){ // ca,cb,z,wa,wb,h,k in the screen-aligned frame: a runs across the screen, b runs down it
      var ca=o[1],cb=o[2];z=o[3];var wa=o[4],wb=o[5];h=o[6];k=o[7];
      function W3(a,b,zz){return [(a+b)*0.5,(-a+b)*0.5,zz];}
      poly3([W3(ca-wa/2,cb+wb/2,z),W3(ca+wa/2,cb+wb/2,z),W3(ca+wa/2,cb+wb/2,z+h),W3(ca-wa/2,cb+wb/2,z+h)],k,-.12);
      poly3([W3(ca-wa/2,cb-wb/2,z+h),W3(ca+wa/2,cb-wb/2,z+h),W3(ca+wa/2,cb+wb/2,z+h),W3(ca-wa/2,cb+wb/2,z+h)],k,.22);
    }else if(t==='sbox'){ // cu,cv,z,e1x,e1y,e2x,e2y,h,k : a prism whose top is a screen-space parallelogram (for slanted bridges and dams)
      var cu=o[1],cv=o[2];z=o[3];var e1x=o[4],e1y=o[5],e2x=o[6],e2y=o[7];h=o[8];k=o[9];
      var sg=[[-1,-1],[1,-1],[1,1],[-1,1]],pp=sg.map(function(s){return [cu+s[0]*e1x/2+s[1]*e2x/2,cv+s[0]*e1y/2+s[1]*e2y/2];}),ii;
      for(ii=0;ii<4;ii++){var A=pp[ii],B=pp[(ii+1)%4],ex=B[0]-A[0],ey=B[1]-A[1],nx=ey,ny=-ex,mx=(A[0]+B[0])/2-cu,my=(A[1]+B[1])/2-cv;
        if(nx*mx+ny*my<0){nx=-nx;ny=-ny;}
        var nl=Math.sqrt(nx*nx+ny*ny)||1;nx/=nl;ny/=nl;
        if(ny>0.05)fill([S2(A[0],A[1],z),S2(B[0],B[1],z),S2(B[0],B[1],z+h),S2(A[0],A[1],z+h)],k,nx>0.3?-.3:(nx<-0.3?0:-.14));}
      fill(pp.map(function(p){return S2(p[0],p[1],z+h);}),k,.22);
    }else if(t==='hip'){
      x=o[1];y=o[2];z=o[3];w=o[4];d=o[5];h=o[6];k=o[7];
      var ap=[x+w/2,y+d/2,z+h];
      poly3([[x+w,y,z],[x+w,y+d,z],ap],k,-.2);
      poly3([[x,y+d,z],[x+w,y+d,z],ap],k,.1);
    }else if(t==='gable'){
      x=o[1];y=o[2];z=o[3];w=o[4];d=o[5];h=o[6];k=o[7];var ax=o[8];
      if(ax==='x'){
        var ym=y+d/2;
        poly3([[x+w,y,z],[x+w,y+d,z],[x+w,ym,z+h]],k,-.28);
        poly3([[x,y+d,z],[x+w,y+d,z],[x+w,ym,z+h],[x,ym,z+h]],k,.12);
      }else{
        var xm=x+w/2;
        poly3([[x+w,y,z],[x+w,y+d,z],[xm,y+d,z+h],[xm,y,z+h]],k,-.2);
        poly3([[x,y+d,z],[x+w,y+d,z],[xm,y+d,z+h]],k,.05);
      }
    }else if(t==='cyl'){ // cx,cy,z,r,h,k,r2 (top radius; 0 gives a cone),segments
      var cx=o[1],cy=o[2];z=o[3];var r=o[4];h=o[5];k=o[6];var r2=o[7]===undefined?r:o[7];var N=o[8]||20;
      for(i=0;i<N;i++){
        var a0=-Math.PI/4+(Math.PI*0.999)*i/N,a1=-Math.PI/4+(Math.PI*0.999)*(i+1)/N;
        var am=(a0+a1)/2,sh=q15(Math.max(-.38,Math.min(.08,-.3+.3*(am/(Math.PI/2)))));
        poly3([[cx+r*Math.cos(a0),cy+r*Math.sin(a0),z],[cx+r*Math.cos(a1),cy+r*Math.sin(a1),z],[cx+r2*Math.cos(a1),cy+r2*Math.sin(a1),z+h],[cx+r2*Math.cos(a0),cy+r2*Math.sin(a0),z+h]],k,sh);
      }
      if(r2>0.01)poly3(ring(cx,cy,z+h,r2,N),k,.22);
    }else if(t==='disc'){ // plane,p,q,z,r,thick,k,faceKey,teeth
      var pl=o[1],p=o[2],q=o[3];z=o[4];var rr=o[5],th=o[6];k=o[7];var fk=o[8]||k,teeth=o[9]||0,n=teeth?teeth*2:22;
      var dp=function(off){var a=[],j;for(j=0;j<n;j++){var ang=Math.PI*2*j/n,ro=teeth?(j%2?rr*.78:rr):rr,u=ro*Math.cos(ang),v=ro*Math.sin(ang);a.push(pl==='y'?[p+u,q+off,z+v]:[p+off,q+u,z+v]);}return a;};
      var rim=pl==='y'?-.22:-.12,face=pl==='y'?0:-.2;
      for(var off=0;off<th-0.01;off+=0.3)poly3(dp(off),k,rim);
      poly3(dp(th),fk,face);
    }else if(t==='hex'){ // rpx,z,h,topKey,sideKey,topShade
      var rpx=o[1];z=o[2];h=o[3];var tk=o[4],sk=o[5],ts=o[6]||0;
      var lo=hexPts(rpx,z),hi=hexPts(rpx,z+h),e,off=ISO.POINTY?-Math.PI/6:0;
      for(e=0;e<6;e++){var na=Math.PI/3*e+Math.PI/6+off;if(Math.sin(na)<0.01)continue;
        poly3([lo[e],lo[(e+1)%6],hi[(e+1)%6],hi[e]],sk,Math.max(-.3,Math.min(0,-.15-.17*Math.cos(na))));}
      poly3(hi,tk,ts);
    }
  });
  function mixc(c,tw,amt){var v=[parseInt(c.substr(1,2),16),parseInt(c.substr(3,2),16),parseInt(c.substr(5,2),16)],tgt=tw?255:15;return v.map(function(n){return Math.round(n+(tgt-n)*amt);});}
  var out=new Array(W*H),nb=[[1,0],[-1,0],[0,1],[0,-1]],x2,y2,i2;
  for(y2=0;y2<H;y2++)for(x2=0;x2<W;x2++){
    var c=buf[y2*W+x2],rgb=null;
    if(c)rgb=mixc(pal[c.k],c.sh>0,Math.abs(c.sh));
    else for(i2=0;i2<4;i2++){
      var xx=x2+nb[i2][0],yy=y2+nb[i2][1];
      if(xx<0||yy<0||xx>=W||yy>=H)continue;
      if(buf[yy*W+xx]){rgb=mixc(pal.o,false,0);break;}
    }
    out[y2*W+x2]=rgb;
  }
  return out;
};
// Hex outline used as the placement placeholder (white ring on the top face of a land tile).
ISO.hexOutline=function(){
  var W=ISO.W,H=ISO.H,S=ISO.S,out=new Array(W*H),zc=ISO.TH,off=ISO.POINTY?-Math.PI/6:0;
  function verts(r){var a=[],i;for(i=0;i<6;i++){var t=Math.PI/3*i+off;a.push([ISO.OX+r*Math.cos(t),ISO.OY-zc*S+ISO.SQ*r*Math.sin(t)]);}return a;}
  function inside(px,py,vs){var sgn=0,i;for(i=0;i<6;i++){var a=vs[i],b=vs[(i+1)%6],c=(b[0]-a[0])*(py-a[1])-(b[1]-a[1])*(px-a[0]);if(c!==0){if(!sgn)sgn=c>0?1:-1;else if((c>0?1:-1)!==sgn)return false;}}return true;}
  var outer=verts(ISO.R),inner=verts(ISO.R-4);
  for(var y=0;y<H;y++)for(var x=0;x<W;x++)if(inside(x+.5,y+.5,outer)&&!inside(x+.5,y+.5,inner))out[y*W+x]=[255,255,255];
  return out;
};
if(typeof module!=='undefined')module.exports=ISO;
