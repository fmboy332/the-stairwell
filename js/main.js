// Menu wiring. Mochi's 3D level plugs into startGame().
import { startLevel, playPostCreditsLog } from './level.js';
const show = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id));
document.querySelectorAll('[data-go]').forEach(b => b.onclick = () => b.dataset.go === 'play' ? startGame() : show(b.dataset.go));
const applyBright = () => { document.getElementById('view').style.filter = `brightness(${bright.value})`; try{localStorage.setItem('scp087-bright', bright.value)}catch(e){} };
try{ const b=localStorage.getItem('scp087-bright'); if(b) bright.value=b; }catch(e){}
bright.oninput = applyBright; applyBright();
export const settings = { get volume(){return +vol.value}, get sensitivity(){return +sens.value} };
function startGame(){ show(''); startLevel({ canvas: document.getElementById('game'), settings,
  onEnd: () => { show('credits'); setTimeout(() => { if (document.getElementById('credits').classList.contains('on')) playPostCreditsLog(() => show('title')); }, 10000); } }); }
