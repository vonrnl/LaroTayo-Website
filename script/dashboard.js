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

  const weeklyEl = document.getElementById('weeklyChart');
  const scoreEl  = document.getElementById('scoreChart');

  if(weeklyEl){
    weeklyChart=new Chart(weeklyEl.getContext('2d'),{
      type:'bar',
      data:{labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],datasets:[{label:'Games Played',data:weeklyData,backgroundColor:'rgba(244,162,52,0.8)',borderColor:'#D4851A',borderWidth:2,borderRadius:8}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{beginAtZero:true,ticks:{stepSize:1,color:'#4A6A8A',font:{family:'Nunito',weight:'700'}},grid:{color:'rgba(0,0,0,0.05)'}},x:{ticks:{color:'#4A6A8A',font:{family:'Nunito',weight:'700'}},grid:{display:false}}}}
    });
  }

  if(scoreEl){
    scoreChart=new Chart(scoreEl.getContext('2d'),{
      type:'doughnut',
      data:{labels:['Patintero','Luksong Baka','Langit Lupa'],datasets:[{data:[scores.pat||0,scores.baka||0,scores.langit||0],backgroundColor:['rgba(244,162,52,0.85)','rgba(43,127,212,0.85)','rgba(76,175,80,0.85)'],borderColor:['#D4851A','#1A5A9A','#2E7D32'],borderWidth:3,hoverOffset:8}]},
      options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{color:'#1A3A5C',font:{family:'Nunito',weight:'700'},padding:16}}}}
    });
  }
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

// SAMPLE DATA (remove once real game data is connected)
const SAMPLE_DATA = {
  totalScore: 4850,
  gamesPlayed: 24,
  wins: 15,
  streak: 7,
};

const SAMPLE_HISTORY = [
  { game: 'Patintero',    icon: '🏃', result: 'win',  points: 320, playedAt: (() => { const d = new Date(); d.setMinutes(d.getMinutes() - 30); return d; })() },
  { game: 'Luksong Baka', icon: '🐄', result: 'win',  points: 280, playedAt: (() => { const d = new Date(); d.setHours(d.getHours() - 2); return d; })() },
  { game: 'Ice Ice Water', icon: '🧊', result: 'loss', points: 120, playedAt: (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d; })() },
  { game: 'Patintero',    icon: '🏃', result: 'win',  points: 350, playedAt: (() => { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(d.getHours() - 3); return d; })() },
  { game: 'Luksong Baka', icon: '🐄', result: 'loss', points: 90,  playedAt: (() => { const d = new Date(); d.setDate(d.getDate() - 2); return d; })() },
  { game: 'Ice Ice Water', icon: '🧊', result: 'win',  points: 310, playedAt: (() => { const d = new Date(); d.setDate(d.getDate() - 2); d.setHours(d.getHours() - 4); return d; })() },
  { game: 'Patintero',    icon: '🏃', result: 'win',  points: 290, playedAt: (() => { const d = new Date(); d.setDate(d.getDate() - 3); return d; })() },
];

function renderSampleHistory(items) {
  const container = document.getElementById('game-history');
  if (!container) return;
  container.innerHTML = items.map(d => {
    const sign = d.result === 'win' ? '+' : '-';
    const time = d.playedAt.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true });
    const dateStr = isToday(d.playedAt) ? `Today, ${time}` : isYesterday(d.playedAt) ? `Yesterday, ${time}` : d.playedAt.toLocaleDateString('en-PH');
    return `<div class="history-item">
      <span class="history-icon">${d.icon}</span>
      <div class="history-info"><h4>${d.game}</h4><span>${dateStr}</span></div>
      <div class="history-result ${d.result}">${d.result.toUpperCase()}</div>
      <div class="history-score">${sign}${Math.abs(d.points)} pts</div>
    </div>`;
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

    // Use sample data until real game data is connected
    const totalScore = u.totalScore || SAMPLE_DATA.totalScore;
    const gamesPlayed = u.gamesPlayed || SAMPLE_DATA.gamesPlayed;
    const wins = u.wins || SAMPLE_DATA.wins;
    const streak = u.streak || SAMPLE_DATA.streak;

    setTimeout(()=>{
      animateCounter(document.getElementById('stat-score'), totalScore);
      animateCounter(document.getElementById('stat-games'), gamesPlayed);
      animateCounter(document.getElementById('stat-wins'), wins);
      animateCounter(document.getElementById('stat-streak'), streak);
    },400);

    const scoreSnap=await getDoc(doc(db,'scores',user.uid));
    const scores=scoreSnap.exists()?scoreSnap.data():{pat:1820,baka:1640,langit:1390};

    const weeklySnap=await getDoc(doc(db,'weeklyActivity',user.uid));
    const weekly=weeklySnap.exists()?weeklySnap.data():{};
    const weeklyData=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>weekly[d]||0);
    // Use sample weekly data if none from DB
    const finalWeekly = weeklyData.some(v=>v>0) ? weeklyData : [2,4,1,5,3,6,3];

    renderCharts(finalWeekly, scores);

    // Try real history first, fall back to sample
    try {
      const historyQ=query(collection(db,'gameHistory'),where('userId','==',user.uid),orderBy('playedAt','desc'),limit(7));
      const historySnap=await getDocs(historyQ);
      if (historySnap.docs.length > 0) {
        renderHistory(historySnap.docs);
      } else {
        renderSampleHistory(SAMPLE_HISTORY);
      }
    } catch {
      renderSampleHistory(SAMPLE_HISTORY);
    }

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