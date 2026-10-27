(function(root){
  const controls = [
    [0,0],[0,-95],[18,-145],[66,-177],[128,-177],[183,-150],[215,-102],[222,-48],
    [198,-7],[156,21],[119,37],[100,70],[81,107],[39,126],[-18,126],[-67,105],
    [-103,69],[-115,22],[-106,-26],[-78,-65],[-43,-83]
  ];
  const samples=2400, points=[];
  function coord(t){
    const scaled=((t%1)+1)%1*controls.length, i=Math.floor(scaled), f=scaled-i;
    const p0=controls[(i-1+controls.length)%controls.length],p1=controls[i],p2=controls[(i+1)%controls.length],p3=controls[(i+2)%controls.length];
    const cat=(a,b,c,d)=>.5*((2*b)+(-a+c)*f+(2*a-5*b+4*c-d)*f*f+(-a+3*b-3*c+d)*f*f*f);
    return [cat(p0[0],p1[0],p2[0],p3[0]),cat(p0[1],p1[1],p2[1],p3[1])];
  }
  let length=0,last=null;
  for(let i=0;i<=samples;i++){
    const t=i/samples,[x,z]=coord(t); if(last)length+=Math.hypot(x-last.x,z-last.z);
    points.push({t,x,z,distance:length});last={x,z};
  }
  function atDistance(distance){
    let d=((distance%length)+length)%length,lo=0,hi=points.length-1;
    while(lo+1<hi){const mid=(lo+hi)>>1;if(points[mid].distance<d)lo=mid;else hi=mid;}
    const a=points[lo],b=points[hi],f=(d-a.distance)/Math.max(.0001,b.distance-a.distance);
    const before=points[Math.max(0,lo-2)],after=points[Math.min(points.length-1,hi+2)];
    const x=a.x+(b.x-a.x)*f,z=a.z+(b.z-a.z)*f,dx=after.x-before.x,dz=after.z-before.z,n=Math.hypot(dx,dz)||1;
    const t=a.t+(b.t-a.t)*f;
    return {x,z,y:.8+Math.sin(t*Math.PI*4)*1.2+Math.sin(t*Math.PI*8)*.35,tx:dx/n,tz:dz/n,angle:Math.atan2(dx,dz),t};
  }
  const api={controls,points,length,atDistance};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.PineTrack=api;
})(typeof window!=='undefined'?window:globalThis);
