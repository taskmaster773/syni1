/* ============================================================
   Shared Desktop — join a room by code and see each other's
   cursors live on the same desktop (Firebase Realtime DB)
   ============================================================ */

var SD_PATH        = 'shared-desktops';
var SD_SEND_MS     = 60;      // cursor write throttle
var SD_BEAT_MS     = 10000;   // keep-alive write while idle
var SD_STALE_MS    = 30000;   // drop peers that stopped reporting
var SD_ACTION_TTL  = 15000;   // how long a broadcast window action lingers
var SD_CODE_CHARS  = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
var SD_MOUSE_TTL   = 5000;    // how long mouse events linger

var sdState = {
  code: null,
  name: '',
  clientId: null,
  roomRef: null,
  cursorsRef: null,
  myRef: null,
  peers: {},
  lastSent: 0,
  lastX: -1,
  lastY: -1,
  frameHooks: [],
  actionsRef: null,
  applying: false,
  mouseEventsRef: null,
  remoteMouseEnabled: true
};

try {
  var sdSavedName = localStorage.getItem('syni_sd_name');
  if(sdSavedName) sdState.name = sdSavedName;
} catch(e){}

/* ---------- Helpers ---------- */

function sdClientId(){
  if(sdState.clientId) return sdState.clientId;
  var id = null;
  try { id = localStorage.getItem('syni_sd_client'); } catch(e){}
  if(!id){
    id = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    try { localStorage.setItem('syni_sd_client', id); } catch(e){}
  }
  sdState.clientId = id;
  return id;
}

function sdEnsureFirebase(){
  if(typeof firebase === 'undefined') return false;
  try {
    if(!firebase.apps.length) firebase.initializeApp(SYNI_CONFIG.firebase);
    return true;
  } catch(e){
    return false;
  }
}

function sdMakeCode(){
  var out = '';
  for(var i = 0; i < 6; i++){
    out += SD_CODE_CHARS.charAt(Math.floor(Math.random() * SD_CODE_CHARS.length));
  }
  return out;
}

function sdNormalizeCode(code){
  return String(code || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function sdColorFor(id){
  var h = 0;
  for(var i = 0; i < id.length; i++){ h = (h * 31 + id.charCodeAt(i)) | 0; }
  return 'hsl(' + (Math.abs(h) % 360) + ', 85%, 60%)';
}

function sdNotify(title, body){
  if(typeof showNotification === 'function') showNotification(title, body || '');
}

/* ---------- UI bridge (the app window registers a callback) ---------- */

window.sdOnState = null;

function sdPushState(){
  var members = [];
  for(var id in sdState.peers){
    members.push({ id: id, name: sdState.peers[id].name, color: sdColorFor(id) });
  }
  if(sdState.code){
    members.unshift({ id: sdClientId(), name: sdState.name + ' (you)', color: sdColorFor(sdClientId()) });
  }
  var snapshot = {
    connected: !!sdState.code,
    code: sdState.code,
    name: sdState.name,
    members: members
  };
  if(typeof window.sdOnState === 'function'){
    try { window.sdOnState(snapshot); } catch(e){}
  }
  return snapshot;
}

window.sdGetState = sdPushState;

/* ---------- Cursor layer ---------- */

function sdLayer(){
  var layer = document.getElementById('shared-cursor-layer');
  if(!layer){
    layer = document.createElement('div');
    layer.id = 'shared-cursor-layer';
    document.body.appendChild(layer);
  }
  return layer;
}

function sdCursorEl(id){
  var peer = sdState.peers[id];
  if(!peer) return null;
  if(peer.el) return peer.el;
  var el = document.createElement('div');
  el.className = 'sd-cursor';
  el.style.setProperty('--sd-color', sdColorFor(id));
  el.innerHTML =
    '<svg viewBox="0 0 24 24" class="sd-cursor-arrow"><path d="M5 2l14 9-6.5 1.2L15 20l-3 1.2-2.6-7.2L5 18z"/></svg>' +
    '<div class="sd-cursor-name"></div>';
  peer.el = el;
  sdLayer().appendChild(el);
  return el;
}

function sdDrawPeer(id){
  var peer = sdState.peers[id];
  if(!peer) return;
  var el = sdCursorEl(id);
  if(!el) return;
  el.querySelector('.sd-cursor-name').textContent = peer.name;
  el.style.transform = 'translate(' +
    Math.round(peer.x * window.innerWidth) + 'px,' +
    Math.round(peer.y * window.innerHeight) + 'px)';
}

function sdRemovePeer(id){
  var peer = sdState.peers[id];
  if(peer && peer.el && peer.el.parentNode) peer.el.parentNode.removeChild(peer.el);
  delete sdState.peers[id];
  sdPushState();
}

function sdClearPeers(){
  for(var id in sdState.peers) sdRemovePeer(id);
  var layer = document.getElementById('shared-cursor-layer');
  if(layer) layer.innerHTML = '';
}

/* ---------- Sending my cursor ---------- */

function sdSend(x, y){
  if(!sdState.myRef) return;
  var now = Date.now();
  if(now - sdState.lastSent < SD_SEND_MS) return;
  if(x === sdState.lastX && y === sdState.lastY) return;
  sdState.lastSent = now;
  sdState.lastX = x;
  sdState.lastY = y;
  sdState.myRef.set({ name: sdState.name, x: x, y: y, t: now });
}

/* ---------- Mouse event broadcasting ---------- */

function sdBroadcastMouseEvent(type, data){
  if(!sdState.mouseEventsRef || sdState.applying) return;
  var ref = sdState.mouseEventsRef.push();
  var eventData = {
    by: sdClientId(),
    name: sdState.name,
    type: type,
    data: data,
    t: Date.now()
  };
  ref.set(eventData);
  ref.onDisconnect().remove();
  setTimeout(function(){ ref.remove(); }, SD_MOUSE_TTL);
}

function sdApplyMouseEvent(snap){
  var event = snap.val() || {};
  if(event.by === sdClientId()) return;
  if(!sdState.remoteMouseEnabled) return;
  
  sdState.applying = true;
  try {
    var data = event.data || {};
    var x = data.x !== undefined ? data.x * window.innerWidth : window.innerWidth / 2;
    var y = data.y !== undefined ? data.y * window.innerHeight : window.innerHeight / 2;
    
    if(event.type === 'click'){
      sdSimulateClick(x, y, data.button || 0);
    } else if(event.type === 'scroll'){
      // For scroll, we need to find the scrollable element
      var scrollElement = document.elementFromPoint(x, y);
      if(scrollElement){
        // Try to scroll the element directly
        if(scrollElement.scrollTop !== undefined || scrollElement.scrollLeft !== undefined){
          scrollElement.scrollTop -= data.deltaY || 0;
          scrollElement.scrollLeft -= data.deltaX || 0;
        }
        // Also dispatch the wheel event for compatibility
        sdSimulateScroll(x, y, data.deltaX || 0, data.deltaY || 0);
      }
    } else if(event.type === 'dblclick'){
      sdSimulateClick(x, y, 0, true);
    }
  } catch(e){}
  sdState.applying = false;
}

function sdSimulateClick(x, y, button, isDoubleClick){
  var element = document.elementFromPoint(x, y);
  if(!element) return;
  
  var clickEvent = new MouseEvent(isDoubleClick ? 'dblclick' : 'click', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button: button
  });
  
  element.dispatchEvent(clickEvent);
}

function sdSimulateScroll(x, y, deltaX, deltaY){
  var element = document.elementFromPoint(x, y);
  if(!element) return;
  
  // First try to find a scrollable parent
  var scrollableElement = element;
  while(scrollableElement && scrollableElement !== document.body){
    var overflowY = window.getComputedStyle(scrollableElement).overflowY;
    var overflowX = window.getComputedStyle(scrollableElement).overflowX;
    if((overflowY === 'auto' || overflowY === 'scroll') || (overflowX === 'auto' || overflowX === 'scroll')){
      break;
    }
    scrollableElement = scrollableElement.parentElement;
  }
  
  // If no scrollable parent found, use the original element
  if(!scrollableElement || scrollableElement === document.body){
    scrollableElement = element;
  }
  
  // Direct scrolling for better control
  if(scrollableElement.scrollTop !== undefined){
    scrollableElement.scrollTop -= deltaY;
  }
  if(scrollableElement.scrollLeft !== undefined){
    scrollableElement.scrollLeft -= deltaX;
  }
  
  // Also dispatch wheel event for compatibility
  var scrollEvent = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    deltaX: deltaX,
    deltaY: deltaY,
    deltaMode: 0
  });
  
  element.dispatchEvent(scrollEvent);
}

/* Idle users must keep reporting or the stale sweep drops them. */
setInterval(function(){
  if(!sdState.myRef) return;
  if(Date.now() - sdState.lastSent < SD_BEAT_MS) return;
  sdState.lastSent = Date.now();
  sdState.myRef.update({ name: sdState.name, t: sdState.lastSent });
}, SD_BEAT_MS);

function sdTrackMove(e){
  if(!sdState.code) return;
  sdSend(e.clientX / window.innerWidth, e.clientY / window.innerHeight);
}

function sdTrackClick(e){
  if(!sdState.code) return;
  sdBroadcastMouseEvent('click', {
    x: e.clientX / window.innerWidth,
    y: e.clientY / window.innerHeight,
    button: e.button
  });
}

function sdTrackScroll(e){
  if(!sdState.code) return;
  sdBroadcastMouseEvent('scroll', {
    x: e.clientX / window.innerWidth,
    y: e.clientY / window.innerHeight,
    deltaX: e.deltaX,
    deltaY: e.deltaY
  });
}

function sdTrackDblClick(e){
  if(!sdState.code) return;
  sdBroadcastMouseEvent('dblclick', {
    x: e.clientX / window.innerWidth,
    y: e.clientY / window.innerHeight
  });
}

document.addEventListener('mousemove', sdTrackMove);
document.addEventListener('click', sdTrackClick);
document.addEventListener('wheel', sdTrackScroll);
document.addEventListener('dblclick', sdTrackDblClick);

/* Same-origin app windows (srcdoc iframes) swallow the parent's mousemove,
   so mirror their movement into desktop coordinates. */
function sdHookFrames(){
  if(!sdState.code) return;
  var frames = document.querySelectorAll('iframe[id^="frame-"]');
  for(var i = 0; i < frames.length; i++){
    var frame = frames[i];
    if(frame.dataset.sdHooked) continue;
    var doc = null;
    try { doc = frame.contentDocument; } catch(e){ doc = null; }
    if(!doc) continue;
    frame.dataset.sdHooked = '1';
    (function(f, d){
      var moveHandler = function(ev){
        if(!sdState.code) return;
        var rect = f.getBoundingClientRect();
        sdSend((rect.left + ev.clientX) / window.innerWidth,
               (rect.top + ev.clientY) / window.innerHeight);
      };
      
      var clickHandler = function(ev){
        if(!sdState.code) return;
        var rect = f.getBoundingClientRect();
        sdBroadcastMouseEvent('click', {
          x: (rect.left + ev.clientX) / window.innerWidth,
          y: (rect.top + ev.clientY) / window.innerHeight,
          button: ev.button
        });
      };
      
      var scrollHandler = function(ev){
        if(!sdState.code) return;
        var rect = f.getBoundingClientRect();
        sdBroadcastMouseEvent('scroll', {
          x: (rect.left + ev.clientX) / window.innerWidth,
          y: (rect.top + ev.clientY) / window.innerHeight,
          deltaX: ev.deltaX,
          deltaY: ev.deltaY
        });
      };
      
      d.addEventListener('mousemove', moveHandler);
      d.addEventListener('click', clickHandler);
      d.addEventListener('wheel', scrollHandler);
      sdState.frameHooks.push({ doc: d, handler: moveHandler });
      sdState.frameHooks.push({ doc: d, handler: clickHandler });
      sdState.frameHooks.push({ doc: d, handler: scrollHandler });
    })(frame, doc);
  }
}

setInterval(sdHookFrames, 2000);

function sdUnhookFrames(){
  sdState.frameHooks.forEach(function(h){
    try { h.doc.removeEventListener('mousemove', h.handler); } catch(e){}
    try { h.doc.removeEventListener('click', h.handler); } catch(e){}
    try { h.doc.removeEventListener('wheel', h.handler); } catch(e){}
  });
  sdState.frameHooks = [];
  var frames = document.querySelectorAll('iframe[id^="frame-"]');
  for(var i = 0; i < frames.length; i++) delete frames[i].dataset.sdHooked;
}

/* Drop peers whose tab died without firing onDisconnect */
setInterval(function(){
  if(!sdState.code) return;
  var now = Date.now();
  for(var id in sdState.peers){
    if(now - (sdState.peers[id].t || 0) > SD_STALE_MS) sdRemovePeer(id);
  }
}, 5000);

window.addEventListener('resize', function(){
  for(var id in sdState.peers) sdDrawPeer(id);
});

/* ---------- Mirrored window actions ---------- */

var sdWindow = {
  open:     window.openWindow,
  close:    window.closeWindow,
  minimize: window.minimizeWindow
};

var sdNoti = {
  show:     window.showNotification,
  toggle:   window.toggleNoti,
  add:      window.addNoti
};

function sdBroadcast(type, app){
  if(!sdState.actionsRef || sdState.applying) return;
  var ref = sdState.actionsRef.push();
  ref.set({ by: sdClientId(), name: sdState.name, type: type, app: app, t: Date.now() });
  ref.onDisconnect().remove();
  setTimeout(function(){ ref.remove(); }, SD_ACTION_TTL);
}

function sdApplyAction(snap){
  var a = snap.val() || {};
  if(a.by === sdClientId()) return;
  
  sdState.applying = true;
  try {
    if(a.type === 'notification' && a.app && typeof a.app === 'object'){
      if(a.app.type === 'show' && a.app.title !== undefined){
        sdNoti.show(a.app.title, a.app.msg || '');
      } else if(a.app.type === 'toggle'){
        sdNoti.toggle();
      } else if(a.app.type === 'add' && a.app.title !== undefined){
        sdNoti.add(a.app.title, a.app.msg || '');
      }
    } else {
      var run = sdWindow[a.type];
      if(run && a.app) run(a.app);
    }
  } catch(e){}
  sdState.applying = false;
}

/* Window functions that get broadcast to other users */
window.openWindow = function(id){
  if(!sdState.applying) sdBroadcast('open', id);
  sdWindow.open(id);
};

window.closeWindow = function(id){
  if(!sdState.applying) sdBroadcast('close', id);
  sdWindow.close(id);
};

window.minimizeWindow = function(id){
  if(!sdState.applying) sdBroadcast('minimize', id);
  sdWindow.minimize(id);
};

/* Notification functions that get broadcast to other users */
window.showNotification = function(title, msg){
  if(!sdState.applying) sdBroadcast('notification', { type: 'show', title: title, msg: msg });
  sdNoti.show(title, msg);
};

window.toggleNoti = function(){
  if(!sdState.applying) sdBroadcast('notification', { type: 'toggle' });
  sdNoti.toggle();
};

window.addNoti = function(title, msg){
  if(!sdState.applying) sdBroadcast('notification', { type: 'add', title: title, msg: msg });
  sdNoti.add(title, msg);
};

/* ---------- Join / leave ---------- */

function sdAttach(code){
  var me = sdClientId();
  sdState.code       = code;
  sdState.roomRef    = firebase.database().ref(SD_PATH + '/' + code);
  sdState.cursorsRef = sdState.roomRef.child('cursors');
  sdState.myRef      = sdState.cursorsRef.child(me);

  sdState.myRef.onDisconnect().remove();
  sdState.myRef.set({ name: sdState.name, x: 0.5, y: 0.5, t: Date.now() });

  sdState.actionsRef = sdState.roomRef.child('actions');
  sdState.actionsRef.orderByChild('t').startAt(Date.now()).on('child_added', sdApplyAction);

  sdState.mouseEventsRef = sdState.roomRef.child('mouseEvents');
  sdState.mouseEventsRef.orderByChild('t').startAt(Date.now()).on('child_added', sdApplyMouseEvent);

  sdState.cursorsRef.on('child_added', sdPeerUpdate);
  sdState.cursorsRef.on('child_changed', sdPeerUpdate);
  sdState.cursorsRef.on('child_removed', function(snap){
    if(snap.key !== me) sdRemovePeer(snap.key);
  });

  document.body.classList.add('sd-active');
  sdPushState();
}

function sdPeerUpdate(snap){
  if(snap.key === sdClientId()) return;
  var val = snap.val() || {};
  var peer = sdState.peers[snap.key];
  var isNew = !peer;
  if(isNew){
    peer = sdState.peers[snap.key] = { el: null };
  }
  peer.name = val.name || 'Guest';
  peer.x    = typeof val.x === 'number' ? val.x : 0.5;
  peer.y    = typeof val.y === 'number' ? val.y : 0.5;
  peer.t    = val.t || Date.now();
  sdDrawPeer(snap.key);
  if(isNew){
    sdNotify('🖱️ ' + peer.name + ' joined', 'Shared desktop ' + sdState.code);
    sdPushState();
  }
}

window.sdCreateRoom = function(name){
  if(!sdEnsureFirebase()){ sdNotify('⚠️ Not connected', 'Firebase is unavailable.'); return; }
  if(sdState.code) sdLeaveRoom();
  sdSetName(name);

  var code = sdMakeCode();
  var ref  = firebase.database().ref(SD_PATH + '/' + code);
  ref.once('value').then(function(snap){
    if(snap.exists()) return window.sdCreateRoom(name);   // collision — reroll
    return ref.child('meta').set({
      createdBy: sdState.name,
      createdAt: Date.now()
    }).then(function(){
      sdAttach(code);
      sdNotify('🖥️ Room created', 'Share the code ' + code);
    });
  }).catch(function(err){
    sdNotify('❌ Could not create room', err.message);
  });
};

window.sdJoinRoom = function(code, name){
  if(!sdEnsureFirebase()){ sdNotify('⚠️ Not connected', 'Firebase is unavailable.'); return; }
  code = sdNormalizeCode(code);
  if(code.length !== 6){ sdNotify('⚠️ Invalid code', 'Room codes are 6 characters.'); return; }
  if(sdState.code === code) return;
  if(sdState.code) sdLeaveRoom();
  sdSetName(name);

  firebase.database().ref(SD_PATH + '/' + code).once('value').then(function(snap){
    if(!snap.exists()){
      sdNotify('❌ No such room', 'Check the code and try again.');
      sdPushState();
      return;
    }
    sdAttach(code);
    sdNotify('🖥️ Joined shared desktop', 'Room ' + code);
  }).catch(function(err){
    sdNotify('❌ Could not join', err.message);
  });
};

window.sdLeaveRoom = function(){
  if(sdState.cursorsRef) sdState.cursorsRef.off();
  if(sdState.actionsRef) sdState.actionsRef.off();
  if(sdState.mouseEventsRef) sdState.mouseEventsRef.off();
  if(sdState.myRef){
    sdState.myRef.onDisconnect().cancel();
    sdState.myRef.remove();
  }
  sdClearPeers();
  sdUnhookFrames();
  sdState.code = null;
  sdState.roomRef = null;
  sdState.cursorsRef = null;
  sdState.actionsRef = null;
  sdState.mouseEventsRef = null;
  sdState.myRef = null;
  document.body.classList.remove('sd-active');
  sdPushState();
};

function sdSetName(name){
  name = String(name || '').trim().slice(0, 18);
  if(!name) name = (typeof chatNickname === 'string' && chatNickname) ? chatNickname : 'Guest';
  sdState.name = name;
  try { localStorage.setItem('syni_sd_name', name); } catch(e){}
  if(sdState.myRef) sdState.myRef.child('name').set(name);
}
window.sdSetName = sdSetName;

window.addEventListener('beforeunload', function(){
  if(sdState.myRef) sdState.myRef.remove();
});

/* ---------- App window ---------- */

function getSharedDesktopHTML(){
  return `<!DOCTYPE html>
<html><head>
<link href="https://fonts.googleapis.com/css2?family=Orbitron:wght@900&family=Rajdhani:wght@400;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
<style>
body{background:#000;color:#fff;font-family:'Rajdhani',sans-serif;padding:25px;margin:0;outline:none;}
*{outline:none;-webkit-tap-highlight-color:transparent;box-sizing:border-box;}
h2{border-bottom:2px solid #333;padding-bottom:10px;font-weight:700;letter-spacing:1px;margin-top:0;}
.sd-card{background:#111;border:1px solid #333;padding:15px;border-radius:10px;margin-bottom:12px;transition:all .2s;}
.sd-card:hover{border-color:#555;}
.sd-card b{display:block;color:#fff;font-size:15px;}
.sd-card small{color:#888;font-size:13px;}
.sd-row{display:flex;gap:10px;align-items:center;margin-top:12px;}
input[type=text]{background:#222;color:#fff;border:1px solid #444;padding:8px 10px;border-radius:6px;font-family:'Rajdhani',sans-serif;font-size:14px;flex:1;min-width:0;}
input[type=text]:focus{border-color:#777;}
#sd-code-input{font-family:'Orbitron',sans-serif;letter-spacing:3px;text-transform:uppercase;}
.btn-go{background:#ff4444;color:#fff;border:none;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:bold;font-family:'Rajdhani',sans-serif;transition:.2s;white-space:nowrap;}
.btn-go:hover{background:#fff;color:#000;transform:scale(1.05);}
.btn-ghost{background:#222;border:1px solid #444;color:#ddd;}
.btn-ghost:hover{background:#fff;color:#000;}
.sd-code{font-family:'Orbitron',sans-serif;font-size:28px;letter-spacing:6px;color:#fff;margin:6px 0 2px;}
.sd-live{display:flex;align-items:center;gap:8px;color:#4caf50;font-size:13px;font-weight:600;}
.sd-dot{width:8px;height:8px;border-radius:50%;background:#4caf50;animation:sdpulse 1.4s infinite;}
@keyframes sdpulse{0%,100%{opacity:1;}50%{opacity:.25;}}
.sd-people{list-style:none;padding:0;margin:10px 0 0;}
.sd-people li{display:flex;align-items:center;gap:10px;padding:7px 0;border-top:1px solid #222;font-size:14px;}
.sd-swatch{width:10px;height:10px;border-radius:50%;flex:none;}
.warning-text{color:#ff8888;font-size:11px;margin-top:8px;}
</style></head><body>
<h2>SHARED DESKTOP</h2>

<div id="sd-disconnected">
  <div class="sd-card">
    <b><i class="fas fa-user" style="color:#ff4444;"></i> YOUR NAME</b>
    <small>Shown above your cursor on the shared desktop</small>
    <div class="sd-row"><input type="text" id="sd-name-input" maxlength="18" placeholder="Name"></div>
  </div>

  <div class="sd-card">
    <b><i class="fas fa-plus" style="color:#ff4444;"></i> CREATE A ROOM</b>
    <small>Generates a code — send it to whoever should join you</small>
    <div class="sd-row"><button class="btn-go" onclick="sdCreate()">Create room</button></div>
  </div>

  <div class="sd-card">
    <b><i class="fas fa-key" style="color:#ff4444;"></i> JOIN WITH A CODE</b>
    <small>Enter the 6-character code you were given</small>
    <div class="sd-row">
      <input type="text" id="sd-code-input" maxlength="6" placeholder="ABC123">
      <button class="btn-go" onclick="sdJoin()">Join</button>
    </div>
    <div class="warning-text">Anyone with the code can see your cursor.</div>
  </div>
</div>

<div id="sd-connected" style="display:none;">
  <div class="sd-card">
    <div class="sd-live"><span class="sd-dot"></span> CONNECTED</div>
    <div class="sd-code" id="sd-room-code">------</div>
    <small>Share this code so others land on your desktop</small>
    <div class="warning-text" style="color:#888;">Apps you open, close or minimize do the same on their desktop. Clicks and scrolling are also shared.</div>
    <div class="sd-row">
      <button class="btn-go btn-ghost" onclick="sdCopy()"><i class="fas fa-copy"></i> Copy code</button>
      <button class="btn-go btn-ghost" onclick="sdToggleRemoteMouse()"><i class="fas fa-mouse"></i> Remote Mouse: <span id="remote-mouse-status">ON</span></button>
      <button class="btn-go" onclick="window.parent.sdLeaveRoom()">Leave</button>
    </div>
  </div>

  <div class="sd-card">
    <b><i class="fas fa-users" style="color:#ff4444;"></i> ON THIS DESKTOP</b>
    <ul class="sd-people" id="sd-people"></ul>
  </div>
</div>

<script>
var P = window.parent;

function sdCreate(){ P.sdCreateRoom(document.getElementById('sd-name-input').value); }
function sdJoin(){
  P.sdJoinRoom(document.getElementById('sd-code-input').value,
               document.getElementById('sd-name-input').value);
}
function sdCopy(){
  var code = document.getElementById('sd-room-code').textContent;
  if(navigator.clipboard) navigator.clipboard.writeText(code);
}

function sdToggleRemoteMouse(){
  P.sdState.remoteMouseEnabled = !P.sdState.remoteMouseEnabled;
  document.getElementById('remote-mouse-status').textContent = P.sdState.remoteMouseEnabled ? 'ON' : 'OFF';
}

function sdRender(state){
  document.getElementById('sd-disconnected').style.display = state.connected ? 'none' : 'block';
  document.getElementById('sd-connected').style.display    = state.connected ? 'block' : 'none';
  var nameInput = document.getElementById('sd-name-input');
  if(document.activeElement !== nameInput) nameInput.value = state.name || '';
  if(!state.connected) return;
  document.getElementById('sd-room-code').textContent = state.code;
  document.getElementById('remote-mouse-status').textContent = P.sdState.remoteMouseEnabled ? 'ON' : 'OFF';
  document.getElementById('sd-people').innerHTML = state.members.map(function(m){
    return '<li><span class="sd-swatch" style="background:' + m.color + '"></span>' + m.name + '</li>';
  }).join('');
}

document.getElementById('sd-code-input').addEventListener('keydown', function(e){
  if(e.key === 'Enter') sdJoin();
});
document.getElementById('sd-name-input').addEventListener('change', function(){
  P.sdSetName(this.value);
});

P.sdOnState = sdRender;
sdRender(P.sdGetState());
<\/script>
</body></html>`;
}

window.getSharedDesktopHTML = getSharedDesktopHTML;
