const $ = id => document.getElementById(id);
const titles = {thinking:'Рассуждение', python:'Вызов Python', result:'Результат Python'};
const games = ['sb26','tr87'];
const memory = new Map(), cache = new Map();
let active, index = 0, generation = 0, displayedCard = -1, selectedLine = null;
function load(game) {
  if (!cache.has(game)) {
    const promise = Promise.all([
      fetch('./data/'+game+'.json').then(r => { if (!r.ok) throw Error(r.status); return r.json(); }),
      new Promise((resolve,reject) => {const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src='./data/'+game+'.png';})
    ]).then(([d,img]) => {
      const atlas = document.createElement('canvas'); atlas.width=img.width; atlas.height=img.height;
      const ctx=atlas.getContext('2d',{willReadFrequently:true}); ctx.drawImage(img,0,0);
      const steps=[], cardSteps=[], levelSteps=[];
      d.cards.forEach((c,ci) => {
        cardSteps.push(steps.length);
        const add=(frame,mark=null,ai=0) => {
          const level=d.frames[frame].level;
          if(levelSteps[level]===undefined) levelSteps[level]=steps.length;
          steps.push({ci,frame,mark,ai});
        };
        if(c.actions?.length) {
          if(c.objects.some(o=>o.frame===c.frame)) add(c.frame);
          c.actions.forEach((m,k)=>add(m.frame,m,k+1));
        } else add(c.frame);
      });
      return {d,atlas,ctx,steps,cardSteps,levelSteps};
    }).catch(e=>{cache.delete(game);throw e;});
    cache.set(game,promise);
  }
  return cache.get(game);
}
async function choose(game, desired) {
  const ticket=++generation;
  $('status').textContent='Загрузка траектории…'; $('status').hidden=false;
  $('replay').hidden=$('controls').hidden=true;
  document.querySelectorAll('[data-game]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.game===game)));
  try {
    const result=await load(game);
    if(ticket!==generation)return;
    active=result;displayedCard=-1;
    const count=result.d.frames.length-1;
    $('game-name').textContent=game.toUpperCase();
    $('game-meta').textContent=result.d.levels+' уровней · '+count+(game==='tr87'?' ход':' ходов');
    $('position').max=result.steps.length;
    $('levels').replaceChildren();
    result.levelSteps.forEach((pos,level)=>{
      const b=document.createElement('button'); b.textContent=level; b.title='Уровень '+level;
      b.setAttribute('aria-label',b.title); b.dataset.level=level;b.onclick=()=>go(pos);$('levels').append(b);
    });
    $('status').hidden=true;$('replay').hidden=$('controls').hidden=false;
    go(desired??memory.get(game)??0);
  } catch(e) {
    if(ticket===generation){$('status').textContent='Не удалось загрузить запись. Выберите игру ещё раз.';active=null;}
  }
}
function go(pos) {
  if(!active)return;
  index=Math.min(active.steps.length-1,Math.max(0,Math.trunc(pos)||0));
  memory.set(active.d.game,index);
  const hash='#'+active.d.game+'/'+(index+1);
  if(location.hash!==hash)history.replaceState(null,'',hash);
  render();
}
function framePixels(n) {
  const {ctx,d}=active;
  return ctx.getImageData((n%d.atlasCols)*64,Math.floor(n/d.atlasCols)*64,64,64).data;
}
function componentMask(pixels,objects) {
  const mask=new Uint8Array(4096);
  const same=(a,b)=>pixels[4*a]===pixels[4*b]&&pixels[4*a+1]===pixels[4*b+1]&&pixels[4*a+2]===pixels[4*b+2];
  for(const {r,c} of objects) {
    const seed=r*64+c;if(mask[seed])continue;
    const stack=[seed];mask[seed]=1;
    while(stack.length) {
      const p=stack.pop(), x=p%64;
      for(const q of [x>0?p-1:-1,x<63?p+1:-1,p>=64?p-64:-1,p<4032?p+64:-1]) {
        if(q>=0&&!mask[q]&&same(seed,q)){mask[q]=1;stack.push(q);}
      }
    }
  }
  return mask;
}
function contour(ctx,mask,color,fill) {
  ctx.fillStyle=fill; ctx.strokeStyle=color;ctx.lineWidth=2;
  ctx.beginPath();
  for(let k=0;k<4096;k++) if(mask[k]) {
    const c=k%64,r=k>>6,x=c*10,y=r*10;
    ctx.fillRect(x,y,10,10);
    if(!c||!mask[k-1]){ctx.moveTo(x,y);ctx.lineTo(x,y+10);}
    if(c===63||!mask[k+1]){ctx.moveTo(x+10,y);ctx.lineTo(x+10,y+10);}
    if(!r||!mask[k-64]){ctx.moveTo(x,y);ctx.lineTo(x+10,y);}
    if(r===63||!mask[k+64]){ctx.moveTo(x,y+10);ctx.lineTo(x+10,y+10);}
  }
  ctx.stroke();
}
function drawBoard(step,selected) {
  const {d,atlas}=active, n=step.frame;
  const ctx=$('board').getContext('2d');
  ctx.imageSmoothingEnabled=false;
  ctx.drawImage(atlas,(n%d.atlasCols)*64,Math.floor(n/d.atlasCols)*64,64,64,0,0,640,640);
  let note=d.frames[n].win?'Игра завершена · WIN':'Поле 64 × 64',color='var(--muted)';
  if(selected.length){
    const mask=componentMask(framePixels(n),selected);
    ctx.fillStyle='rgba(10,21,27,.55)';
    for(let k=0;k<4096;k++) if(!mask[k]) ctx.fillRect(k%64*10,(k>>6)*10,10,10);
    contour(ctx,mask,'#83e1c9','transparent');
    const obj=selected[0];
    note=selected.length===1?(obj.id!==null?'Объект '+obj.id:'Объект')+' · '+obj.size+' пикс.':'Объекты из выбранных строк · '+selected.length;
    color='var(--mint)';
  } else if(step.mark){
    const a=framePixels(n-1),b=framePixels(n),mask=new Uint8Array(4096);let changed=0;
    for(let i=0;i<4096;i++){const j=i*4;if(a[j]!==b[j]||a[j+1]!==b[j+1]||a[j+2]!==b[j+2]){mask[i]=1;changed++;}}
    contour(ctx,mask,'#ffbf69','rgba(255,191,105,.21)');
    const action=d.frames[n].action, m=/row=(\d+), col=(\d+)/.exec(action);
    if(m){ctx.beginPath();ctx.arc((+m[2]+.5)*10,(+m[1]+.5)*10,17,0,Math.PI*2);ctx.strokeStyle='#142025';ctx.lineWidth=6;ctx.stroke();ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();}
    note=action+' · изменилось клеток: '+changed;color='var(--gold)';
  }
  $('note').textContent=note;$('swatch').style.background=color;
  $('board').setAttribute('aria-label',d.game.toUpperCase()+', ход '+n+'. '+note);
}
function render() {
  const {d,steps,cardSteps}=active, s=steps[index], c=d.cards[s.ci], f=d.frames[s.frame], changed=displayedCard!==s.ci;
  selectedLine=null;
  $('move').textContent='Ход '+s.frame+' / '+(d.frames.length-1);
  $('turn').textContent='Ответ '+c.turn+' / '+d.cards.at(-1).turn;
  $('kind').textContent=titles[c.kind];
  $('group').textContent='Окно '+(s.ci+1)+' / '+d.cards.length;
  $('outcome').textContent=f.win?'Победа · WIN':'';
  $('position').value=index+1;$('step').textContent='Шаг '+(index+1)+' / '+steps.length;
  $('prev').disabled=index===0;$('next').disabled=index===steps.length-1;
  $('prev-card').disabled=s.ci===0;$('next-card').disabled=s.ci===cardSteps.length-1;
  document.querySelectorAll('#levels button').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.level)===f.level)));
  const paper=$('paper'),objects=(c.objects||[]).filter(o=>o.frame===s.frame);
  document.querySelector('.terminal').dataset.kind=c.kind;
  if(changed) {
    const frag=document.createDocumentFragment();
    c.text.split('\n').forEach(txt=>{const line=document.createElement('span');line.className='logline';line.textContent=txt;frag.append(line);});
    paper.replaceChildren(frag);paper.scrollTop=0;displayedCard=s.ci;
  }
  paper.querySelectorAll('.active,.actionline,[data-objects]').forEach(el=>{el.classList.remove('active','actionline');el.removeAttribute('data-objects');});
  for(const o of objects)paper.children[o.line].dataset.objects=o.line;
  let initial=[];
  if(s.mark){
    if(s.mark.line!==null) {
      const el=paper.children[s.mark.line];el.classList.add('actionline');
      if(!changed && paper.scrollHeight>paper.clientHeight) {
        const rect=el.getBoundingClientRect(),view=paper.getBoundingClientRect();
        if(rect.bottom>view.bottom||rect.top<view.top)paper.scrollTop+=rect.top-view.top-12;
      }
    }
  } else if(objects.length){
    initial=objects.filter(o=>o.size<=64 && o.r<52).slice(0,4);
    if(!initial.length)initial=objects.slice(0,1);
    for(const o of initial)paper.children[o.line].classList.add('active');
  }
  let info=[];
  if(s.mark)info.push('Действие '+s.ai+' из '+c.actions.length);
  if(s.mark && s.mark.line===null)info.push('по записи среды');
  if(objects.length)info.push('Нажмите строку объекта для подсветки');
  if(!info.length && paper.scrollHeight>paper.clientHeight)info.push('Прокрутите текст внутри окна');
  $('feedback').textContent=info.join(' · ');
  drawBoard(s,initial);
}
$('paper').onclick=e=>{
  if(!active)return;
  const line=e.target.closest('[data-objects]');if(!line)return;
  const i=Number(line.dataset.objects),s=active.steps[index],c=active.d.cards[s.ci];
  if(selectedLine===i){render();return;}
  selectedLine=i;
  $('paper').querySelectorAll('.active').forEach(el=>el.classList.remove('active'));line.classList.add('active');
  drawBoard(s,c.objects.filter(o=>o.line===i&&o.frame===s.frame));
};
$('prev').onclick=()=>go(index-1);$('next').onclick=()=>go(index+1);
function skip(delta){if(active){const j=active.steps[index].ci+delta;if(j>=0&&j<active.cardSteps.length)go(active.cardSteps[j]);}}
$('prev-card').onclick=()=>skip(-1);$('next-card').onclick=()=>skip(1);
$('position').oninput=e=>go(Number(e.target.value)-1);
document.querySelectorAll('[data-game]').forEach(b=>b.onclick=()=>choose(b.dataset.game));
document.addEventListener('keydown',e=>{
  if(!active||e.altKey||e.ctrlKey||e.metaKey||e.target.tagName==='INPUT')return;
  if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();const d=e.key==='ArrowRight'?1:-1;if(e.shiftKey)skip(d);else go(index+d);}
  if(e.key==='Home'||e.key==='End'){e.preventDefault();go(e.key==='Home'?0:active.steps.length-1);}
});
function route(){
  const m=/^#(sb26|tr87)(?:\/(\d+))?$/.exec(location.hash);
  choose(m?.[1]||games[0],m?.[2]?Number(m[2])-1:0);
}
window.addEventListener('hashchange',route);route();
