// Simple illustrations used when no photo exists in src/assets/products/<id>.jpg|png|webp
const bg = { beef: "#fde4e1", kottu: "#fdebd6", liver: "#f9e0e0", brain: "#fde6ee", spleen: "#ece1f3", kudal: "#fdf0dc", kidney: "#f8e3dc" };

const shapes = {
  beef: <>{[[30,40,0],[70,30,15],[100,50,-10],[55,62,8]].map(([x,y,r],i)=><rect key={i} x={x} y={y} width="46" height="30" rx="10" fill={i%2?"#d6303a":"#e4505a"} transform={`rotate(${r} ${x+23} ${y+15})`}/>)}</>,
  kottu: <>{Array.from({length:22}).map((_,i)=><circle key={i} cx={35+(i*37)%90} cy={30+(i*23)%48} r={7+(i%3)*2} fill={i%2?"#c4222c":"#e0555c"}/>)}</>,
  liver: <><path d="M25 60 C25 30 70 20 105 28 C135 34 140 55 120 68 C95 82 40 85 25 60Z" fill="#7a1f1f"/><path d="M60 40 C80 48 100 46 118 40" stroke="#a63a3a" strokeWidth="4" fill="none"/></>,
  brain: <><ellipse cx="80" cy="52" rx="48" ry="32" fill="#f2a4b8"/><path d="M80 22 V82 M52 40 q12 8 0 18 M108 40 q-12 8 0 18 M62 66 q10 -8 18 0 M80 38 q10 8 18 0" stroke="#d9728f" strokeWidth="3" fill="none" strokeLinecap="round"/></>,
  spleen: <path d="M20 62 C30 30 120 24 142 44 C148 62 100 80 60 76 C40 74 24 72 20 62Z" fill="#7b3a62"/>,
  kudal: <path d="M25 70 C25 30 60 30 60 55 C60 80 95 80 95 50 C95 25 130 30 135 55" stroke="#efb9a8" strokeWidth="16" fill="none" strokeLinecap="round"/>,
  kidney: <><path d="M60 22 C100 14 135 40 118 70 C108 88 82 80 84 62 C86 50 70 50 62 60 C50 74 28 60 34 42 C38 30 48 25 60 22Z" fill="#9a3b2e"/></>,
};

export default function Art({ id }) {
  return (
    <svg viewBox="0 0 160 100" role="img" aria-hidden="true" style={{ width: "100%", height: "100%", background: bg[id] || "#fde4e1" }}>
      {shapes[id] || shapes.beef}
    </svg>
  );
}
