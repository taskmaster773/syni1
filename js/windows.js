/* ============================================================
   Window management
   ============================================================ */

window.toggleApp = function(id){
  var w = document.getElementById('win-' + id);
  if(w){
    if(w.classList.contains('minimized')){
      w.classList.remove('minimized'); w.classList.add('active'); w.style.zIndex = ++highestZ; activeWindowId = id; startImmersiveMode(w);
    } else if(activeWindowId === id){ minimizeWindow(id); }
    else { w.style.zIndex = ++highestZ; activeWindowId = id; startImmersiveMode(w); }
  } else {
    openWindow(id);
  }
};

window.openWindow = function(id){
  var m = document.getElementById('start-menu');
  if(m){ m.classList.remove('open'); setTimeout(function(){ m.style.display='none'; }, 300); }
  var layer = document.getElementById('windows-layer');
  var win = document.getElementById('win-' + id);
  if(!win){
    var dat = APPS[id] || {title:'APP', path:'about:blank'};
    win = document.createElement('div');
    win.id = 'win-' + id;
    win.className = 'window active header-visible';
    win.style.zIndex = ++highestZ;
    var iframeStr = dat.internal ? '<iframe id="frame-' + id + '" allow="pointer-lock"></iframe>' : '<iframe id="frame-' + id + '" src="' + dat.path + '" sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals allow-pointer-lock" allow="pointer-lock"></iframe>';
    win.innerHTML = '<div class="win-header" onmousedown="DragSystem.startWinDrag(event,\'' + id + '\')"><div class="win-title">' + dat.title + '</div><div class="win-controls"><div class="win-btn btn-min" onclick="minimizeWindow(\'' + id + '\')"></div><div class="win-btn btn-close" onclick="closeWindow(\'' + id + '\')"></div></div></div><div class="win-body">' + iframeStr + '</div>';
    layer.appendChild(win);

    var f = document.getElementById('frame-' + id);
    if(f && dat.internal){
      if(id === 'settings') f.srcdoc = getSettingsHTML();
      else if(id === 'files'){
  getPS5EmuHTML().then(function(html){ f.srcdoc = html; });
}
      else if(id === 'term')  f.srcdoc = getSpotifyHTML();
      else if(id === 'proxy') f.srcdoc = getProxyBrowserHTML();
      else if(id === 'shared') f.srcdoc = getSharedDesktopHTML();
      else if(id === 'browser'){
        // Browser app — fetch the HTML file
        fetch('apps/browser.html')
          .then(function(r){ return r.text(); })
          .then(function(html){ f.srcdoc = html; })
          .catch(function(err){
            f.srcdoc = '<!DOCTYPE html><html><body style="background:#000;color:#f55;font-family:sans-serif;padding:40px;">'
                     + '<h2>Could not load apps/browser.html</h2><p>' + err.message + '</p></body></html>';
          });
      }
    }

    var gameApps = ['files','roblox','fortnite','rocketl','xbox','geforce'];
    if(gameApps.includes(id)){
      var winHeader  = win.querySelector('.win-header');
      var gameIframe = document.getElementById('frame-' + id);
      if(winHeader && gameIframe){
        var gameBtn = document.createElement('div');
        gameBtn.className = 'win-btn';
        gameBtn.innerHTML = '🎮';
        gameBtn.style.cssText = 'background:#2b65f6;color:white;width:20px;height:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;margin-right:10px;font-size:11px;';
        gameBtn.title = 'Fullscreen Mode';
        gameBtn.onclick = function(e){ e.stopPropagation(); if(win.requestFullscreen) win.requestFullscreen(); };
        var controls = winHeader.querySelector('.win-controls');
        if(controls) controls.prepend(gameBtn);
        setupGamePointerLock(win, gameIframe, id);
      }
    }
  } else {
    win.classList.remove('minimized'); win.classList.add('active'); win.style.zIndex = ++highestZ;
  }
  activeWindowId = id;
  startImmersiveMode(win);
};

window.closeWindow = function(id){
  var w = document.getElementById('win-' + id);
  var gameApps = ['files','roblox','fortnite','rocketl','xbox','geforce'];
  if(gameApps.includes(id)){
    if(document.exitFullscreen) document.exitFullscreen();
    if(document.exitPointerLock) document.exitPointerLock();
    restoreGameUI();
  }
  if(w) w.remove();
  if(activeWindowId === id) activeWindowId = null;
  endImmersiveMode();
};

window.minimizeWindow = function(id){
  var w = document.getElementById('win-' + id);
  if(w){ w.classList.add('minimized'); w.classList.remove('active'); if(activeWindowId === id) activeWindowId = null; }
  endImmersiveMode();
};

function setupGamePointerLock(win, iframe, gameId){
  win.addEventListener('click', function(e){
    if(e.target.closest('.win-btn')) return;
    if(!document.pointerLockElement){
      iframe.requestPointerLock();
      document.getElementById('dock-container').style.display = 'none';
      document.getElementById('right-sidebar').style.display = 'none';
      document.getElementById('game-mode-indicator').classList.add('show');
    }
  });
  document.addEventListener('pointerlockchange', function(){
    if(!document.pointerLockElement && activeWindowId === gameId){
      document.getElementById('dock-container').style.display = 'flex';
      document.getElementById('right-sidebar').style.display = 'flex';
      document.getElementById('game-mode-indicator').classList.remove('show');
    }
  });
}

window.restoreGameUI = function(){
  var dock = document.getElementById('dock-container'); if(dock) dock.style.display = 'flex';
  var sidebar = document.getElementById('right-sidebar'); if(sidebar) sidebar.style.display = 'flex';
  var ind = document.getElementById('game-mode-indicator'); if(ind) ind.classList.remove('show');
};

window.startImmersiveMode = function(win){
  document.getElementById('dock-container').classList.add('dock-hidden');
  win.classList.remove('header-visible');
};

window.endImmersiveMode = function(){
  var aw = document.querySelectorAll('.window.active:not(.minimized)');
  if(aw.length === 0){
    document.getElementById('dock-container').classList.remove('dock-hidden');
    activeWindowId = null;
  } else {
    var t = aw[aw.length - 1];
    activeWindowId = t.id.replace('win-', '');
    t.style.zIndex = ++highestZ;
    startImmersiveMode(t);
  }
};

// Dock auto-hide
var dockTimer;
var dEl = document.getElementById('dock-container');
document.getElementById('bottom-trigger').addEventListener('mouseenter', function(){ dEl.classList.remove('dock-hidden'); clearTimeout(dockTimer); });
dEl.addEventListener('mouseleave', function(){
  var aw = document.querySelectorAll('.window.active:not(.minimized)');
  if(aw.length > 0) dockTimer = setTimeout(function(){ dEl.classList.add('dock-hidden'); }, 1000);
});
dEl.addEventListener('mouseenter', function(){ clearTimeout(dockTimer); });
document.getElementById('top-trigger').addEventListener('mouseenter', function(){
  if(activeWindowId){
    var w = document.getElementById('win-' + activeWindowId);
    if(w && !w.classList.contains('minimized')) w.classList.add('header-visible');
  }
});
document.addEventListener('mouseover', function(e){
  if(e.target.closest('.win-header')){
    if(activeWindowId){ var w = document.getElementById('win-' + activeWindowId); if(w) w.classList.add('header-visible'); }
  } else if(activeWindowId && !e.target.closest('#top-trigger')){
    var w = document.getElementById('win-' + activeWindowId); if(w) w.classList.remove('header-visible');
  }
});

document.addEventListener('fullscreenchange', function(){
  if(!document.fullscreenElement){ restoreGameUI(); if(document.exitPointerLock) document.exitPointerLock(); }
});
document.addEventListener('pointerlockchange', function(){
  if(!document.pointerLockElement && !document.fullscreenElement) restoreGameUI();
});
document.addEventListener('click', function(e){
  var iframe = e.target.closest('iframe');
  if(iframe && iframe.id && iframe.id.startsWith('frame-')){
    var gameApps = ['files','roblox','fortnite','rocketl','xbox','geforce'];
    var gameId = iframe.id.replace('frame-', '');
    if(gameApps.includes(gameId)){
      iframe.requestPointerLock();
      document.getElementById('dock-container').style.display = 'none';
      document.getElementById('right-sidebar').style.display = 'none';
      document.getElementById('game-mode-indicator').classList.add('show');
    }
  }
});
