import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match => match[1]);
assert.equal(scripts.length, 2, 'The self-contained app must include the SDK and app scripts.');
for (const [index, code] of scripts.entries()) new vm.Script(code, { filename: 'inline-script-' + index + '.js' });

function fixture() {
  const requests = [], boots = [], events = new Map();
  let error = '', clientOptions, response = { data: { session: null }, error: null };
  const errorBox = { className: '', setAttribute() {}, scrollIntoView() {}, remove() {}, set textContent(value) { error = value; } };
  const contentView = { scrollTop: 0 };
  const app = {
    innerHTML: '', style: { setProperty() {} }, classList: { toggle() {} },
    querySelector(selector) { return selector === '.auth-error' && error ? errorBox : null; },
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
    document: { getElementById(id) { return id === 'setup-form' ? context.__setupForm : app; }, querySelector(selector) { return selector === '.content' ? contentView : null; }, createElement() { return errorBox; }, addEventListener() {} },
    window: { StudyFlowSupabase: { createClient(url, key, options) { clientOptions = options; return api; } }, addEventListener() {} },
    setInterval() {}, setTimeout(callback) { callback(); return 0; }, clearTimeout() {},
    __boots: boots
  });
  vm.runInContext(scripts[1], context);
  vm.runInContext('bootAccount = async session => { __boots.push(session); };', context);
  return {
    context, app, requests, boots, events,
    get error() { return error; },
    get options() { return clientOptions; },
    set response(value) { response = value; },
    run(code) { return vm.runInContext(code, context); },
    form(overrides = {}) {
      const values = { accountEmail: 'student@example.test', accountName: 'StudyFlow test', accountPassword: 'StudyFlow-check-123', accountPasswordConfirm: 'StudyFlow-check-123', ...overrides };
      const controls = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value, validity: { valid: key !== 'accountEmail' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) } }]));
      const button = { disabled: false, textContent: 'Create account', isConnected: true };
      const form = { elements: { namedItem(name) { return controls[name]; } }, querySelector() { return button; }, before() {}, getAttribute() { return 'account-form'; } };
      context.__form = form;
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
  assert.match(f.app.innerHTML, /Enter your study mode/);
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

console.log('All ' + passed + ' account and setup checks passed. No network requests or emails were sent.');



