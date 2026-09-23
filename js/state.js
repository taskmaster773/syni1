/* ============================================================
   State — sysConfig, APPS, pins, and globals
   ============================================================ */

window._devBuildVer = SYNI_CONFIG.buildVersion;

// ---- sysConfig ----
var sysConfig = {};
try { var s = localStorage.getItem('cine_sys_config'); if(s) sysConfig = JSON.parse(s); } catch(e){}
if(sysConfig.optBg            === undefined) sysConfig.optBg = false;
if(sysConfig.shortBoot        === undefined) sysConfig.shortBoot = false;
if(sysConfig.wpLoop           === undefined) sysConfig.wpLoop = false;
if(sysConfig.idleLock         === undefined) sysConfig.idleLock = false;
if(sysConfig.redirectConfirm  === undefined) sysConfig.redirectConfirm = false;
if(!sysConfig.panicKey) sysConfig.panicKey = SYNI_CONFIG.defaultPanicKey;
if(!sysConfig.homeWallpaper) sysConfig.homeWallpaper = 'wp1';
if(!sysConfig.lockWallpaper) sysConfig.lockWallpaper = 'wp1';
if(!sysConfig.cloak)         sysConfig.cloak = 'none';
if(sysConfig.muteChatSound    === undefined) sysConfig.muteChatSound = false;

window.sysConfig = sysConfig;
window.updateSysSetting = function(key, value){
  sysConfig[key] = value;
  try { localStorage.setItem('cine_sys_config', JSON.stringify(sysConfig)); } catch(e){}
};

// ---- App registry ----
var APPS = {
  'term':     { title:'Spotify',        internal:true, icon:'https://cdn.pixabay.com/photo/2016/10/22/00/15/spotify-1759471_1280.jpg', pinned:true },
  'files':    { title:'App Store',      internal:true, icon:'https://cdn.jsdelivr.net/gh/taskmaster773/2wafawwfa@main/Screenshot%202026-08-06%20224937.png', pinned:true },
  'settings': { title:'CONFIG',         internal:true, icon:'https://cdn.iconscout.com/icon/free/png-256/free-apple-settings-icon-svg-download-png-493162.png', pinned:true },
  'proxy':    { title:'Proxy Browser',  internal:true, icon:'https://cdn-icons-png.flaticon.com/512/3064/3064197.png', pinned:true },
  'browser':  { title:'Browser',        internal:true, icon:'https://cdn-icons-png.flaticon.com/512/1006/1006771.png', pinned:true },
  'shared':   { title:'Shared Desktop', internal:true, icon:'https://cdn-icons-png.flaticon.com/512/1256/1256650.png', pinned:true }
};
window.APPS = APPS;

// ---- Pins ----
var savedPins = null;
try { savedPins = localStorage.getItem('c_pins_v2'); } catch(e){}
if(savedPins){
  try {
    var p = JSON.parse(savedPins);
    for(var k in p) if(APPS[k]) APPS[k].pinned = p[k];
  } catch(e){}
}
window.syncPins = function(){
  var obj = {};
  for(var k in APPS) obj[k] = APPS[k].pinned;
  try { localStorage.setItem('c_pins_v2', JSON.stringify(obj)); } catch(e){}
};

// ---- Globals ----
window.highestZ        = 500;
window.activeWindowId  = null;
window.isDesktopActive = false;
window.bootActive      = true;
window.isMediaPlaying  = false;
window.welcomeShown    = false;
window.isUnlocking     = false;
window.notepadOpen     = false;
window.wpMenuOpen      = false;
window.activeCtxId     = null;
window.aMedia          = null;
window.nHide           = undefined;

window.isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
