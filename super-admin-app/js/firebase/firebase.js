/**
 * firebase.js — Firebase initialization for Admin Panel
 *
 * Uses the same Firebase project config as the main app.
 * Client-side API keys are safe to expose (access controlled by Security Rules).
 */
var FirebaseApp = (function () {
  'use strict';

  var _db = null;
  var _auth = null;
  var _initialized = false;

  var firebaseConfig = {
    apiKey: 'AIzaSyDHTnIhjlyLy6CGOeLHfAIjIX_Bd4kSfco',
    authDomain: 'quant-reflex-trainer.firebaseapp.com',
    projectId: 'quant-reflex-trainer',
    storageBucket: 'quant-reflex-trainer.firebasestorage.app',
    messagingSenderId: '438863369800',
    appId: '1:438863369800:web:eea1aa154fdd6d5d852a7d'
  };

  function init() {
    if (_initialized) return true;
    try {
      if (!firebase.apps || firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
      }
      _db = firebase.firestore();
      _auth = firebase.auth();
      _auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(function (err) {
        console.warn('Auth persistence error:', err);
      });
      _initialized = true;
      return true;
    } catch (e) {
      console.error('Firebase initialization failed:', e);
      return false;
    }
  }

  function getDb() { return _db; }
  function getAuth() { return _auth; }
  function isReady() { return _initialized && _db !== null; }

  return { init: init, getDb: getDb, getAuth: getAuth, isReady: isReady };
})();
