import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.equal(scripts.length, 2, 'The self-contained app must include the SDK and app scripts.');
for (const [index, code] of scripts.entries()) new vm.Script(code, { filename: 'inline-script-' + index + '.js' });

function fixture({ languages = ['en-GB'], savedLanguage, storageUnavailable = false } = {}) {
  const requests = [], boots = [], events = new Map(), deviceStorage = new Map();
  if (savedLanguage) deviceStorage.set('studyflow-interface-language', savedLanguage);
  let documentLanguage = '';
  let error = '', clientOptions, response = { data: { session: null }, error: null };
  const errorBox = { className: '', setAttribute() {}, scrollIntoView() {}, remove() {}, set textContent(value) { error = value; } };
  const contentView = { scrollTop: 0 };
  const app = {
    innerHTML: '', style: { setProperty() {} }, classList: { toggle() {} },
    querySelector(selector) { return selector === 'form' ? context.__visibleForm : selector === '.auth-error' && error ? errorBox : null; },
    addEventListener(name, callback) { events.set(name, callback); }, appendChild() {}
  };
  const api = {
    auth: {
      onAuthStateChange() {},
      async getSession() { return { data: { session: null }, error: null }; },
      async signUp(payload) { requests.push({ method: 'signup', payload }); return response; },
      async signInWithPassword(payload) { requests.push({ method: 'login', payload }); return response; },
      async resetPasswordForEmail(email, options) { requests.push({ method: 'reset', email, options }); return response; },
      async signOut() { requests.push({ method: 'signout' }); return { error: null }; }
    }
  };
  const context = vm.createContext({
    console, URL, Date, Map, Set, JSON, Promise,
    location: { protocol: 'https:', href: 'https://example.test/StudyFlowBFHFinaleVersion/index.html', hash: '' },
    document: { documentElement: { setAttribute(name, value) { if (name === 'lang') documentLanguage = value; } }, getElementById(id) { return id === 'setup-form' ? context.__setupForm : context.__visibleForm?.id === id ? context.__visibleForm : id === 'app' ? app : null; }, querySelector(selector) { return selector === '.content' ? contentView : null; }, createElement() { return errorBox; }, addEventListener() {} },
    window: { StudyFlowSupabase: { createClient(url, key, options) { clientOptions = options; return api; } }, addEventListener() {} },
    setInterval() {}, setTimeout(callback) { callback(); return 0; }, clearTimeout() {},
    navigator: { languages, language: languages[0] },
    localStorage: { getItem(key) { if (storageUnavailable) throw Error('Storage disabled'); return deviceStorage.get(key) || null; }, setItem(key, value) { if (storageUnavailable) throw Error('Storage disabled'); deviceStorage.set(key, value); }, removeItem(key) { if (storageUnavailable) throw Error('Storage disabled'); deviceStorage.delete(key); } },
    __boots: boots
  });
  vm.runInContext(scripts[1], context);
  vm.runInContext('bootAccount = async session => { __boots.push(session); };', context);
  return {
    context, app, requests, boots, events, deviceStorage,
    get documentLanguage() { return documentLanguage; },
    get error() { return error; },
    get options() { return clientOptions; },
    set response(value) { response = value; },
    run(code) { return vm.runInContext(code, context); },
    form(overrides = {}) {
      const values = { accountEmail: 'student@example.test', accountName: 'StudyFlow test', accountPassword: 'StudyFlow-check-123', accountPasswordConfirm: 'StudyFlow-check-123', ...overrides };
      const controls = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { name: key, value, type: key.includes('Password') ? 'password' : 'text', validity: { valid: key !== 'accountEmail' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) } }]));
      const elements = Object.values(controls); elements.namedItem = name => controls[name];
      const button = { disabled: false, textContent: 'Create account', isConnected: true };
      const form = { id: 'account-form', elements, querySelector() { return button; }, before() {}, getAttribute() { return 'account-form'; } };
      context.__form = form; context.__visibleForm = form;
      return { form, button };
    }
  };
}

let passed = 0;
async function check(name, action) { await action(); passed++; console.log('PASS ' + name); }

await check('inline scripts parse and account form has a submit handler', async () => {
  const f = fixture();
  assert.equal(typeof f.events.get('submit'), 'function');
  assert.match(f.app.innerHTML, /id="account-form"/);
  assert.equal(f.options.auth.persistSession, true);
});

for (const [name, values, expected] of [
  ['invalid email', { accountEmail: 'invalid' }, /valid email/],
  ['missing name', { accountName: '   ' }, /Enter your name/],
  ['short password', { accountPassword: 'short', accountPasswordConfirm: 'short' }, /between 10 and 72/],
  ['password mismatch', { accountPasswordConfirm: 'Other-password-123' }, /do not match/]
]) await check('reject ' + name + ' before sending', async () => {
  const f = fixture(); f.form(values); f.run("authMode = 'signup';");
  await f.run('submitAccount(__form)');
  assert.match(f.error, expected); assert.equal(f.requests.length, 0);
});

await check('signup sends normalized email, name and the Pages subdirectory', async () => {
  const f = fixture(); f.form({ accountEmail: ' Student@Example.test ', accountName: '  Student  ' });
  f.run("authMode = 'signup';"); await f.run('submitAccount(__form)');
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].payload.email, 'student@example.test');
  assert.equal(f.requests[0].payload.options.data.name, 'Student');
  assert.equal(f.requests[0].payload.options.emailRedirectTo, 'https://example.test/StudyFlowBFHFinaleVersion/');
  assert.match(f.app.innerHTML, /Check your inbox/);
  assert.equal(f.boots.length, 0, 'Unconfirmed users must not open account data.');
});

await check('signup with a verified session opens the right account', async () => {
  const f = fixture(); f.form(); f.response = { data: { session: { user: { id: 'account-a' } } }, error: null };
  f.run("authMode = 'signup';"); await f.run('submitAccount(__form)');
  assert.equal(f.boots[0].user.id, 'account-a');
});

for (const [code, expected] of [
  ['user_already_exists', /already exists.*Back to sign in/],
  ['email_address_not_authorized', /Registration emails are not available/],
  ['over_email_send_rate_limit', /Too many emails/],
  ['email_not_confirmed', /confirm your email address/],
  ['invalid_credentials', /email or password is incorrect/]
]) await check('show ' + code + ' and release the submit button', async () => {
  const f = fixture(); const { button } = f.form();
  f.response = { data: { session: null }, error: { code } };
  f.run("authMode = 'signup';"); await f.run('submitAccount(__form)');
  assert.match(f.error, expected); assert.equal(button.disabled, false); assert.equal(f.run('authBusy'), false);
  assert.equal(f.requests.length, 1); assert.equal(f.boots.length, 0, 'A failed signup must not open personal account data.');
});

await check('connection failures show feedback and permit retry', async () => {
  const f = fixture(); const { button } = f.form();
  f.response = { data: { session: null }, error: { message: 'Failed to fetch' } };
  f.run("authMode = 'signup';"); await f.run('submitAccount(__form)');
  assert.match(f.error, /Connection unavailable/); assert.equal(button.disabled, false);
});

await check('password reset keeps the Pages subdirectory', async () => {
  const f = fixture(); f.form(); f.run("authMode = 'reset';"); await f.run('submitAccount(__form)');
  assert.equal(f.requests[0].options.redirectTo, 'https://example.test/StudyFlowBFHFinaleVersion/');
  assert.match(f.app.innerHTML, /If an account exists/);
});

await check('signout clears the in-memory personal entries', async () => {
  const f = fixture();
  f.run("currentUser = {id:'account-a'}; cloudLoaded = true; state.items = [{id:'private-task',title:'Private'}];");
  await f.run('signOutAccount()');
  assert.equal(f.run('currentUser'), null);
  assert.equal(f.run('state.items.length'), 0);
  assert.equal(f.run('cloudLoaded'), false);
  assert.match(f.app.innerHTML, /Welcome back/);
});

function savedAccountFixture(f, settings = null, items = []) {
  f.context.__accountUser = { id: 'account-a', email: 'student@example.test', user_metadata: { name: 'New student' } };
  f.context.__accountTables = { studyflow_settings: settings, studyflow_groups: [], studyflow_group_members: [], studyflow_items: items };
  f.context.__savedAccounts = [];
  f.run([
    'currentUser = __accountUser;',
    'accountClient.from = table => {',
    '  const result = { data: __accountTables[table], error: null };',
    '  return { select() { return this; }, eq() { return this; }, async maybeSingle() { return result; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };',
    '};',
    'accountClient.rpc = async (name, payload) => { __savedAccounts.push({ name, payload }); return { data: 1, error: null }; };'
  ].join('\n'));
}

await check('first account load saves an empty module list', async () => {
  const f = fixture();
  savedAccountFixture(f);
  await f.run('loadAccount()');
  assert.equal(f.run('state.modules.length'), 0);
  assert.equal(f.run('state.items.length'), 0);
  assert.equal(f.run('state.profile.name'), 'New student');
  assert.equal(f.run('state.profile.degree'), '', 'New users must choose their own degree program.');
  assert.equal(f.run('state.profile.studyMode'), '', 'Study mode must not be assumed.');
  assert.equal(f.run('state.profile.setupComplete'), false);
  assert.equal(f.context.__savedAccounts.length, 1);
  const saved = f.context.__savedAccounts[0];
  assert.equal(saved.name, 'studyflow_save');
  assert.equal(saved.payload.expected_revision, 0);
  assert.equal(saved.payload.settings.modules.length, 0);
  assert.equal(saved.payload.groups_data.length, 0);
  assert.equal(saved.payload.items_data.length, 0);
});

await check('existing modules and task references survive account loading', async () => {
  const f = fixture();
  const module = { id: 'own-module', name: 'My own course', code: 'OWN', color: '#245b87' };
  savedAccountFixture(f, { profile: { name: 'Saved student' }, modules: [module], theme: 'Blue', mono: false, revision: 4 }, [
    { id: 'saved-task', owner_id: 'account-a', group_id: null, data: { kind: 'task', title: 'Keep my task', moduleId: 'own-module' } }
  ]);
  await f.run('loadAccount()');
  assert.equal(f.run('state.modules.length'), 1);
  assert.equal(f.run('state.modules[0].id'), 'own-module');
  assert.equal(f.run('state.modules[0].name'), 'My own course');
  assert.equal(f.run('state.items[0].moduleId'), 'own-module');
  assert.equal(f.run('state.profile.name'), 'Saved student');
  assert.equal(f.run('cloudRevision'), 4);
  assert.equal(f.context.__savedAccounts.length, 0, 'Loading an existing account must not replace its saved modules.');
});

function setupForm(f, overrides = {}) {
  const values = f.run('({...ensureSetupDraft().profile})');
  if (f.run('setupStep') === 2) for (const module of f.run('setupDraft.modules')) {
    values['moduleName:' + module.id] = module.name;
    values['moduleCode:' + module.id] = module.code;
    values['moduleColor:' + module.id] = module.color;
  }
  Object.assign(values, overrides);
  const elements = { namedItem(name) { return Object.hasOwn(values, name) ? { value: values[name] } : null; } };
  const form = { elements, getAttribute() { return 'setup-form'; } };
  f.context.__setupForm = form;
  return form;
}
async function setupClick(f, action, extra = {}) {
  const button = { dataset: { action, ...extra } };
  await f.events.get('click')({ target: { closest() { return button; } } });
}
async function openSetup(f, settings = null, items = []) {
  savedAccountFixture(f, settings, items);
  await f.run('loadAccount()');
  f.run('cloudLoaded=true; render();');
  return f;
}
async function reachModules(f) {
  setupForm(f, { degree: 'BSc Custom Studies', studyMode: 'Part-time' });
  await f.events.get('submit')({ preventDefault() {}, target: f.context.__setupForm });
  assert.equal(f.run('setupStep'), 2);
}

await check('new accounts must complete setup before navigation or entry changes', async () => {
  const f = await openSetup(fixture());
  assert.match(f.app.innerHTML, /Set up your studies/);
  assert.doesNotMatch(f.app.innerHTML, /aria-label="Main navigation"/);
  await setupClick(f, 'route', { route: 'tasks' });
  await setupClick(f, 'add-module');
  assert.equal(f.run('route'), 'home');
  assert.equal(f.run('state.modules.length'), 0);
  assert.equal(f.context.__savedAccounts.length, 1, 'Only the initial empty account should be saved.');
  assert.equal(await f.run('saveForm({})'), false);
});

await check('setup requires the degree and study mode without saving partial details', async () => {
  const f = await openSetup(fixture());
  setupForm(f);
  assert.equal(await f.run('submitSetup(__setupForm)'), false);
  assert.match(f.app.innerHTML, /Enter your degree program/);
  setupForm(f, { degree: 'My program' });
  assert.equal(await f.run('submitSetup(__setupForm)'), false);
  assert.match(f.app.innerHTML, /Choose your study mode/);
  assert.equal(f.context.__savedAccounts.length, 1);
});

await check('setup requires at least one named module', async () => {
  const f = await openSetup(fixture());
  await reachModules(f);
  setupForm(f);
  assert.equal(await f.run('submitSetup(__setupForm)'), false);
  assert.match(f.app.innerHTML, /Add at least one module/);
  await setupClick(f, 'setup-add-module');
  setupForm(f);
  assert.equal(await f.run('submitSetup(__setupForm)'), false);
  assert.match(f.app.innerHTML, /Enter a name for each module/);
  assert.equal(f.run('state.modules.length'), 0);
  assert.equal(f.context.__savedAccounts.length, 1);
});

await check('moving between setup steps retains unsaved profile and module edits', async () => {
  const f = await openSetup(fixture());
  await reachModules(f);
  await setupClick(f, 'setup-add-module');
  const id = f.run('setupDraft.modules[0].id');
  setupForm(f, { ['moduleName:' + id]: 'Economics', ['moduleCode:' + id]: 'ECON', ['moduleColor:' + id]: '#245b87' });
  await setupClick(f, 'setup-back');
  assert.equal(f.run('setupDraft.profile.degree'), 'BSc Custom Studies');
  assert.equal(f.run('setupDraft.modules[0].name'), 'Economics');
  assert.equal(f.run('state.profile.degree'), '');
  setupForm(f); await f.run('submitSetup(__setupForm)');
  assert.match(f.app.innerHTML, /value="Economics"/);
  assert.match(f.app.innerHTML, /value="#245b87"/);
  assert.equal(f.context.__savedAccounts.length, 1);
});

await check('existing accounts are prompted once with saved details and linked modules intact', async () => {
  const f = await openSetup(fixture(), {
    profile: { name: 'Saved student', degree: 'Custom degree', studyMode: 'Full-time', semesterTerm: 'Spring semester', semesterYear: '2025' },
    modules: [{ id: 'linked-module', name: 'Saved course', code: 'SAVED', color: '#245b87' }], theme: 'Blue', mono: false, revision: 4
  }, [{ id: 'saved-task', owner_id: 'account-a', group_id: null, data: { kind: 'task', title: 'Keep my task', moduleId: 'linked-module' } }]);
  assert.match(f.app.innerHTML, /value="Custom degree"/);
  assert.equal(f.run('setupDraft.profile.semesterYear'), '2025');
  setupForm(f); await f.run('submitSetup(__setupForm)');
  setupForm(f); await setupClick(f, 'setup-remove-module', { id: 'linked-module' });
  assert.equal(f.run('setupDraft.modules.length'), 1);
  assert.match(f.app.innerHTML, /used by existing entries/);
  setupForm(f, { 'moduleName:linked-module': 'Renamed course' });
  assert.equal(await f.run('submitSetup(__setupForm)'), true);
  const saved = f.context.__savedAccounts[0].payload;
  assert.equal(saved.expected_revision, 4);
  assert.equal(saved.settings.profile.setupComplete, true);
  assert.equal(saved.settings.modules[0].id, 'linked-module');
  assert.equal(saved.settings.modules[0].name, 'Renamed course');
  assert.equal(saved.items_data[0].data.moduleId, 'linked-module');
  assert.equal(saved.items_data[0].data.title, 'Keep my task');
  assert.match(f.app.innerHTML, /at any time in Profile/);
  assert.doesNotMatch(f.app.innerHTML, /aria-label="Main navigation"/);
  await setupClick(f, 'setup-open');
  assert.match(f.app.innerHTML, /aria-label="Main navigation"/);
  assert.equal(f.run('setupActive()'), false);
  // A later sign-in loads the persisted completion marker and skips setup.
  f.context.__accountTables.studyflow_settings = { ...saved.settings, revision: 5 };
  f.run('resetSetup();'); await f.run('loadAccount()'); f.run('render();');
  assert.doesNotMatch(f.app.innerHTML, /id="setup-form"/);
  assert.match(f.app.innerHTML, /aria-label="Main navigation"/);
});

await check('failed setup save keeps the draft, old data and retry available', async () => {
  const f = await openSetup(fixture());
  await reachModules(f); await setupClick(f, 'setup-add-module');
  const id = f.run('setupDraft.modules[0].id');
  setupForm(f, { ['moduleName:' + id]: 'Accounting' });
  f.run("accountClient.rpc=async()=>({error:{message:'Failed to fetch'}});");
  assert.equal(await f.run('submitSetup(__setupForm)'), false);
  assert.match(f.app.innerHTML, /Connection unavailable/);
  assert.match(f.app.innerHTML, /value="Accounting"/);
  assert.equal(f.run('state.profile.setupComplete'), false);
  assert.equal(f.run('state.modules.length'), 0);
  assert.equal(f.run('isSaving'), false);
  assert.equal(f.run('setupNotice'), false);
  assert.doesNotMatch(f.app.innerHTML, /aria-label="Main navigation"/);
  f.run('accountClient.rpc=async()=>({data:2,error:null});');
  setupForm(f); assert.equal(await f.run('submitSetup(__setupForm)'), true);
  assert.equal(f.run('state.modules[0].name'), 'Accounting');
});

await check('automatic refresh and reminders do not replace an unfinished setup', async () => {
  const f = await openSetup(fixture());
  f.run("setupDraft.profile.degree='Unsaved degree'; accountClient.from=()=>{throw Error('Unexpected refresh')}; state.items=[{id:'overdue',title:'Private reminder',due:new Date().toISOString(),reminder:'0'}];");
  await f.run('refreshAccount()'); f.run('checkReminders()');
  assert.equal(f.run('setupDraft.profile.degree'), 'Unsaved degree');
  assert.equal(f.run('shownReminders.size'), 0);
});

await check('a pending setup save keeps navigation closed and cannot complete another session', async () => {
  const f = await openSetup(fixture());
  await reachModules(f); await setupClick(f, 'setup-add-module');
  const id = f.run('setupDraft.modules[0].id');
  setupForm(f, { ['moduleName:' + id]: 'My module' });
  f.run('accountClient.rpc=()=>new Promise(resolve=>{globalThis.__finishSave=resolve});');
  const pending = f.run('submitSetup(__setupForm)');
  assert.equal(f.run('isSaving'), true);
  assert.match(f.app.innerHTML, /Saving your setup/);
  assert.doesNotMatch(f.app.innerHTML, /aria-label="Main navigation"/);
  await setupClick(f, 'route', { route: 'tasks' });
  assert.equal(f.run('route'), 'home');
  f.run('clearAccount(); __finishSave({data:2,error:null});');
  assert.equal(await pending, false);
  assert.equal(f.run('setupNotice'), false);
  assert.equal(f.run('setupDraft'), null);
  assert.equal(f.run('currentUser'), null);
  assert.match(f.app.innerHTML, /Welcome back/);
});

await check('signout clears the setup draft before another account is opened', async () => {
  const f = await openSetup(fixture());
  await reachModules(f); await setupClick(f, 'setup-add-module');
  f.run("setupDraft.profile.degree='Private degree';");
  await setupClick(f, 'sign-out');
  assert.equal(f.run('setupDraft'), null);
  assert.equal(f.run('setupStep'), 1);
  assert.equal(f.run('setupNotice'), false);
  assert.equal(f.run('setupError'), '');
  assert.match(f.app.innerHTML, /Welcome back/);
  await openSetup(f);
  assert.equal(f.run('setupDraft.profile.degree'), '');
  assert.equal(f.run('setupDraft.modules.length'), 0);
});

await check('first visit uses a supported browser language and updates the document language', async () => {
  const f = fixture({ languages: ['pt-BR', 'de-CH', 'fr-CH'] });
  assert.equal(f.run('language'), 'de');
  assert.equal(f.documentLanguage, 'de');
  assert.match(f.app.innerHTML, /Willkommen zurück/);
  for (const name of ['Deutsch', 'Français', 'Italiano', 'English']) assert.ok(f.app.innerHTML.includes(name));
});

await check('device preference wins over browser language and unsupported values fall back safely', async () => {
  assert.equal(fixture({ languages: ['de-CH'], savedLanguage: 'fr' }).run('language'), 'fr');
  assert.equal(fixture({ languages: ['es-ES', 'it-CH'], savedLanguage: 'xx' }).run('language'), 'it');
  assert.equal(fixture({ languages: ['es-ES'], savedLanguage: '__proto__' }).run('language'), 'en');
});

await check('blocked browser storage still permits language selection', async () => {
  const f = fixture({ languages: ['it-CH'], storageUnavailable: true });
  assert.match(f.app.innerHTML, /Bentornato/);
  assert.equal(await f.run("changeLanguage('de')"), true);
  assert.match(f.app.innerHTML, /Willkommen zurück/);
});

const renderedLocales = {};
for (const [code, login, tasks, setup, fieldName] of [
  ['de', 'Willkommen zurück', 'Aufgaben', 'Richte dein Studium ein', 'Beschreibung'],
  ['fr', 'Bon retour', 'Tâches', 'Configure tes études', 'Description'],
  ['it', 'Bentornato', 'Attività', 'Configura i tuoi studi', 'Descrizione'],
  ['en', 'Welcome back', 'Tasks', 'Set up your studies', 'Description']
]) await check(code + ': authentication, setup, navigation and all entry views render in the selected language', async () => {
  const f = fixture({ savedLanguage: code });
  assert.ok(f.app.innerHTML.includes(login));
  f.run('globalThis.__translationKeys=new Set(); const originalTranslate=t; t=(message,values)=>{__translationKeys.add(String(message));return originalTranslate(message,values)};');
  f.run(`
    currentUser={id:'account-a',email:'owner@example.test'}; cloudLoaded=true;
    state=emptyAccount(currentUser);
    state.profile={...state.profile,name:'NAME_DATA',degree:'DEGREE_DATA',studyMode:'Part-time',setupComplete:true};
    state.modules=[{id:'course-a',name:'MODULE_DATA',code:'CODE_DATA',color:'#245b87'}];
    state.people=[{id:'member@example.test',name:'MEMBER_DATA'}];
    state.items=[
      {id:'group-a',kind:'group',ownerId:'account-a',title:'GROUP_DATA',description:'GROUP_DESCRIPTION',moduleId:'course-a',memberIds:['member@example.test'],due:'2026-03-13T12:00',reminder:'none'},
      {id:'task-a',kind:'task',ownerId:'account-a',title:'TASK_DATA',description:'TASK_DESCRIPTION',moduleId:'course-a',groupId:'group-a',workType:'group',priority:'Normal',due:'2026-03-13T12:00',reminder:'30'},
      {id:'exam-a',kind:'exam',ownerId:'account-a',title:'EXAM_DATA',description:'EXAM_DESCRIPTION',moduleId:'course-a',due:'2026-03-13T12:00',reminder:'none',duration:90,examType:'On paper',location:'ROOM_DATA',materials:'MATERIALS_DATA'}
    ];
    globalThis.__viewHtml=[nav(),home(),overview('task'),overview('exam'),overview('group'),profile(),moduleSettings(),appearance(),memberProfile('member@example.test','group-a')];
    for(const item of state.items)__viewHtml.push(formMarkup(item),detailMarkup(item));
    resetSetup();state.profile.setupComplete=false;renderSetup();__viewHtml.push(app.innerHTML);
    setupStep=2;renderSetup();__viewHtml.push(app.innerHTML);
    setupNotice=true;renderSetup();__viewHtml.push(app.innerHTML);
    resetSetup();
    for(const mode of ['login','signup','reset']){authMode=mode;renderAuth();__viewHtml.push(app.innerHTML)}
    isRecovery=true;renderAuth();__viewHtml.push(app.innerHTML);isRecovery=false;
  `);
  const views = JSON.parse(f.run('JSON.stringify(__viewHtml)'));
  assert.ok(views[0].includes(tasks));
  assert.ok(views[9].includes(fieldName), 'Entry fields must be translated.');
  assert.ok(views[15].includes(setup));
  assert.equal(views.length, 22);
  for (const key of JSON.parse(f.run('JSON.stringify([...__translationKeys])'))) {
    assert.equal(f.run('Object.hasOwn(TRANSLATIONS,' + JSON.stringify(key) + ')'), true, 'Missing translation: ' + key);
  }
  assert.ok(views.some(view => view.includes('MODULE_DATA')), 'Own module names must survive translation.');
  assert.ok(views.some(view => view.includes('TASK_DESCRIPTION')), 'Own descriptions must survive translation.');
  renderedLocales[code] = views;
});

await check('every message has three complete translations with matching placeholders', async () => {
  const f = fixture();
  const messages = JSON.parse(f.run('JSON.stringify(TRANSLATIONS)'));
  const placeholders = text => [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(match => match[1]).sort();
  assert.ok(Object.keys(messages).length >= 280);
  for (const [key, translations] of Object.entries(messages)) for (const code of ['de', 'fr', 'it']) {
    assert.ok(translations[code]?.trim(), key + ' missing in ' + code);
    assert.deepEqual(placeholders(translations[code]), placeholders(key), key + ' has changed placeholders in ' + code);
  }
});

await check('language changes before sign-in retain typed credentials without storing them', async () => {
  const f = fixture();
  const { form } = f.form({ accountEmail: 'Typed@Example.test', accountPassword: 'Private-password-123' });
  const snapshot = f.run('captureVisibleForm()');
  // Replacing a form during a render clears its controls; restoration must fill the new controls.
  const restored = f.form({ accountEmail: '', accountPassword: '' }).form;
  f.context.__snapshot = snapshot; f.run('restoreVisibleForm(__snapshot)');
  assert.equal(restored.elements.namedItem('accountEmail').value, 'Typed@Example.test');
  assert.equal(restored.elements.namedItem('accountPassword').value, 'Private-password-123');
  const control = { value: 'fr', matches(selector) { return selector === '[data-language]'; } };
  await f.events.get('change')({ target: control });
  assert.match(f.app.innerHTML, /Bon retour/);
  assert.equal(f.documentLanguage, 'fr');
  assert.equal(form.elements.namedItem('accountEmail').value, 'Typed@Example.test');
  assert.deepEqual([...f.deviceStorage], [['studyflow-interface-language', 'fr']]);
  assert.equal(f.requests.length, 0);
});

await check('changing language also retranslates an existing authentication error', async () => {
  const f = fixture(); f.form({ accountEmail: 'invalid' });
  await f.run('submitAccount(__form)');
  assert.match(f.error, /valid email address/);
  await f.run("changeLanguage('de')");
  assert.match(f.app.innerHTML, /Gib eine gültige E-Mail-Adresse ein/);
  await f.run("changeLanguage('it')");
  assert.match(f.app.innerHTML, /Inserisci un indirizzo e-mail valido/);
});

await check('setup language changes retain both steps and are saved together with setup', async () => {
  const f = await openSetup(fixture());
  setupForm(f, { name: 'Own name', degree: 'Own degree', studyMode: 'Part-time' });
  assert.equal(await f.run("changeLanguage('fr')"), true);
  assert.equal(f.run('setupDraft.profile.degree'), 'Own degree');
  assert.match(f.app.innerHTML, /Configure tes études/);
  setupForm(f); await f.run('submitSetup(__setupForm)');
  await setupClick(f, 'setup-add-module');
  const id = f.run('setupDraft.modules[0].id');
  setupForm(f, { ['moduleName:' + id]: 'Home', ['moduleCode:' + id]: 'OWN' });
  await f.run("changeLanguage('it')");
  assert.equal(f.run('setupDraft.modules[0].name'), 'Home');
  assert.match(f.app.innerHTML, /Aggiungi i tuoi moduli/);
  assert.equal(f.context.__savedAccounts.length, 1, 'Changing setup language must not save partial profile data.');
  setupForm(f); await f.run('submitSetup(__setupForm)');
  const saved = f.context.__savedAccounts.at(-1).payload.settings;
  assert.equal(saved.profile.language, 'it');
  assert.equal(saved.profile.name, 'Own name');
  assert.equal(saved.profile.degree, 'Own degree');
  assert.equal(saved.modules[0].name, 'Home');
  assert.match(f.app.innerHTML, /La configurazione è completa/);
  // The completion screen also offers language selection and must persist it.
  await f.run("changeLanguage('de')");
  assert.equal(f.context.__savedAccounts.at(-1).payload.settings.profile.language, 'de');
});

await check('account language overrides device preference and a change preserves own entries', async () => {
  const f = fixture({ savedLanguage: 'en' });
  await openSetup(f, { profile: { name: 'Home', degree: 'Normal', language: 'fr', setupComplete: true }, modules: [{ id: 'own', name: 'Group work', code: 'OWN', color: '#245b87' }], theme: 'Green', mono: false, revision: 8 }, [
    { id: 'own-task', owner_id: 'account-a', group_id: null, data: { kind: 'task', title: 'Sign out', description: 'Your profile', moduleId: 'own', priority: 'High' } }
  ]);
  assert.equal(f.run('language'), 'fr');
  assert.equal(f.documentLanguage, 'fr');
  const before = f.run('JSON.stringify({modules:state.modules,items:state.items})');
  await f.run("route='profile';changeLanguage('it')");
  assert.match(f.app.innerHTML, /Profilo e promemoria/);
  assert.match(f.app.innerHTML, />Normal ·/);
  assert.equal(f.run('JSON.stringify({modules:state.modules,items:state.items})'), before);
  const saved = f.context.__savedAccounts.at(-1).payload;
  assert.equal(saved.expected_revision, 8);
  assert.equal(saved.settings.profile.language, 'it');
  assert.equal(saved.items_data[0].data.title, 'Sign out');
  assert.equal(saved.items_data[0].data.priority, 'High');
  assert.equal(saved.settings.modules[0].name, 'Group work');
  assert.equal(f.deviceStorage.get('studyflow-interface-language'), 'it');
});

await check('failed language save restores the previous interface and allows retry', async () => {
  const f = await openSetup(fixture(), { profile: { language: 'de', setupComplete: true }, modules: [], theme: 'Green', mono: false, revision: 2 });
  f.run("accountClient.rpc=async()=>({error:{message:'Failed to fetch'}});route='profile';");
  assert.equal(await f.run("changeLanguage('fr')"), false);
  assert.equal(f.run('language'), 'de');
  assert.equal(f.run('state.profile.language'), 'de');
  assert.equal(f.deviceStorage.get('studyflow-interface-language'), 'de');
  assert.match(f.error, /Keine Verbindung/);
  f.run('accountClient.rpc=async()=>({data:3,error:null});');
  assert.equal(await f.run("changeLanguage('fr')"), true);
  assert.equal(f.run('state.profile.language'), 'fr');
  assert.match(f.app.innerHTML, /Profil et rappels/);
});

await check('invalid language choices and concurrent saves cannot alter the preference', async () => {
  const f = fixture();
  assert.equal(await f.run("changeLanguage('es')"), false);
  f.run('isSaving=true;');
  f.context.__control = { value: 'de' };
  assert.equal(await f.run("changeLanguage('de',__control)"), false);
  assert.equal(f.context.__control.value, 'en');
  assert.equal(f.run('language'), 'en');
  assert.equal(f.deviceStorage.size, 0);
});

await check('calendar dates and weekdays use the selected locale while form values remain stable', async () => {
  const f = fixture();
  const dates = new Set();
  for (const code of ['de', 'fr', 'it', 'en']) {
    f.run('language=' + JSON.stringify(code));
    dates.add(f.run("dateText('2026-03-13T12:00')"));
    assert.ok(f.run('calendar()').includes(new Date(2024, 0, 1).toLocaleDateString({ de: 'de-CH', fr: 'fr-CH', it: 'it-CH', en: 'en-GB' }[code], { weekday: 'short' })));
  }
  assert.ok(dates.size >= 3, 'Month and date formats must not stay fixed in English.');
  f.run("language='fr';");
  assert.match(f.run("selectOptions([['Normal','Normal'],['High','High']],'Normal')"), /value="Normal" selected>Normale/);
  assert.match(f.run("selectOptions([['Full-time','Full-time']],'Full-time')"), /value="Full-time" selected>À plein temps/);
  assert.match(f.run("profileOptions(['Home'],'Home')"), />Home</);
});

await check('names in translated messages are escaped and own content is never translated', async () => {
  const f = fixture();
  f.run("language='de';");
  assert.equal(f.run("tx('Hello {name}, ready for today?',{name:'<img src=x onerror=alert(1)>'})").includes('<img'), false);
  f.run("currentUser={id:'account-a'};state=emptyAccount(currentUser);state.profile.name='Home';state.profile.degree='Normal';state.modules=[{id:'a',name:'Group work',code:'OWN',color:'#245b87'}];");
  f.context.__item = { id: 'a-task', ownerId: 'account-a', kind: 'task', moduleId: 'a', title: 'Sign out', description: 'Your profile', priority: 'Normal' };
  const card = f.run('card(__item)');
  assert.match(card, />Sign out<\/h3>/);
  assert.match(card, />Your profile<\/p>/);
  assert.match(card, />Group work<\/span>/);
});

const ownModules = [
  { id: 'module-one', name: 'Accounting', code: 'ACC', color: '#245b87' },
  { id: 'module-two', name: 'Management', code: 'MAN', color: '#963e6a' }
];
async function groupFixture(groups = [], items = [], modules = ownModules) {
  const f = fixture();
  savedAccountFixture(f, { profile: { name: 'Student', setupComplete: true }, modules, theme: 'Green', mono: false, revision: 7 }, items);
  f.context.__accountTables.studyflow_groups = groups;
  await f.run('loadAccount()'); f.run('cloudLoaded=true; render();');
  return f;
}
function rawGroup(id, moduleId = '', extra = {}) {
  return { id, owner_id: 'account-a', data: { title: 'Study group', description: '', moduleId, moduleSnapshot: ownModules.find(m => m.id === moduleId) || null, ...extra } };
}
function entryForm(f, overrides = {}) {
  const values = { kind: 'group', entryId: '', title: 'New study group', description: '', moduleId: '', members: '', ...overrides };
  let error = '';
  const errorBox = { hidden: true, scrollIntoView() {}, set textContent(value) { error = value; } };
  const elements = Object.entries(values).map(([name, value]) => ({ name, value, type: 'text', validity: { valid: name !== 'due' || !!value && !Number.isNaN(new Date(value).getTime()) }, setAttribute() {}, focus() {}, scrollIntoView() {} }));
  elements.namedItem = name => elements.find(el => el.name === name);
  const form = { elements, querySelector() { return errorBox; }, querySelectorAll() { return []; }, getAttribute() { return 'entry-form'; } };
  f.context.__entryForm = form;
  return { get error() { return error; } };
}

await check('group forms offer no module in all four languages and omit date and reminder controls', async () => {
  const f = await groupFixture();
  for (const [code, label] of [['de', 'Keinem Modul zugeordnet'], ['fr', 'Sans module associé'], ['it', 'Nessun modulo associato'], ['en', 'Not assigned to a module']]) {
    f.run('language=' + JSON.stringify(code));
    const markup = f.run("formMarkup({kind:'group',moduleId:''})");
    assert.ok(markup.includes(label));
    assert.match(markup, /<option value="" selected>/);
    assert.match(markup, /value="module-one"/);
    assert.doesNotMatch(markup, /name="due"|name="reminder"/);
    for (const kind of ['task', 'exam']) {
      const entry = f.run('formMarkup({kind:' + JSON.stringify(kind) + ",moduleId:'module-one'})");
      assert.match(entry, /name="due"/); assert.match(entry, /name="reminder"/);
    }
  }
});

await check('a group without a module saves without a date or reminder and keeps membership', async () => {
  const f = await groupFixture(); entryForm(f, { members: 'friend@example.test' });
  assert.equal(await f.run('saveForm(__entryForm)'), true);
  const payload = f.context.__savedAccounts.at(-1).payload;
  assert.equal(payload.groups_data.length, 1);
  const group = payload.groups_data[0];
  assert.equal(group.data.moduleId, ''); assert.equal(group.data.moduleSnapshot, null);
  assert.equal(group.data.due, null); assert.equal(group.data.reminder, 'none');
  assert.equal(group.members[0].email, 'friend@example.test');
  assert.equal(payload.items_data.length, 0);
  assert.doesNotMatch(f.run('detailMarkup(state.items[0])'), /detail-label">Reminder|detail-label">Date &amp; time/);
});

await check('groups still accept one own module and reject unknown module IDs', async () => {
  const f = await groupFixture();
  const invalid = entryForm(f, { moduleId: 'unknown-module' });
  assert.equal(await f.run('saveForm(__entryForm)'), false);
  assert.match(invalid.error, /Choose a module/); assert.equal(f.context.__savedAccounts.length, 0);
  entryForm(f, { moduleId: 'module-two' });
  assert.equal(await f.run('saveForm(__entryForm)'), true);
  const group = f.context.__savedAccounts.at(-1).payload.groups_data[0].data;
  assert.equal(group.moduleId, 'module-two'); assert.equal(group.moduleSnapshot.name, 'Management');
  assert.equal(group.due, null); assert.equal(group.reminder, 'none');
});

await check('a group can be saved without personal modules while tasks still require one', async () => {
  const f = await groupFixture([], [], []); entryForm(f);
  assert.equal(await f.run('saveForm(__entryForm)'), true);
  const invalid = entryForm(f, { kind: 'task', title: 'Task', due: '2026-12-01T18:00', reminder: 'none', workType: 'individual' });
  assert.equal(await f.run('saveForm(__entryForm)'), false);
  assert.match(invalid.error, /Choose a module/);
});

await check('unassigned groups do not remove module and date requirements from their tasks', async () => {
  const f = await groupFixture([rawGroup('cross-group')]);
  let invalid = entryForm(f, { kind: 'task', title: 'Task', workType: 'group', groupId: 'cross-group', due: '2026-12-02T18:00' });
  assert.equal(await f.run('saveForm(__entryForm)'), false);
  assert.match(invalid.error, /Choose a module/);
  for (const kind of ['task', 'exam']) {
    invalid = entryForm(f, { kind, title: 'Entry', moduleId: 'module-one', due: '', duration: '90', workType: kind === 'task' ? 'group' : 'individual', groupId: 'cross-group' });
    assert.equal(await f.run('saveForm(__entryForm)'), false);
    assert.match(invalid.error, /Choose a valid date and time/);
  }
  assert.equal(f.context.__savedAccounts.length, 0);
});

await check('tasks in an unassigned group retain independently selected modules after save and reload', async () => {
  const f = await groupFixture([rawGroup('cross-group')]);
  entryForm(f, { kind: 'task', title: 'Module-specific task', moduleId: 'module-two', workType: 'group', groupId: 'cross-group', due: '2026-12-02T18:00', reminder: '30', priority: 'High' });
  assert.equal(await f.run('saveForm(__entryForm)'), true);
  const payload = f.context.__savedAccounts.at(-1).payload;
  const task = payload.items_data[0];
  assert.equal(task.group_id, 'cross-group'); assert.equal(task.data.moduleId, 'module-two');
  assert.equal(task.data.moduleSnapshot.name, 'Management'); assert.equal(task.data.due, '2026-12-02T18:00');
  assert.equal(task.data.reminder, '30');
  f.context.__accountTables.studyflow_groups = payload.groups_data.map(g => ({ id: g.id, owner_id: 'account-a', data: g.data }));
  f.context.__accountTables.studyflow_items = payload.items_data.map(i => ({ id: i.id, owner_id: 'account-a', group_id: i.group_id, data: i.data }));
  f.context.__accountTables.studyflow_settings = { ...payload.settings, revision: 8 };
  await f.run('loadAccount()');
  assert.equal(f.run("state.items.find(i=>i.kind==='task').moduleId"), 'module-two');
  assert.equal(f.run("state.items.find(i=>i.kind==='task').moduleSnapshot.name"), 'Management');
});

await check('shared tasks keep their module label for another member with different own modules', async () => {
  const f = await groupFixture([rawGroup('cross-group')], [
    { id: 'shared-task', owner_id: 'other-member', group_id: 'cross-group', data: { kind: 'task', title: 'Shared task', moduleId: 'foreign-module', moduleSnapshot: { id: 'foreign-module', name: 'Shared module label', code: 'SHARED', color: '#963e6a' }, due: '2026-12-02T18:00', reminder: 'none' } }
  ]);
  assert.equal(f.run("state.items.find(i=>i.id==='shared-task').moduleId"), 'foreign-module');
  assert.match(f.run("card(state.items.find(i=>i.id==='shared-task'))"), /Shared module label/);
});

await check('a task can inherit a fixed group module belonging to another account', async () => {
  const group = rawGroup('fixed-group', 'foreign-module', { moduleSnapshot: { id: 'foreign-module', name: 'Organizer module', code: 'ORG', color: '#245b87' } });
  group.owner_id = 'other-account';
  const f = await groupFixture([group]);
  entryForm(f, { kind: 'task', title: 'Shared task', moduleId: 'module-one', workType: 'group', groupId: 'fixed-group', due: '2026-12-02T18:00', reminder: 'none' });
  assert.equal(await f.run('saveForm(__entryForm)'), true);
  const payload = f.context.__savedAccounts.at(-1).payload;
  assert.equal(payload.groups_data.length, 0, 'Members must not save or overwrite another organizer’s group.');
  assert.equal(payload.items_data[0].data.moduleId, 'foreign-module');
  assert.equal(payload.items_data[0].data.moduleSnapshot.name, 'Organizer module');
});

await check('removing a group module preserves linked tasks, dates and existing module IDs', async () => {
  const f = await groupFixture([rawGroup('existing-group', 'module-one', { due: '2026-12-01T18:00', reminder: '15' })], [
    { id: 'linked-task', owner_id: 'account-a', group_id: 'existing-group', data: { kind: 'task', title: 'Keep this task', moduleId: 'module-one', due: '2026-12-04T12:00', reminder: '60' } }
  ]);
  entryForm(f, { entryId: 'existing-group', title: 'Existing group', moduleId: '' });
  assert.equal(await f.run('saveForm(__entryForm)'), true);
  const payload = f.context.__savedAccounts.at(-1).payload;
  assert.equal(payload.groups_data[0].id, 'existing-group');
  assert.equal(payload.groups_data[0].data.moduleId, '');
  assert.equal(payload.groups_data[0].data.due, null);
  assert.equal(payload.items_data[0].id, 'linked-task');
  assert.equal(payload.items_data[0].group_id, 'existing-group');
  assert.equal(payload.items_data[0].data.moduleId, 'module-one');
  assert.equal(payload.items_data[0].data.due, '2026-12-04T12:00');
  assert.equal(payload.items_data[0].data.reminder, '60');
});

await check('a failed group change rolls back the group and its linked tasks', async () => {
  const f = await groupFixture([rawGroup('existing-group', 'module-one')], [
    { id: 'linked-task', owner_id: 'account-a', group_id: 'existing-group', data: { kind: 'task', title: 'Keep this task', moduleId: 'module-one', due: '2026-12-04T12:00', reminder: 'none' } }
  ]);
  const before = f.run('JSON.stringify(state.items)');
  const failed = entryForm(f, { entryId: 'existing-group', moduleId: 'module-two' });
  f.run("accountClient.rpc=async()=>({error:{message:'Failed to fetch'}});");
  assert.equal(await f.run('saveForm(__entryForm)'), false);
  assert.match(failed.error, /Connection unavailable/);
  assert.equal(f.run('JSON.stringify(state.items)'), before);
});

await check('groups never trigger reminders while tasks keep their reminder behavior', async () => {
  const f = await groupFixture();
  f.run("state.items=[{id:'legacy-group',kind:'group',title:'Group',due:new Date().toISOString(),reminder:'0'},{id:'current-task',kind:'task',title:'Task',due:new Date().toISOString(),reminder:'0'}];checkReminders();");
  assert.equal(f.run('shownReminders.size'), 1);
  assert.equal(f.run("[...shownReminders][0].includes(':current-task:')"), true);
});

await check('group task module control unlocks and restores the personal choice for unassigned groups', async () => {
  const group = rawGroup('fixed-group', 'foreign-module', { moduleSnapshot: { id: 'foreign-module', name: 'Foreign module', code: 'FOR', color: '#245b87' } });
  const f = await groupFixture([rawGroup('cross-group'), group]);
  const options = ownModules.map(m => ({ value: m.id, dataset: {} }));
  const module = { options, dataset: {}, value: 'module-two', disabled: false, closest() { return { style: { setProperty() {} } }; }, appendChild(option) { options.push(option); option.remove = () => { options.splice(options.indexOf(option), 1); }; } };
  const controls = { 'task-type': { value: 'group' }, 'task-group': { value: 'cross-group' }, 'entry-module': module, 'task-group-field': { hidden: true } };
  f.context.document.getElementById = id => controls[id] || null;
  f.context.document.createElement = () => ({ dataset: {}, value: '', textContent: '' });
  f.run('syncTaskGroup()'); assert.equal(module.disabled, false); assert.equal(module.value, 'module-two');
  controls['task-group'].value = 'fixed-group';
  f.run('syncTaskGroup()'); assert.equal(module.disabled, true); assert.equal(module.value, 'foreign-module');
  assert.equal(options.at(-1).textContent, 'Foreign module · FOR');
  controls['task-group'].value = 'cross-group';
  f.run('syncTaskGroup()'); assert.equal(module.disabled, false); assert.equal(module.value, 'module-two');
  assert.equal(options.some(o => o.value === 'foreign-module'), false);
});

await check('groups have no completion controls or completed styling while their tasks remain actionable', async () => {
  const f = await groupFixture([rawGroup('group-one', 'module-one', { done: true })], [
    { id: 'group-task', owner_id: 'account-a', group_id: 'group-one', data: { kind: 'task', title: 'Shared task', moduleId: 'module-one', due: '2026-12-04T12:00', reminder: 'none', done: true } }
  ]);
  // Cover stale in-memory completion flags as well as normalized account data.
  f.run("state.items.find(i=>i.id==='group-one').done=true;");
  const card = f.run("card(state.items.find(i=>i.id==='group-one'))");
  assert.doesNotMatch(card, /data-action="toggle"|class="card completed"/);
  const detail = f.run("detailMarkup(state.items.find(i=>i.id==='group-one'))");
  assert.doesNotMatch(detail, /data-action="toggle" data-id="group-one"/);
  assert.match(detail, /data-action="toggle" data-id="group-task"/);
  assert.match(detail, /data-action="edit" data-id="group-one"/);
  assert.match(detail, /data-action="delete-ask" data-id="group-one"/);
});

await check('group totals include previously completed groups without changing task completion data', async () => {
  const f = await groupFixture([rawGroup('group-one', 'module-one', { done: true }), rawGroup('group-two', '', { done: false })], [
    { id: 'finished-task', owner_id: 'account-a', group_id: 'group-one', data: { kind: 'task', title: 'Finished task', moduleId: 'module-one', due: '2026-12-04T12:00', reminder: 'none', done: true } },
    { id: 'open-task', owner_id: 'account-a', group_id: null, data: { kind: 'task', title: 'Open task', moduleId: 'module-two', due: '2026-12-05T12:00', reminder: 'none', done: false } }
  ]);
  assert.equal(f.run("state.items.filter(i=>i.kind==='group').every(i=>!Object.hasOwn(i,'done'))"), true);
  for (const [code, total] of [['de', '2 Gruppen'], ['fr', '2 groupes'], ['it', '2 gruppi'], ['en', '2 groups']]) {
    f.run('language=' + JSON.stringify(code));
    assert.ok(f.run("overview('group')").includes('<span class="count">' + total + '</span>'));
  }
  await f.run('persist()');
  const payload = f.context.__savedAccounts.at(-1).payload;
  assert.equal(payload.groups_data.every(g => !Object.hasOwn(g.data, 'done')), true);
  assert.equal(payload.items_data.find(i => i.id === 'finished-task').data.done, true);
  assert.equal(payload.items_data.find(i => i.id === 'open-task').data.done, false);
  assert.equal(payload.items_data.find(i => i.id === 'finished-task').group_id, 'group-one');
});

await check('stale group completion actions are ignored while completing and reopening a task still works', async () => {
  const f = await groupFixture([rawGroup('group-one')], [
    { id: 'task-one', owner_id: 'account-a', group_id: 'group-one', data: { kind: 'task', title: 'Task', moduleId: 'module-one', due: '2026-12-04T12:00', reminder: 'none', done: false } }
  ]);
  await setupClick(f, 'toggle', { id: 'group-one' });
  assert.equal(f.context.__savedAccounts.length, 0);
  assert.equal(f.run("Object.hasOwn(state.items.find(i=>i.id==='group-one'),'done')"), false);
  await setupClick(f, 'toggle', { id: 'task-one' });
  assert.equal(f.run("state.items.find(i=>i.id==='task-one').done"), true);
  assert.equal(f.context.__savedAccounts.at(-1).payload.items_data[0].data.done, true);
  await setupClick(f, 'toggle', { id: 'task-one' });
  assert.equal(f.run("state.items.find(i=>i.id==='task-one').done"), false);
  assert.equal(f.context.__savedAccounts.at(-1).payload.items_data[0].data.done, false);
});

await check('legacy dated groups never count as tasks or calendar entries', async () => {
  const f = await groupFixture();
  f.run("state.items=[{id:'legacy-group',kind:'group',ownerId:'account-a',title:'Hidden dated group',moduleId:'module-one',memberIds:[],done:true,due:today+'T18:00',reminder:'none'},{id:'task-today',kind:'task',ownerId:'account-a',title:'Today task',moduleId:'module-one',priority:'Normal',due:today+'T18:00',reminder:'none',done:false},{id:'exam-today',kind:'exam',ownerId:'account-a',title:'Today exam',moduleId:'module-two',due:today+'T19:00',reminder:'none'}];");
  const home = f.run('home()');
  assert.match(home, /<strong>0%<\/strong>/);
  assert.match(home, /1 task left today\./);
  assert.doesNotMatch(home, /Hidden dated group/);
  assert.match(home, /Today task/); assert.match(home, /Today exam/);
  assert.match(home, /, 2 events"/);
});

async function deletionFixture(){
  const f=await groupFixture([], [{id:'kept-until-confirmed',owner_id:'account-a',group_id:null,data:{kind:'task',title:'Saved task',moduleId:'module-one',due:'2026-12-03T18:00',reminder:'none',done:false}}]);
  f.response={data:{session:{user:{id:'account-a'}}},error:null};
  f.context.__deleteCalls=[];
  f.context.__deleteResult={data:{deleted:true},error:null};
  f.run('accountClient.rpc=async(name,payload)=>{__deleteCalls.push({name,payload});return __deleteResult};');
  return f;
}
function deletionForm(f,overrides={}){
  let error='';
  const values={confirmationEmail:'student@example.test',confirmationPassword:'Synthetic-password-123',...overrides};
  const controls=Object.fromEntries(Object.entries(values).map(([name,value])=>[name,{name,value,setAttribute(){},focus(){},scrollIntoView(){}}]));
  const elements=Object.values(controls);elements.namedItem=name=>controls[name];
  const fields={disabled:false},submit={textContent:'Delete my account permanently'};
  const box={hidden:true,scrollIntoView(){},set textContent(value){error=value}};
  const form={elements,getAttribute(){return 'delete-account-form'},querySelector(selector){return selector==='fieldset'?fields:selector==='[type="submit"]'?submit:box}};
  f.context.__deletionForm=form;
  return {form,fields,submit,controls,get error(){return error}};
}
await check('account deletion is explicit, translated and cancellable without requests',async()=>{
  const f=await deletionFixture();
  for(const [code,label] of [['de','Mein Konto dauerhaft löschen'],['fr','Supprimer définitivement mon compte'],['it','Elimina definitivamente il mio account'],['en','Delete my account permanently']]){
    f.run('language='+JSON.stringify(code));
    assert.match(f.run('profile()'),/data-action="delete-account-open"/);
    const markup=f.run('accountDeletionMarkup()');
    assert.ok(markup.includes(label));
    assert.match(markup,/name="confirmationEmail"/);assert.match(markup,/autocomplete="current-password"/);
    assert.match(markup,/type="submit"/);
    assert.doesNotMatch(markup,/value="Synthetic-password/);
  }
  f.context.document.createElement=()=>({innerHTML:'',className:'',addEventListener(){},querySelector(){return null}});
  await setupClick(f,'delete-account-open');assert.equal(f.run('overlay.type'),'delete-account');
  await setupClick(f,'close');assert.equal(f.run('overlay'),null);
  assert.equal(f.requests.length,0);assert.equal(f.context.__deleteCalls.length,0);
});
await check('account deletion requires the current email and a password before any request',async()=>{
  const f=await deletionFixture();const before=f.run('JSON.stringify(state)');
  for(const values of [{confirmationEmail:'someone-else@example.test'},{confirmationPassword:''}]){
    const form=deletionForm(f,values);assert.equal(await f.run('submitAccountDeletion(__deletionForm)'),false);assert.ok(form.error);
  }
  assert.equal(f.requests.length,0);assert.equal(f.context.__deleteCalls.length,0);assert.equal(f.run('JSON.stringify(state)'),before);
});
await check('wrong password blocks deletion and releases the confirmation form',async()=>{
  const f=await deletionFixture();const form=deletionForm(f);const before=f.run('JSON.stringify(state)');
  f.response={data:{session:null},error:{code:'invalid_credentials'}};
  assert.equal(await f.run('submitAccountDeletion(__deletionForm)'),false);
  assert.match(form.error,/password is incorrect/);assert.equal(form.fields.disabled,false);
  assert.equal(form.controls.confirmationPassword.value,'');assert.equal(f.context.__deleteCalls.length,0);
  assert.equal(f.run('JSON.stringify(state)'),before);assert.equal(f.run('authBusy'),false);
});
await check('server failures preserve account data and give a retry path',async()=>{
  const f=await deletionFixture();const before=f.run('JSON.stringify(state)');
  for(const [result,message] of [
    [{error:{message:'STUDYFLOW_RECENT_SIGN_IN_REQUIRED'}},/password again/],
    [{error:{message:'STUDYFLOW_REVISION_CONFLICT'}},/reload the page/],
    [{data:null,error:null},/could not be completed/]
  ]){
    f.context.__deleteResult=result;const form=deletionForm(f);
    assert.equal(await f.run('submitAccountDeletion(__deletionForm)'),false);assert.match(form.error,message);
    assert.equal(form.fields.disabled,false);assert.equal(f.run('JSON.stringify(state)'),before);
  }
  assert.equal(f.requests.some(r=>r.method==='signout'),false);
});
await check('confirmed deletion signs in freshly, sends no password to SQL and returns to sign-in',async()=>{
  const f=await deletionFixture();deletionForm(f,{confirmationEmail:'  STUDENT@EXAMPLE.TEST  '});
  f.run('const originalDeletionSignout=accountClient.auth.signOut;accountClient.auth.signOut=async options=>{globalThis.__logoutOptions=options;return originalDeletionSignout()};');
  await f.events.get('submit')({preventDefault(){},target:f.context.__deletionForm});
  assert.equal(f.requests[0].method,'login');assert.equal(f.requests[0].payload.email,'student@example.test');
  assert.equal(f.context.__deleteCalls.length,1);const call=f.context.__deleteCalls[0];
  assert.equal(call.name,'studyflow_delete_account');
  assert.deepEqual(JSON.parse(JSON.stringify(call.payload)),{confirmation_email:'student@example.test',expected_revision:7});
  assert.equal(f.context.__logoutOptions.scope,'local');assert.equal(f.run('currentUser'),null);
  assert.equal(f.run('state.items.length'),0);assert.equal(f.run('cloudLoaded'),false);
  assert.match(f.app.innerHTML,/Your account has been deleted/);assert.equal(f.run('authBusy'),false);
  assert.equal([...f.deviceStorage.values()].some(value=>value.includes('Synthetic-password')),false);
  f.run('clearAccount()');assert.match(f.app.innerHTML,/Your account has been deleted/,'A delayed SIGNED_OUT callback must keep the deletion notice.');
});
await check('pending deletion prevents duplicate requests and closing the confirmation',async()=>{
  const f=await deletionFixture();const form=deletionForm(f);
  f.run("overlay={type:'delete-account'};accountClient.auth.signInWithPassword=()=>new Promise(resolve=>{globalThis.__finishPassword=resolve});");
  const pending=f.run('submitAccountDeletion(__deletionForm)');
  assert.equal(form.fields.disabled,true);assert.match(form.submit.textContent,/Deleting/);
  assert.equal(await f.run('submitAccountDeletion(__deletionForm)'),false);
  f.run('closeOverlay()');assert.equal(f.run('overlay.type'),'delete-account');
  f.context.__finishPassword({data:{session:{user:{id:'account-a'}}},error:null});
  assert.equal(await pending,true);assert.equal(f.context.__deleteCalls.length,1);
});
await check('switching accounts during password confirmation cannot delete the new account',async()=>{
  const f=await deletionFixture();deletionForm(f);
  f.run('accountClient.auth.signInWithPassword=()=>new Promise(resolve=>{globalThis.__finishPassword=resolve});');
  const pending=f.run('submitAccountDeletion(__deletionForm)');
  f.run("cancelPendingAccountDeletion();authEpoch++;currentUser={id:'account-b',email:'other@example.test'};state=emptyAccount(currentUser);state.items=[{id:'new-account-task'}];");
  f.context.__finishPassword({data:{session:{user:{id:'account-a'}}},error:null});
  assert.equal(await pending,false);assert.equal(f.context.__deleteCalls.length,0);
  assert.equal(f.run('currentUser.id'),'account-b');assert.equal(f.run('state.items[0].id'),'new-account-task');
});
await check('a deletion response for a previous account does not sign out or clear a new account',async()=>{
  const f=await deletionFixture();deletionForm(f);
  f.run('accountClient.rpc=()=>new Promise(resolve=>{globalThis.__finishDelete=resolve});');
  const pending=f.run('submitAccountDeletion(__deletionForm)');await new Promise(resolve=>setImmediate(resolve));
  assert.equal(typeof f.context.__finishDelete,'function');
  f.run("cancelPendingAccountDeletion();authEpoch++;currentUser={id:'account-b',email:'other@example.test'};state=emptyAccount(currentUser);state.items=[{id:'new-account-task'}];");
  f.context.__finishDelete({data:{deleted:true},error:null});
  assert.equal(await pending,false);assert.equal(f.requests.some(r=>r.method==='signout'),false);
  assert.equal(f.run('state.items[0].id'),'new-account-task');
});
await check('successful server deletion discards a local token even if logout is offline',async()=>{
  const f=await deletionFixture();deletionForm(f);
  f.deviceStorage.set('studyflow-account-rvzthkabxdxaftbwhvvz','synthetic-session');
  f.run("accountClient.auth.signOut=async()=>({error:{message:'Failed to fetch'}});");
  assert.equal(await f.run('submitAccountDeletion(__deletionForm)'),true);
  assert.equal(f.deviceStorage.has('studyflow-account-rvzthkabxdxaftbwhvvz'),false);
  assert.equal(f.deviceStorage.get('studyflow-interface-language'),'en');assert.equal(f.run('currentUser'),null);
});
await check('preserved tasks load as personal entries with their module and completion intact',async()=>{
  const f=await groupFixture([], [{id:'preserved-task',owner_id:'account-a',group_id:null,data:{kind:'task',title:'Preserved content',description:'Saved description',workType:'individual',groupId:'',moduleId:'former-group-module',moduleSnapshot:{id:'former-group-module',name:'Preserved module',code:'PRES',color:'#245b87'},done:true,due:'2026-12-03T18:00',reminder:'60'}}]);
  const card=f.run("overview('task')");assert.match(card,/Preserved content/);assert.match(card,/Preserved module/);
  assert.match(card,/card completed/);assert.equal(f.run("state.items[0].workType"),'individual');
  assert.equal(f.run("state.items[0].reminder"),'60');assert.equal(f.run("state.items[0].description"),'Saved description');
});

await check('International Business Administration can be selected during setup and survives a later login',async()=>{
  const f=await openSetup(fixture());
  assert.match(f.app.innerHTML,/<optgroup label="Bachelor programmes">/);
  assert.match(f.app.innerHTML,/<optgroup label="Master programmes">/);
  assert.match(f.app.innerHTML,/<option value="BSc International Business Administration"/);
  setupForm(f,{degree:'BSc International Business Administration',studyMode:'Full-time'});
  assert.equal(await f.run('submitSetup(__setupForm)'),true);
  await setupClick(f,'setup-add-module');
  const moduleId=f.run('setupDraft.modules[0].id');
  setupForm(f,{['moduleName:'+moduleId]:'Own IBA module'});
  assert.equal(await f.run('submitSetup(__setupForm)'),true);
  const saved=f.context.__savedAccounts.at(-1).payload;
  assert.equal(saved.settings.profile.degree,'BSc International Business Administration');
  assert.equal(saved.settings.profile.setupComplete,true);
  f.context.__accountTables.studyflow_settings={...saved.settings,revision:2};
  f.run('resetSetup();');await f.run('loadAccount()');f.run('render();');
  assert.equal(f.run('state.profile.degree'),'BSc International Business Administration');
  assert.equal(f.run('state.modules[0].name'),'Own IBA module');
  assert.doesNotMatch(f.app.innerHTML,/id="setup-form"/);
});
await check('a master selection saves without losing existing work or silently replacing a legacy degree',async()=>{
  const f=await groupFixture([], [{id:'kept-work',owner_id:'account-a',group_id:null,data:{kind:'task',title:'Keep this task',moduleId:'module-one',due:'2026-12-03T18:00',reminder:'none',done:false}}]);
  f.run("state.profile.degree='BSc Business Information Technology';");
  assert.match(f.run('degreeField(state.profile.degree)'),/<option value="BSc Business Information Technology" selected>/);
  assert.equal(f.run('state.profile.degree'),'BSc Business Information Technology');
  for(const [code,bachelor,master] of [['de','Bachelorstudiengänge','Masterstudiengänge'],['fr','Filières de bachelor','Filières de master'],['it','Corsi di bachelor','Corsi di master'],['en','Bachelor programmes','Master programmes']]){
    f.run('language='+JSON.stringify(code));
    const options=f.run("degreeField('MSc Business Administration')");
    assert.ok(options.includes('<optgroup label="'+bachelor+'">'));
    assert.ok(options.includes('<optgroup label="'+master+'">'));
    assert.match(options,/<option value="MSc Business Administration" selected>/);
    assert.doesNotMatch(options,/<input/);
  }
  f.run("language='en';");
  const values={name:'Student',degree:'MSc Business Administration',studyMode:'Full-time',semesterTerm:'Fall semester',semesterYear:'2026'};
  const elements=Object.entries(values).map(([name,value])=>({name,value,type:'text',setAttribute(){},removeAttribute(){},focus(){},scrollIntoView(){}}));
  elements.namedItem=name=>elements.find(el=>el.name===name);
  const error={hidden:true,scrollIntoView(){}};
  f.context.__degreeProfileForm={elements,getAttribute(){return 'profile-form'},querySelector(){return error},querySelectorAll(){return []}};
  assert.equal(await f.run('saveForm(__degreeProfileForm)'),true);
  const saved=f.context.__savedAccounts.at(-1).payload;
  assert.equal(saved.settings.profile.degree,'MSc Business Administration');
  assert.equal(saved.settings.modules[0].id,'module-one');
  assert.equal(saved.items_data[0].id,'kept-work');assert.equal(saved.items_data[0].data.title,'Keep this task');
  f.context.__accountTables.studyflow_settings={...saved.settings,revision:8};
  await f.run('loadAccount()');
  assert.equal(f.run('state.profile.degree'),'MSc Business Administration');
  assert.equal(f.run("degreeLabel(state.profile.degree)"),'MSc Business Administration');
});

console.log('All ' + passed + ' account, setup, degree, language, group and deletion checks passed. No network requests or emails were sent.');



