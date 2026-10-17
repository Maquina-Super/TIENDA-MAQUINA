/* Simulador mínimo de Firebase v10 "compat" (Firestore + Auth) para pruebas sin red.
   Estado persistido en localStorage["__fbstub"] para compartirlo entre páginas del mismo origen.
   Registro de escrituras en localStorage["__fbstub_log"]. */
(function () {
  const KEY = '__fbstub', LOGKEY = '__fbstub_log';
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || { docs: {}, users: {}, session: null }; } catch (e) { return { docs: {}, users: {}, session: null }; } };
  let S = load();
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
  const logw = (op, path, data) => {
    let l = []; try { l = JSON.parse(localStorage.getItem(LOGKEY)) || []; } catch (e) {}
    l.push({ op, path, data, t: Date.now() }); localStorage.setItem(LOGKEY, JSON.stringify(l));
  };
  const listeners = new Set();
  const notify = () => listeners.forEach((f) => { try { f(); } catch (e) { console.error(e); } });
  // Permite a los tests simular fallos / latencia
  const cfg = () => window.__FBCFG || {};
  const delay = () => new Promise((r) => setTimeout(r, cfg().latency || 0));
  const fail = (op, path) => {
    const c = cfg();
    if (c.failWrites && (op !== 'get')) { const e = new Error('simulated ' + c.failWrites); e.code = c.failWrites; throw e; }
  };

  const FV = (k, v) => ({ __fv: k, v });
  const Timestamp = {
    now: () => TS(Date.now()), fromDate: (d) => TS(d.getTime()), fromMillis: (m) => TS(m),
  };
  function TS(ms) { return { __ts: ms, seconds: Math.floor(ms / 1000), nanoseconds: 0, toDate() { return new Date(ms); }, toMillis() { return ms; } }; }
  const rehydrate = (v) => {
    if (v && typeof v === 'object') {
      if (v.__ts !== undefined) return TS(v.__ts);
      if (Array.isArray(v)) return v.map(rehydrate);
      const o = {}; for (const k in v) o[k] = rehydrate(v[k]); return o;
    }
    return v;
  };
  const clone = (v) => rehydrate(JSON.parse(JSON.stringify(v, (k, x) => (x && x.__ts !== undefined ? { __ts: x.__ts } : x))));

  function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
  function setPath(o, p, val, del) {
    const ks = p.split('.'); let c = o;
    for (let i = 0; i < ks.length - 1; i++) { if (typeof c[ks[i]] !== 'object' || c[ks[i]] === null) c[ks[i]] = {}; c = c[ks[i]]; }
    if (del) delete c[ks[ks.length - 1]]; else c[ks[ks.length - 1]] = val;
  }
  function applyVal(cur, v) {
    if (v && v.__fv) {
      switch (v.__fv) {
        case 'inc': return (typeof cur === 'number' ? cur : 0) + v.v;
        case 'union': { const a = Array.isArray(cur) ? cur.slice() : []; v.v.forEach((x) => { if (!a.some((y) => JSON.stringify(y) === JSON.stringify(x))) a.push(x); }); return a; }
        case 'remove': { const a = Array.isArray(cur) ? cur : []; return a.filter((y) => !v.v.some((x) => JSON.stringify(x) === JSON.stringify(y))); }
        case 'ts': return TS(Date.now());
        case 'del': return undefined;
      }
    }
    return v;
  }
  function applyWrite(base, data, merge) {
    const out = merge ? clone(base || {}) : {};
    for (const k in data) {
      const v = data[k];
      if (v && v.__fv === 'del') setPath(out, k, undefined, true);
      else if (merge === 'update') setPath(out, k, applyVal(getPath(out, k), v));
      else if (v && typeof v === 'object' && !v.__fv && !v.__ts && !Array.isArray(v) && merge) {
        out[k] = applyWrite(out[k], v, 'update');
      } else out[k] = applyVal(out[k], v);
    }
    return out;
  }

  let autoId = 0;
  const newId = () => { const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (let i = 0; i < 20; i++) s += c[Math.floor(Math.random() * c.length)]; return s; };

  function DocSnap(path, id) {
    const raw = S.docs[path];
    return {
      id, ref: DocRef(path), get exists() { return raw !== undefined; },
      data: () => (raw === undefined ? undefined : clone(raw)),
      get: (f) => (raw === undefined ? undefined : getPath(clone(raw), f)),
    };
  }
  function DocRef(path) {
    const id = path.split('/').pop();
    const ref = {
      id, path,
      get parent() { return CollRef(path.split('/').slice(0, -1).join('/')); },
      collection: (n) => CollRef(path + '/' + n),
      async get() { await delay(); return DocSnap(path, id); },
      async set(data, opts) { await delay(); fail('set', path); S = load(); S.docs[path] = applyWrite(S.docs[path], data, opts && opts.merge ? 'merge' : false); save(); logw('set', path, clone(data)); notify(); },
      async update(data) { await delay(); fail('update', path); S = load(); if (S.docs[path] === undefined) { const e = new Error('No document to update'); e.code = 'not-found'; throw e; } S.docs[path] = applyWrite(S.docs[path], data, 'update'); save(); logw('update', path, clone(data)); notify(); },
      async delete() { await delay(); fail('delete', path); S = load(); delete S.docs[path]; save(); logw('delete', path); notify(); },
      onSnapshot(cb) { const f = () => { S = load(); cb(DocSnap(path, id)); }; listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); },
    };
    return ref;
  }
  function CollRef(path, q) {
    q = q || { where: [], order: [], lim: null };
    const run = () => {
      S = load();
      const pre = path + '/'; let rows = [];
      for (const p in S.docs) if (p.startsWith(pre) && !p.slice(pre.length).includes('/')) rows.push(p);
      let docs = rows.map((p) => ({ p, d: S.docs[p] }));
      q.where.forEach(([f, op, v]) => { docs = docs.filter(({ d }) => { const x = getPath(d, f); return op === '==' ? x === v : op === '!=' ? x !== v : op === 'in' ? v.includes(x) : op === 'array-contains' ? Array.isArray(x) && x.includes(v) : op === '>=' ? x >= v : op === '<=' ? x <= v : op === '>' ? x > v : op === '<' ? x < v : true; }); });
      q.order.forEach(([f, dir]) => docs.sort((a, b) => { let x = getPath(a.d, f), y = getPath(b.d, f); x = x && x.__ts !== undefined ? x.__ts : x; y = y && y.__ts !== undefined ? y.__ts : y; return (x > y ? 1 : x < y ? -1 : 0) * (dir === 'desc' ? -1 : 1); }));
      if (q.lim) docs = docs.slice(0, q.lim);
      const snaps = docs.map(({ p }) => DocSnap(p, p.split('/').pop()));
      return { docs: snaps, size: snaps.length, empty: snaps.length === 0, forEach: (fn) => snaps.forEach(fn), docChanges: () => snaps.map((s) => ({ type: 'added', doc: s })) };
    };
    const chain = (patch) => CollRef(path, Object.assign({}, q, patch));
    return {
      id: path.split('/').pop(), path,
      doc: (id) => DocRef(path + '/' + (id || newId())),
      async add(data) { await delay(); fail('add', path); const id = newId(); S = load(); S.docs[path + '/' + id] = applyWrite(undefined, data, false); save(); logw('add', path + '/' + id, clone(data)); notify(); return DocRef(path + '/' + id); },
      where: (f, op, v) => chain({ where: q.where.concat([[f, op, v]]) }),
      orderBy: (f, dir) => chain({ order: q.order.concat([[f, dir || 'asc']]) }),
      limit: (n) => chain({ lim: n }),
      async get() { await delay(); return run(); },
      onSnapshot(cb) { const f = () => cb(run()); listeners.add(f); setTimeout(f, 0); return () => listeners.delete(f); },
    };
  }

  const db = {
    collection: (n) => CollRef(n),
    doc: (p) => DocRef(p),
    async runTransaction(fn) {
      await delay(); S = load();
      const writes = [];
      const tx = {
        async get(ref) { S = load(); return DocSnap(ref.path, ref.id); },
        set(ref, data, opts) { writes.push(['set', ref, data, opts]); return tx; },
        update(ref, data) { writes.push(['update', ref, data]); return tx; },
        delete(ref) { writes.push(['delete', ref]); return tx; },
      };
      const res = await fn(tx);
      fail('set', 'tx');
      S = load();
      for (const [op, ref, data, opts] of writes) {
        if (op === 'set') { S.docs[ref.path] = applyWrite(S.docs[ref.path], data, opts && opts.merge ? 'merge' : false); logw('tx.set', ref.path, clone(data)); }
        else if (op === 'update') { if (S.docs[ref.path] === undefined) { const e = new Error('not-found'); e.code = 'not-found'; throw e; } S.docs[ref.path] = applyWrite(S.docs[ref.path], data, 'update'); logw('tx.update', ref.path, clone(data)); }
        else { delete S.docs[ref.path]; logw('tx.delete', ref.path); }
      }
      save(); notify(); return res;
    },
    batch() {
      const ops = [];
      const b = {
        set(ref, data, opts) { ops.push(['set', ref, data, opts]); return b; },
        update(ref, data) { ops.push(['update', ref, data]); return b; },
        delete(ref) { ops.push(['delete', ref]); return b; },
        async commit() { for (const [op, ref, data, opts] of ops) { if (op === 'set') await ref.set(data, opts); else if (op === 'update') await ref.update(data); else await ref.delete(); } },
      };
      return b;
    },
    settings() {}, enablePersistence: async () => {},
  };

  /* ---------- Auth ---------- */
  const authCbs = new Set();
  const mkUser = (u) => u && ({ uid: u.uid, email: u.email, displayName: u.displayName || null, phoneNumber: u.phone || null, emailVerified: true,
    async updateProfile(p) { Object.assign(S.users[u.email], p); save(); }, async updatePassword() {}, async reauthenticateWithCredential() {}, async delete() {}, async getIdToken() { return 'tok'; } });
  const auth = {
    get currentUser() { S = load(); return S.session ? mkUser(S.users[S.session]) : null; },
    onAuthStateChanged(cb) { authCbs.add(cb); setTimeout(() => cb(auth.currentUser), 0); return () => authCbs.delete(cb); },
    async signInWithEmailAndPassword(email, pass) {
      S = load(); const u = S.users[email.toLowerCase()];
      if (!u) { const e = new Error('user-not-found'); e.code = 'auth/user-not-found'; throw e; }
      if (u.pass !== pass) { const e = new Error('wrong-password'); e.code = 'auth/wrong-password'; throw e; }
      S.session = email.toLowerCase(); save(); const cu = auth.currentUser; authCbs.forEach((f) => f(cu)); return { user: cu };
    },
    async createUserWithEmailAndPassword(email, pass) {
      S = load(); email = email.toLowerCase();
      if (S.users[email]) { const e = new Error('exists'); e.code = 'auth/email-already-in-use'; throw e; }
      S.users[email] = { uid: 'uid_' + newId().slice(0, 8), email, pass }; S.session = email; save();
      const cu = auth.currentUser; authCbs.forEach((f) => f(cu)); return { user: cu };
    },
    async signOut() { S = load(); S.session = null; save(); authCbs.forEach((f) => f(null)); },
    async sendPasswordResetEmail() {},
    async signInWithPhoneNumber() { throw new Error('phone not supported in stub'); },
  };

  const firestoreFn = () => db;
  firestoreFn.FieldValue = {
    increment: (n) => FV('inc', n), arrayUnion: (...a) => FV('union', a), arrayRemove: (...a) => FV('remove', a),
    delete: () => FV('del'), serverTimestamp: () => FV('ts'),
  };
  firestoreFn.Timestamp = Timestamp;
  const authFn = () => auth;
  authFn.EmailAuthProvider = { credential: (e, p) => ({ e, p }) };
  authFn.RecaptchaVerifier = function () { this.render = async () => 0; this.clear = () => {}; };

  window.firebase = { initializeApp() {}, auth: authFn, firestore: firestoreFn, apps: [{}] };
  window.__FBSTUB = {
    reset() { localStorage.removeItem(KEY); localStorage.removeItem(LOGKEY); S = load(); },
    seed(docs, users) { S = load(); Object.assign(S.docs, docs || {}); Object.assign(S.users, users || {}); save(); },
    dump() { S = load(); return JSON.parse(JSON.stringify(S)); },
    log() { try { return JSON.parse(localStorage.getItem(LOGKEY)) || []; } catch (e) { return []; } },
  };
})();
