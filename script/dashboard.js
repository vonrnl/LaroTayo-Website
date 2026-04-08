import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain: "bestinthesis-ef4e4.firebaseapp.com",
  projectId: "bestinthesis-ef4e4",
  storageBucket: "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId: "1:774078773253:web:28a0345c51393e9d9e046c"
};

// Reuse existing Firebase app if already initialized (avoids duplicate app error)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth=getAuth(app);
const db=getFirestore(app);

// DATE
document.getElementById('dash-date').textContent=new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

// HELPERS
function animateCounter(el,target){
  if(target===0){el.textContent=0;return;}
  let start=0;
  const step=target/(1200/16);
  const timer=setInterval(()=>{
    start+=step;
    if(start>=target){el.textContent=target;clearInterval(timer);return;}
    el.textContent=Math.floor(start);
  },16);
}

function isToday(date){return date.toDateString()===new Date().toDateString();}
function isYesterday(date){const y=new Date();y.setDate(y.getDate()-1);return date.toDateString()===y.toDateString();}
function formatDate(ts){
  if(!ts)return '';
  const date=ts.toDate?ts.toDate():new Date(ts);
  const time=date.toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit',hour12:true});
  if(isToday(date))return `Today, ${time}`;
  if(isYesterday(date))return `Yesterday, ${time}`;
  return date.toLocaleDateString('en-PH');
}

function starsFromLevel(level){return `⭐ ${Math.min(level,5)}/5 Stars`;}
function progressFromLevel(level){return Math.min(level*20,100);}

// CHARTS
let weeklyChart,scoreChart;

function renderCharts(weeklyData,scores){
  if(weeklyChart)weeklyChart.destroy();
  if(scoreChart)scoreChart.destroy();

  weeklyChart=new Chart(document.getElementById('weeklyChart').getContext('2d'),{
    type:'bar',
    data:{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],datasets:[{label:'Games Played',data:weeklyData,backgroundColor:'rgba(244,162,52,0.8)',borderColor:'#D4851A',borderWidth:2,borderRadius:8}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,color:'#4A6A8A',font:{family:'Nunito',weight:'700'}},grid:{color:'rgba(0,0,0,0.05)'}},x:{ticks:{color:'#4A6A8A',font:{family:'Nunito',weight:'700'}},grid:{display:false}}}}
  });

  scoreChart=new Chart(document.getElementById('scoreChart').getContext('2d'),{
    type:'doughnut',
    data:{labels:['Patintero','Luksong Baka','Langit Lupa'],datasets:[{data:[scores.pat||0,scores.baka||0,scores.langit||0],backgroundColor:['rgba(244,162,52,0.85)','rgba(43,127,212,0.85)','rgba(76,175,80,0.85)'],borderColor:['#D4851A','#1A5A9A','#2E7D32'],borderWidth:3,hoverOffset:8}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#1A3A5C',font:{family:'Nunito',weight:'700'},padding:16}}}}
  });
}

// PROGRESS
const GAMES=[
  {key:'pat',name:'Patintero',icon:'🏃',color:'orange'},
  {key:'baka',name:'Luksong Baka',icon:'🐄',color:'blue'},
  {key:'langit',name:'Langit Lupa',icon:'☁️',color:'green'}
];

function renderProgress(scores,levels){
  const grid=document.getElementById('progress-grid');
  const cards=GAMES.map(g=>{
    const level=levels?.[g.key]||0;
    const best=scores?.[g.key]||0;
    const pct=progressFromLevel(level);
    const stars=starsFromLevel(level);
    return `<div class="progress-card"><div class="progress-game-info"><span class="progress-icon">${g.icon}</span><div><h4>${g.name}</h4><span class="progress-level">Level ${level}</span></div><span class="progress-percent">${pct}%</span></div><div class="progress-bar-wrap"><div class="progress-bar ${g.color}" style="width:0%" data-width="${pct}%"></div></div><div class="progress-stats"><span>🎯 Best Score: ${best}</span><span>${stars}</span></div></div>`;
  });

  cards.push(`<div class="progress-card locked"><div class="progress-game-info"><span class="progress-icon">🔒</span><div><h4>Bamsak</h4><span class="progress-level">Locked</span></div><span class="progress-percent">0%</span></div><div class="progress-bar-wrap"><div class="progress-bar gray" style="width:0%"></div></div><div class="progress-stats"><span>🔓 Reach Level 5 to unlock</span></div></div>`);

  grid.innerHTML=cards.join('');

  setTimeout(()=>{
    grid.querySelectorAll('.progress-bar[data-width]').forEach(bar=>{
      bar.style.width=bar.getAttribute('data-width');
    });
  },100);
}

// HISTORY
function renderHistory(docs){
  const container=document.getElementById('game-history');
  if(!docs.length){
    container.innerHTML=`<div style="padding:40px;text-align:center;color:#6A8AA0;font-weight:700;">No games played yet. Start playing! 🎮</div>`;
    return;
  }
  container.innerHTML=docs.map(d=>{
    const data=d.data();
    const sign=data.result==='win'?'+':'-';
    return `<div class="history-item"><span class="history-icon">${data.icon||'🎮'}</span><div class="history-info"><h4>${data.game}</h4><span>${formatDate(data.playedAt)}</span></div><div class="history-result ${data.result}">${data.result.toUpperCase()}</div><div class="history-score">${sign}${Math.abs(data.points)} pts</div></div>`;
  }).join('');
}

// MAIN
onAuthStateChanged(auth,async(user)=>{
  if(!user){window.location.href='index.html';return;}
  try{
    const userSnap=await getDoc(doc(db,'users',user.uid));
    const u=userSnap.exists()?userSnap.data():{};
    const name=u.username||user.displayName||'Player';
    const email=u.email||user.email||'';
    const avatar=u.avatar||'🎮';

    document.getElementById('dash-name').textContent=name;
    document.getElementById('dash-email').textContent=email;
    document.getElementById('dash-avatar').textContent=avatar;
    document.getElementById('dash-header-name').textContent=name;
    document.getElementById('dash-header-avatar').textContent=avatar;
    document.getElementById('ep-nickname').value=name;
    document.getElementById('ep-avatar-preview').textContent=avatar;

    setTimeout(()=>{
      animateCounter(document.getElementById('stat-score'),u.totalScore||0);
      animateCounter(document.getElementById('stat-games'),u.gamesPlayed||0);
      animateCounter(document.getElementById('stat-wins'),u.wins||0);
      animateCounter(document.getElementById('stat-streak'),u.streak||0);
    },400);

    const scoreSnap=await getDoc(doc(db,'scores',user.uid));
    const scores=scoreSnap.exists()?scoreSnap.data():{};
    const levelSnap=await getDoc(doc(db,'levels',user.uid));
    const levels=levelSnap.exists()?levelSnap.data():{};

    renderProgress(scores,levels);

    const weeklySnap=await getDoc(doc(db,'weeklyActivity',user.uid));
    const weekly=weeklySnap.exists()?weeklySnap.data():{};
    const weeklyData=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>weekly[d]||0);

    renderCharts(weeklyData,scores);

    const historyQ=query(collection(db,'gameHistory'),where('userId','==',user.uid),orderBy('playedAt','desc'),limit(5));
    const historySnap=await getDocs(historyQ);
    renderHistory(historySnap.docs);

  }catch(err){console.error('Dashboard load error:',err);}
});

// LOGOUT
document.getElementById('dash-logout').addEventListener('click',async()=>{
  const result=await Swal.fire({title:'Logging out?',text:'See you next time! 👋',icon:'question',showCancelButton:true,confirmButtonText:'Yes, logout',cancelButtonText:'Cancel',confirmButtonColor:'#e53935'});
  if(result.isConfirmed){await signOut(auth);window.location.href='index.html';}
});

// EDIT PROFILE
const overlay=document.getElementById('ep-overlay');

document.getElementById('dash-edit-profile').addEventListener('click',()=>overlay.classList.add('open'));
document.getElementById('ep-close').addEventListener('click',()=>overlay.classList.remove('open'));
overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.classList.remove('open');});

let selectedAvatar='🎮';
document.getElementById('ep-avatar-grid').addEventListener('click',e=>{
  const btn=e.target.closest('.ep-avatar-opt');
  if(!btn)return;
  document.querySelectorAll('.ep-avatar-opt').forEach(b=>b.classList.remove('selected'));
  btn.classList.add('selected');
  selectedAvatar=btn.dataset.emoji;
  document.getElementById('ep-avatar-preview').textContent=selectedAvatar;
});

document.getElementById('ep-save').addEventListener('click',async()=>{
  const user=auth.currentUser;
  if(!user)return;
  const nickname=document.getElementById('ep-nickname').value.trim();
  const msgEl=document.getElementById('ep-msg');
  if(!nickname){msgEl.textContent='Please enter a nickname.';msgEl.className='ep-msg error';return;}
  try{
    await setDoc(doc(db,'users',user.uid),{username:nickname,avatar:selectedAvatar,email:user.email},{merge:true});
    document.getElementById('dash-name').textContent=nickname;
    document.getElementById('dash-avatar').textContent=selectedAvatar;
    document.getElementById('dash-header-name').textContent=nickname;
    document.getElementById('dash-header-avatar').textContent=selectedAvatar;
    msgEl.textContent='✅ Saved!';
    msgEl.className='ep-msg success';
    setTimeout(()=>overlay.classList.remove('open'),1000);
  }catch(err){
    msgEl.textContent='Error saving. Try again.';
    msgEl.className='ep-msg error';
    console.error(err);
  }
});