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
  const errorBox = { className: '', setAttribute() {}, scrollIntoView() {}, set textContent(value) { error = value; } };
  const app = {
    innerHTML: '', style: { setProperty() {} }, classList: { toggle() {} },
    querySelector(selector) { return selector === '.auth-error' && error ? errorBox : null; },
    addEventListener(name, callback) { events.set(name, callback); }
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
    document: { getElementById() { return app; }, querySelector() { return null; }, createElement() { return errorBox; }, addEventListener() {} },
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

console.log('All ' + passed + ' account checks passed. No network requests or emails were sent.');


