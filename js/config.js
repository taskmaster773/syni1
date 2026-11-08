/* ============================================================
   SYNI-OS CONFIG — all keys/passwords live here
   ============================================================ */

window.SYNI_CONFIG = {
  buildVersion: '3.0.1',

  versionCheckUrl: 'version.json',        // relative to your site root
  versionCheckOnBoot: true,
  versionCheckInterval: 1000 * 60 * 30,


  // Firebase (chat)
  firebase: {
    apiKey: "AIzaSyDEjaXq6gk68myZGOC8IriIUVebTuyZfhc",
    authDomain: "syni-chat.firebaseapp.com",
    databaseURL: "https://syni-chat-default-rtdb.firebaseio.com",
    projectId: "syni-chat",
    storageBucket: "syni-chat.firebasestorage.app",
    messagingSenderId: "4100647991",
    appId: "1:4100647991:web:39420ff5b7010903c623b2"
  },

  chatOwnerPassword: 'syni7731',

  ciri: {
    groqKey: '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',
    edenKey: 'sk-eden-live-dlw4iNzhNlXtA31bk2Qjg-v9uD8QtCbxf8fx0lxKvhI11cc602c',
    maxAttachments: 4,
    maxImageBytes: 4 * 1024 * 1024
  },

  defaultPanicKey: '`',
  panicUrl: 'https://google.com'
};
